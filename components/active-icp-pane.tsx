"use client";

import { useState } from "react";
import { Pencil, Trash2, Sparkles, Loader2 } from "lucide-react";
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
}: {
  detail: IcpDetail;
  loading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void | Promise<void>;
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
    <div className="max-w-5xl">
      <header className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold truncate">{icp.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {companies.length} companies · {people.length} people · {emails.length} emails
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            <span className="ml-1">Edit</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            <span className="ml-1">Delete</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {icp.industries.map((x) => (
          <Badge key={`ind-${x}`} variant="secondary">{x}</Badge>
        ))}
        {(icp.minEmployees != null || icp.maxEmployees != null) && (
          <Badge variant="secondary">
            {icp.minEmployees ?? "?"}–{icp.maxEmployees ?? "?"} employees
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
        <div className="text-sm text-muted-foreground space-y-2 mb-4">
          {icp.buyerPersona && <p><span className="font-medium text-foreground">Persona:</span> {icp.buyerPersona}</p>}
          {icp.extraContext && <p><span className="font-medium text-foreground">Context:</span> {icp.extraContext}</p>}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Button onClick={handleDiscoverCompanies} disabled={discovering || running}>
          {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span className="ml-1">Find Companies</span>
        </Button>
        <Button variant="outline" onClick={handleRunPipeline} disabled={running || discovering}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span className="ml-1">Run Full Pipeline</span>
        </Button>
        {progress && (
          <span className="text-xs text-muted-foreground truncate">{progress}</span>
        )}
      </div>

      <Separator className="my-4" />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <CompaniesSection detail={detail} onRefresh={onRefresh} />
      )}
    </div>
  );
}
