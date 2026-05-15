"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Signal,
  Users,
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
      <div className="surface rounded-2xl border-dashed p-10 text-center">
        <div className="icon-glow mx-auto flex size-12 items-center justify-center rounded-xl text-primary">
          <Signal className="size-5" strokeWidth={2.2} />
        </div>
        <h3 className="mt-4 text-base font-semibold">No companies yet</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Use Find Companies to discover prospects matching this ICP.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {companies.map((company) => {
          const isExpanded = expanded.has(company.id);
          const persons = peopleByCompany.get(company.id) ?? [];
          return (
            <div
              key={company.id}
              className="surface overflow-hidden rounded-xl transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_oklch(0_0_0/0.35)]"
            >
              <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <button
                  onClick={() => toggle(company.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background/70 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  aria-label={isExpanded ? "Collapse company" : "Expand company"}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{company.name}</span>
                    {company.domain && (
                      <a
                        href={`https://${company.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {company.domain}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    {company.employeeRange && (
                      <Badge variant="secondary" className="text-xs">
                        {company.employeeRange}
                      </Badge>
                    )}
                    {company.geo && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <MapPin className="size-3" />
                        {company.geo}
                      </Badge>
                    )}
                  </div>
                  {company.matchReason && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {company.matchReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <Badge variant="outline" className="gap-1">
                    <Users className="size-3" />
                    {persons.length}
                  </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => findPeople(company)}
                  disabled={busyCompany === company.id}
                  className="ml-auto sm:ml-0"
                >
                  {busyCompany === company.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Users className="size-3.5" />
                  )}
                  <span>
                    {persons.length > 0 ? "Refresh people" : "Find people"}
                  </span>
                </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t bg-muted/25 px-3 py-3">
                  {persons.length === 0 ? (
                    <p className="rounded-lg border border-dashed bg-background/45 px-3 py-2 text-xs text-muted-foreground">
                      No people yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {persons
                        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                        .map((person) => {
                          const email = latestEmailByPerson.get(person.id);
                          return (
                            <li
                              key={person.id}
                              className="flex flex-col gap-2 rounded-lg border bg-background/65 px-3 py-2 sm:flex-row sm:items-center"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium truncate">
                                    {person.fullName}
                                  </span>
                                  {person.title && (
                                    <span className="truncate text-xs text-muted-foreground">
                                      {person.title}
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
                                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                      LinkedIn
                                      <ExternalLink className="size-3" />
                                    </a>
                                  )}
                                </div>
                                {person.scoreReason && (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
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
                                    <Mail className="size-3.5" />
                                    <span>
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
                                  className="sm:shrink-0"
                                >
                                  {drafting === person.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Mail className="size-3.5" />
                                  )}
                                  <span>Draft email</span>
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
