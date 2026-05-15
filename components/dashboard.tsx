"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Icp, IcpDetail } from "@/lib/types";
import { IcpSidebar } from "./icp-sidebar";
import { IcpFormDialog } from "./icp-form-dialog";
import { ActiveIcpPane } from "./active-icp-pane";
import { ShaderBackground } from "@/components/ui/shader-background";

export function Dashboard() {
  const [icps, setIcps] = useState<Icp[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IcpDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Icp | null>(null);

  const fetchIcps = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/icps");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Icp[];
      setIcps(data);
      if (data.length > 0 && (!activeId || !data.find((i) => i.id === activeId))) {
        setActiveId(data[0].id);
      } else if (data.length === 0) {
        setActiveId(null);
        setDetail(null);
      }
    } catch (err) {
      toast.error("Failed to load ICPs", { description: String(err) });
    } finally {
      setLoadingList(false);
    }
  }, [activeId]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/icps/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as IcpDetail;
      setDetail(data);
    } catch (err) {
      toast.error("Failed to load ICP detail", { description: String(err) });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void fetchIcps(), 0);
    return () => window.clearTimeout(id);
  }, [fetchIcps]);

  useEffect(() => {
    if (!activeId) return;
    const id = window.setTimeout(() => void fetchDetail(activeId), 0);
    return () => window.clearTimeout(id);
  }, [activeId, fetchDetail]);

  const handleSaved = async (saved: Icp) => {
    await fetchIcps();
    setActiveId(saved.id);
    setCreateOpen(false);
    setEditTarget(null);
    toast.success("ICP saved");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this ICP and all its companies/people/emails?")) return;
    const res = await fetch(`/api/icps/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("ICP deleted");
    if (activeId === id) setActiveId(null);
    await fetchIcps();
  };

  return (
    <div className="relative flex min-h-dvh flex-1 p-4 text-foreground sm:p-6 lg:p-8">
      <ShaderBackground />
      <div className="glass-surface shine-border mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl md:min-h-[calc(100dvh-3rem)] md:flex-row lg:min-h-[calc(100dvh-4rem)]">
        <IcpSidebar
          icps={icps}
          activeId={activeId}
          loading={loadingList}
          onSelect={setActiveId}
          onCreate={() => setCreateOpen(true)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {detail ? (
            <ActiveIcpPane
              detail={detail}
              loading={loadingDetail}
              onEdit={() => setEditTarget(detail.icp)}
              onDelete={() => handleDelete(detail.icp.id)}
              onRefresh={() => fetchDetail(detail.icp.id)}
            />
          ) : loadingList ? (
            <div className="flex min-h-[420px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading workspace
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center p-8">
              <div className="max-w-sm rounded-lg border bg-card/80 p-5 text-center shadow-sm">
                <h2 className="text-base font-semibold">No ICP selected</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create one in the sidebar to start discovering companies and contacts.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      <IcpFormDialog
        open={createOpen || editTarget !== null}
        initial={editTarget}
        onClose={() => {
          setCreateOpen(false);
          setEditTarget(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}
