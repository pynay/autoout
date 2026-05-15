"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Users,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { consumeSse } from "@/lib/sse";
import type { Company, IcpDetail, Person, Email } from "@/lib/types";
import { EmailDrawer } from "./email-drawer";

export function CompaniesSection({
  detail,
  onRefresh,
}: {
  detail: IcpDetail;
  onRefresh: () => void | Promise<void>;
}) {
  const { companies, people, emails } = detail;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyCompany, setBusyCompany] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [emailDrawerPerson, setEmailDrawerPerson] = useState<Person | null>(null);

  const peopleByCompany = new Map<string, Person[]>();
  for (const p of people) {
    const list = peopleByCompany.get(p.companyId) ?? [];
    list.push(p);
    peopleByCompany.set(p.companyId, list);
  }

  const latestEmailByPerson = new Map<string, Email>();
  for (const e of [...emails].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )) {
    if (!latestEmailByPerson.has(e.personId)) latestEmailByPerson.set(e.personId, e);
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const findPeople = async (company: Company) => {
    setBusyCompany(company.id);
    try {
      const res = await fetch(`/api/companies/${company.id}/discover-people`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await consumeSse(res, (event, data) => {
        if (event === "error" && data && typeof data === "object" && "message" in data) {
          throw new Error(String((data as { message: unknown }).message));
        }
      });
      await onRefresh();
      setExpanded((prev) => new Set(prev).add(company.id));
      toast.success(`Found people at ${company.name}`);
    } catch (err) {
      toast.error("Failed to find people", { description: String(err) });
    } finally {
      setBusyCompany(null);
    }
  };

  const draftEmail = async (person: Person) => {
    setDrafting(person.id);
    try {
      const res = await fetch(`/api/people/${person.id}/draft-email`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onRefresh();
      toast.success("Draft created");
      // Open drawer after refresh — caller will repopulate with latest email
      setEmailDrawerPerson(person);
    } catch (err) {
      toast.error("Failed to draft", { description: String(err) });
    } finally {
      setDrafting(null);
    }
  };

  if (companies.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No companies yet. Click <span className="font-medium">Find Companies</span> above to discover prospects matching this ICP.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {companies.map((company) => {
          const isExpanded = expanded.has(company.id);
          const persons = peopleByCompany.get(company.id) ?? [];
          return (
            <div key={company.id} className="border rounded-md">
              <div className="flex items-center gap-2 p-3">
                <button
                  onClick={() => toggle(company.id)}
                  className="p-0.5 hover:bg-accent rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{company.name}</span>
                    {company.domain && (
                      <a
                        href={`https://${company.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                      >
                        {company.domain}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {company.employeeRange && (
                      <Badge variant="secondary" className="text-xs">
                        {company.employeeRange}
                      </Badge>
                    )}
                    {company.geo && (
                      <Badge variant="secondary" className="text-xs">
                        {company.geo}
                      </Badge>
                    )}
                  </div>
                  {company.matchReason && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {company.matchReason}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => findPeople(company)}
                  disabled={busyCompany === company.id}
                >
                  {busyCompany === company.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1">
                    {persons.length > 0 ? "Refresh people" : "Find people"}
                  </span>
                </Button>
              </div>
              {isExpanded && (
                <div className="border-t bg-muted/30 px-3 py-2">
                  {persons.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">No people yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {persons
                        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                        .map((person) => {
                          const email = latestEmailByPerson.get(person.id);
                          return (
                            <li
                              key={person.id}
                              className="flex items-center gap-2 py-1"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">
                                    {person.fullName}
                                  </span>
                                  {person.title && (
                                    <span className="text-xs text-muted-foreground truncate">
                                      · {person.title}
                                    </span>
                                  )}
                                  {person.score != null && (
                                    <Badge variant="outline" className="text-xs">
                                      {person.score}
                                    </Badge>
                                  )}
                                  {person.linkedinUrl && (
                                    <a
                                      href={person.linkedinUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                                    >
                                      LinkedIn
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                                {person.scoreReason && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {person.scoreReason}
                                  </p>
                                )}
                              </div>
                              {email ? (
                                <div className="flex items-center gap-1.5">
                                  {email.judgeResult && (
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${
                                        (email.judgeResult as { overall: { score: number } }).overall.score >= 8
                                          ? "border-green-500/50 text-green-600 dark:text-green-400"
                                          : (email.judgeResult as { overall: { score: number } }).overall.score >= 6
                                            ? "border-yellow-500/50 text-yellow-600 dark:text-yellow-400"
                                            : "border-red-500/50 text-red-600 dark:text-red-400"
                                      }`}
                                    >
                                      {(email.judgeResult as { overall: { score: number } }).overall.score}/10
                                    </Badge>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEmailDrawerPerson(person)}
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                    <span className="ml-1">
                                      {email.status === "sent" ? "Sent" : "View draft"}
                                    </span>
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => draftEmail(person)}
                                  disabled={drafting === person.id}
                                >
                                  {drafting === person.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Mail className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1">Draft email</span>
                                </Button>
                              )}
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <EmailDrawer
        person={emailDrawerPerson}
        email={emailDrawerPerson ? latestEmailByPerson.get(emailDrawerPerson.id) ?? null : null}
        onClose={() => setEmailDrawerPerson(null)}
        onChanged={onRefresh}
      />
    </>
  );
}
