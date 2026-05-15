"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Email, EmailJudgment, JudgeDimension, Person } from "@/lib/types";

export function EmailDrawer({
  person,
  email,
  onClose,
  onChanged,
}: {
  person: Person | null;
  email: Email | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [toAddress, setToAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!email) {
      setToAddress("");
      setSubject("");
      setBody("");
      return;
    }
    setToAddress(email.toAddress ?? "");
    setSubject(email.subject);
    setBody(email.body);
  }, [email]);

  const open = person !== null && email !== null;
  const isSent = email?.status === "sent";

  const handleSave = async () => {
    if (!email) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toAddress: toAddress.trim() || null,
          subject,
          body,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await onChanged();
      toast.success("Draft saved");
    } catch (err) {
      toast.error("Failed to save", { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!email) return;
    if (!toAddress.trim() || !subject.trim() || !body.trim()) {
      toast.error("To, subject, and body are all required");
      return;
    }
    if (!confirm(`Send to ${toAddress}?`)) return;
    setSending(true);
    try {
      // Save edits first
      await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAddress, subject, body }),
      });
      const res = await fetch(`/api/emails/${email.id}/send`, { method: "POST" });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      await onChanged();
      toast.success("Email sent");
      onClose();
    } catch (err) {
      toast.error("Failed to send", { description: String(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-xl flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Email draft
            {isSent && <Badge>Sent</Badge>}
            {email?.status === "failed" && <Badge variant="destructive">Failed</Badge>}
          </SheetTitle>
          {person && (
            <SheetDescription>
              To {person.fullName}
              {person.title ? `, ${person.title}` : ""}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="to">To (email address)</Label>
            <Input
              id="to"
              type="email"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="jane@company.com"
              disabled={isSent}
            />
            <p className="text-xs text-muted-foreground">
              LinkedIn doesn&apos;t expose personal emails — paste it here before sending.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSent}
            />
            <p className="text-xs text-muted-foreground">{subject.length} chars</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              disabled={isSent}
              className="font-mono text-sm"
            />
          </div>
          {email?.errorMessage && (
            <p className="text-xs text-destructive">{email.errorMessage}</p>
          )}

          {email?.judgeResult && (
            <JudgmentPanel judgment={email.judgeResult as EmailJudgment} />
          )}
        </div>

        <Separator />
        <SheetFooter className="flex-row gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving || isSent}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span className={saving ? "ml-1" : ""}>Save draft</span>
            </Button>
            <Button onClick={handleSend} disabled={sending || isSent || !toAddress.trim()}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span className="ml-1">{isSent ? "Sent" : "Send"}</span>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function scoreColor(score: number) {
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number) {
  if (score >= 8) return "bg-green-500/20";
  if (score >= 6) return "bg-yellow-500/20";
  return "bg-red-500/20";
}

function ScoreBar({ label, dim }: { label: string; dim: JudgeDimension }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className={`text-xs font-semibold ${scoreColor(dim.score)}`}>
          {dim.score}/10
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBg(dim.score)}`}
          style={{ width: `${dim.score * 10}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{dim.feedback}</p>
    </div>
  );
}

function JudgmentPanel({ judgment }: { judgment: EmailJudgment }) {
  const dimensions: { label: string; dim: JudgeDimension; weight: string }[] = [
    { label: "Personalization", dim: judgment.personalization, weight: "30%" },
    { label: "Clarity", dim: judgment.clarity, weight: "20%" },
    { label: "CTA Quality", dim: judgment.cta, weight: "20%" },
    { label: "Tone", dim: judgment.tone, weight: "20%" },
  ];

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Quality Score</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {judgment.wordCount} words
          </span>
          <span
            className={`text-lg font-bold ${scoreColor(judgment.overall.score)}`}
          >
            {judgment.overall.score}/10
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{judgment.overall.feedback}</p>
      <Separator />
      <div className="space-y-3">
        {dimensions.map(({ label, dim, weight }) => (
          <ScoreBar key={label} label={`${label} (${weight})`} dim={dim} />
        ))}
      </div>
    </div>
  );
}
