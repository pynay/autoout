"use client";

import { Plus } from "lucide-react";
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
    <aside className="w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="px-4 py-4 border-b">
        <h1 className="font-semibold text-base">Autoout</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Outbound on autopilot</p>
      </div>
      <div className="px-3 py-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          ICPs
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />
          <span className="ml-1 text-xs">New</span>
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">Loading…</div>
        ) : icps.length === 0 ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            No ICPs yet.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {icps.map((icp) => (
              <li key={icp.id}>
                <button
                  onClick={() => onSelect(icp.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-md text-sm",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    activeId === icp.id &&
                      "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  )}
                >
                  {icp.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
