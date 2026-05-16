"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Globe, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Icp } from "@/lib/types";

type Lesson = {
  id: string;
  icpId: string | null;
  lesson: string;
  usageCount: number;
  lastUsedAt: string;
  createdAt: string;
};

export function LessonsDialog({
  open,
  onClose,
  icps,
  activeIcpId,
}: {
  open: boolean;
  onClose: () => void;
  icps: Icp[];
  activeIcpId: string | null;
}) {
  const [tab, setTab] = useState<"icp" | "global">(activeIcpId ? "icp" : "global");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLesson, setNewLesson] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchLessons = useCallback(async () => {
    setLoading(true);
    try {
      const params = tab === "icp" && activeIcpId ? `?icpId=${activeIcpId}` : "";
      const res = await fetch(`/api/lessons${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLessons(await res.json());
    } catch (err) {
      toast.error("Failed to load lessons", { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, [tab, activeIcpId]);

  useEffect(() => {
    if (open) fetchLessons();
  }, [open, fetchLessons]);

  const handleAdd = async () => {
    if (!newLesson.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson: newLesson.trim(),
          icpId: tab === "icp" ? activeIcpId : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewLesson("");
      await fetchLessons();
      toast.success("Lesson added");
    } catch (err) {
      toast.error("Failed to add", { description: String(err) });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/lessons/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setLessons((prev) => prev.filter((l) => l.id !== id));
      toast.success("Lesson removed");
    } catch (err) {
      toast.error("Failed to delete", { description: String(err) });
    }
  };

  const activeIcp = icps.find((i) => i.id === activeIcpId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4" />
            Style Lessons
          </DialogTitle>
          <DialogDescription>
            Patterns learned from your edits. These guide future email drafts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
          <button
            onClick={() => setTab("icp")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "icp"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {activeIcp?.name ?? "ICP"} lessons
          </button>
          <button
            onClick={() => setTab("global")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "global"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="mr-1 inline size-3" />
            Global lessons
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading
            </div>
          ) : lessons.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              {tab === "global"
                ? "No global lessons yet. Add one below or edit drafts to teach the system."
                : "No lessons for this ICP yet. Edit and save/send drafts to teach the system."}
            </div>
          ) : (
            lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="group flex items-start gap-2 rounded-lg border bg-background/60 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed">{lesson.lesson}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      used {lesson.usageCount}x
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      last used {new Date(lesson.lastUsedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(lesson.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Delete lesson"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 border-t pt-3">
          <Input
            value={newLesson}
            onChange={(e) => setNewLesson(e.target.value)}
            placeholder={`Add a ${tab === "global" ? "global" : ""} style preference...`}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={adding || !newLesson.trim()}
          >
            {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            <span>Add</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
