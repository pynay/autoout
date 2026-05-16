"use client";

import { useState, type ComponentType } from "react";
import { BookOpen, Building2, Loader2, Mail, Pencil, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CompaniesSection } from "./companies-section";
import type { IcpDetail } from "@/lib/types";
import { consumeSse } from "@/lib/sse";

export function ActiveIcpPane({
  detail,
  loading,
  onEdit,
  onDelete,
  onRefresh,
  onOpenLessons,
}: {
  detail: IcpDetail;
  loading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void | Promise<void>;
  onOpenLessons: () => void;
}) {
  const { icp, companies, people, emails } = detail;
  const [discovering, setDiscovering] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleDiscoverCompanies = async () => {
    setDiscovering(true);
    setProgress("Starting Claude…");
    try {
      const res = await fetch(`/api/icps/${icp.id}/discover-companies`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let discoveredCount = 0;
      await consumeSse(res, (event, data) => {
        if (event === "progress" && typeof data === "object" && data && "message" in data) {
          setProgress(String((data as { message: unknown }).message));
        } else if (event === "search" && typeof data === "object" && data && "query" in data) {
          setProgress(`Searching: ${(data as { query: unknown }).query}`);
        } else if (event === "done") {
          if (typeof data === "object" && data && "count" in data) {
            discoveredCount = Number((data as { count: unknown }).count) || 0;
          }
          setProgress(null);
        } else if (event === "error" && typeof data === "object" && data && "message" in data) {
          throw new Error(String((data as { message: unknown }).message));
        }
      });
      await onRefresh();
      if (discoveredCount === 0) {
        toast.warning("No companies found", {
          description: "Try a more specific ICP or broader filters.",
        });
      } else {
        toast.success(`Discovered ${discoveredCount} companies`);
      }
    } catch (err) {
      toast.error("Discovery failed", { description: String(err) });
    } finally {
      setDiscovering(false);
      setProgress(null);
    }
  };

  const handleRunPipeline = async () => {
    setRunning(true);
    try {
      // 1. Discover companies
      setProgress("Discovering companies…");
      const dRes = await fetch(`/api/icps/${icp.id}/discover-companies`, { method: "POST" });
      if (!dRes.ok) throw new Error(`Discover failed: HTTP ${dRes.status}`);
      let discoveredIds: string[] = [];
      await consumeSse(dRes, (event, data) => {
        if (event === "done" && data && typeof data === "object" && "companyIds" in data) {
          discoveredIds = (data as { companyIds: string[] }).companyIds;
        } else if (event === "error" && data && typeof data === "object" && "message" in data) {
          throw new Error(String((data as { message: unknown }).message));
        }
      });
      await onRefresh();

      // 2. For each (cap 5), find people
      const targetCompanies = discoveredIds.slice(0, 5);
      const peopleIdsByCompany: Record<string, string[]> = {};
      for (const cid of targetCompanies) {
        setProgress(`Finding people at company ${cid.slice(0, 8)}…`);
        const pRes = await fetch(`/api/companies/${cid}/discover-people`, { method: "POST" });
        if (!pRes.ok) continue;
        let pids: string[] = [];
        await consumeSse(pRes, (event, data) => {
          if (event === "done" && data && typeof data === "object" && "personIds" in data) {
            pids = (data as { personIds: string[] }).personIds;
          }
        });
        peopleIdsByCompany[cid] = pids;
      }
      await onRefresh();

      // 3. Draft email for top person at each company
      for (const cid of targetCompanies) {
        const topPerson = (peopleIdsByCompany[cid] ?? [])[0];
        if (!topPerson) continue;
        setProgress(`Drafting email for person ${topPerson.slice(0, 8)}…`);
        await fetch(`/api/people/${topPerson}/draft-email`, { method: "POST" });
      }
      await onRefresh();
      toast.success("Pipeline complete");
    } catch (err) {
      toast.error("Pipeline failed", { description: String(err) });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
      <header className="surface-elevated rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary backdrop-blur">
              <Sparkles className="size-3.5" strokeWidth={2.5} />
              Active ICP
            </div>
            <h2 className="gradient-text truncate text-4xl font-bold tracking-tight sm:text-5xl">
              {icp.name}
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Build a prospect list, rank contacts, and draft outreach from one focused segment.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onOpenLessons}>
              <BookOpen className="size-3.5" />
              <span>Lessons</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" />
              <span>Edit</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric icon={Building2} label="Companies" value={companies.length} />
          <Metric icon={Users} label="People" value={people.length} />
          <Metric icon={Mail} label="Emails" value={emails.length} />
        </div>
      </header>

      <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="surface rounded-2xl p-5 sm:p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Targeting
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {icp.industries.map((x) => (
              <Badge key={`ind-${x}`} variant="secondary">{x}</Badge>
            ))}
            {(icp.minEmployees != null || icp.maxEmployees != null) && (
              <Badge variant="secondary">
                {icp.minEmployees ?? "?"}-{icp.maxEmployees ?? "?"} employees
              </Badge>
            )}
            {icp.geos.map((x) => (
              <Badge key={`geo-${x}`} variant="secondary">{x}</Badge>
            ))}
            {icp.targetTitles.map((x) => (
              <Badge key={`title-${x}`} variant="outline">{x}</Badge>
            ))}
          </div>

          {(icp.buyerPersona || icp.extraContext) && (
            <div className="mt-5 space-y-3 border-t border-border/50 pt-4 text-sm leading-relaxed text-muted-foreground">
              {icp.buyerPersona && (
                <p>
                  <span className="font-semibold text-foreground">Persona · </span>
                  {icp.buyerPersona}
                </p>
              )}
              {icp.extraContext && (
                <p>
                  <span className="font-semibold text-foreground">Context · </span>
                  {icp.extraContext}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="surface-elevated rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Actions
            </div>
            {(discovering || running) && (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Run discovery in steps or launch the full prospecting pass.
          </p>
          <div className="mt-5 grid gap-2.5">
            <button
              onClick={handleDiscoverCompanies}
              disabled={discovering || running}
              className="btn-glow inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {discovering ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" strokeWidth={2.4} />
              )}
              <span>Find Companies</span>
            </button>
            <button
              onClick={handleRunPipeline}
              disabled={running || discovering}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/40 px-4 text-[13.5px] font-semibold text-foreground backdrop-blur transition-colors hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" strokeWidth={2.2} />
              )}
              <span>Run Full Pipeline</span>
            </button>
          </div>
          {progress && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-xs text-foreground/85">
              <span className="relative flex size-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              <span className="truncate">{progress}</span>
            </div>
          )}
        </div>
      </section>

      <div className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Pipeline
            </div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              Prospect pipeline
            </h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Companies, contacts, and draft status for this ICP.
            </p>
          </div>
        </div>
        <Separator className="mb-4 bg-border/50" />

        {loading ? (
          <div className="surface flex items-center gap-2 rounded-xl p-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading pipeline
          </div>
        ) : (
          <CompaniesSection detail={detail} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="surface group relative overflow-hidden rounded-xl p-4 transition-all hover:border-primary/30">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/10 opacity-60 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="gradient-text-accent text-[40px] font-bold leading-none tabular-nums tracking-tight">
            {value}
          </div>
          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </div>
        </div>
        <div className="icon-glow flex size-10 shrink-0 items-center justify-center rounded-xl text-primary">
          <Icon className="size-4" strokeWidth={2.2} />
        </div>
      </div>
    </div>
  );
}
