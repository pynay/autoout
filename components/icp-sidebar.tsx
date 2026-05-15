"use client";

import { Building2, Plus, Sparkles } from "lucide-react";
import type { Icp } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function IcpSidebar({
  icps,
  activeId,
  loading,
  onSelect,
  onCreate,
}: {
  icps: Icp[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar/40 text-sidebar-foreground backdrop-blur-xl md:w-72 md:border-b-0 md:border-r">
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="icon-glow flex size-10 items-center justify-center rounded-xl text-primary">
            <Sparkles className="size-[18px]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">
              Autoout
            </h1>
            <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Outbound OS
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between px-4 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Segments
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground font-medium tabular-nums">{icps.length}</span> saved
          </div>
        </div>
        <button
          onClick={onCreate}
          className="btn-glow inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium"
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
          <span>New</span>
        </button>
      </div>
      <nav className="max-h-72 flex-1 overflow-y-auto px-3 pb-4 md:max-h-none">
        {loading ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">Loading…</div>
        ) : icps.length === 0 ? (
          <div className="mx-1 rounded-xl border border-dashed border-sidebar-border bg-sidebar/30 p-4 text-xs text-muted-foreground">
            No ICPs yet. Create a segment to start prospecting.
          </div>
        ) : (
          <ul className="space-y-1">
            {icps.map((icp) => (
              <li key={icp.id}>
                <button
                  onClick={() => onSelect(icp.id)}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm transition-all",
                    "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    activeId === icp.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground ring-card-active"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {activeId === icp.id && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-primary/40" />
                  )}
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      activeId === icp.id
                        ? "icon-glow text-primary"
                        : "bg-sidebar-accent/40 text-muted-foreground group-hover:bg-sidebar-accent group-hover:text-foreground",
                    )}
                  >
                    <Building2 className="size-4" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13.5px] font-medium",
                        activeId === icp.id ? "text-foreground" : "text-foreground/85",
                      )}
                    >
                      {icp.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {icp.industries.slice(0, 2).join(" · ") || "Prospect segment"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
