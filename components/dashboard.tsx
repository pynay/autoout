"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Icp, IcpDetail } from "@/lib/types";
import { IcpSidebar } from "./icp-sidebar";
import { IcpFormDialog } from "./icp-form-dialog";
import { ActiveIcpPane } from "./active-icp-pane";

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
    fetchIcps();
  }, [fetchIcps]);

  useEffect(() => {
    if (activeId) fetchDetail(activeId);
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
    <div className="flex flex-1 min-h-0">
      <IcpSidebar
        icps={icps}
        activeId={activeId}
        loading={loadingList}
        onSelect={setActiveId}
        onCreate={() => setCreateOpen(true)}
      />
      <main className="flex-1 min-w-0 overflow-y-auto p-6">
        {detail ? (
          <ActiveIcpPane
            detail={detail}
            loading={loadingDetail}
            onEdit={() => setEditTarget(detail.icp)}
            onDelete={() => handleDelete(detail.icp.id)}
            onRefresh={() => fetchDetail(detail.icp.id)}
          />
        ) : loadingList ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <div className="text-muted-foreground text-sm">
            No ICP selected. Create one in the sidebar to get started.
          </div>
        )}
      </main>

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
