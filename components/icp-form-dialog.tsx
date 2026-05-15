"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Icp } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  name: string;
  industries: string;
  minEmployees: string;
  maxEmployees: string;
  geos: string;
  techKeywords: string;
  targetTitles: string;
  buyerPersona: string;
  extraContext: string;
};

const emptyForm: FormState = {
  name: "",
  industries: "",
  minEmployees: "",
  maxEmployees: "",
  geos: "",
  techKeywords: "",
  targetTitles: "",
  buyerPersona: "",
  extraContext: "",
};

function fromIcp(icp: Icp): FormState {
  return {
    name: icp.name,
    industries: icp.industries.join(", "),
    minEmployees: icp.minEmployees?.toString() ?? "",
    maxEmployees: icp.maxEmployees?.toString() ?? "",
    geos: icp.geos.join(", "),
    techKeywords: icp.techKeywords.join(", "),
    targetTitles: icp.targetTitles.join(", "),
    buyerPersona: icp.buyerPersona,
    extraContext: icp.extraContext,
  };
}

const splitCsv = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const parseIntOrNull = (s: string) => {
  if (!s.trim()) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

export function IcpFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Icp | null;
  onClose: () => void;
  onSaved: (icp: Icp) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const editing = initial !== null;

  useEffect(() => {
    if (open) setForm(initial ? fromIcp(initial) : emptyForm);
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        industries: splitCsv(form.industries),
        minEmployees: parseIntOrNull(form.minEmployees),
        maxEmployees: parseIntOrNull(form.maxEmployees),
        geos: splitCsv(form.geos),
        techKeywords: splitCsv(form.techKeywords),
        targetTitles: splitCsv(form.targetTitles),
        buyerPersona: form.buyerPersona,
        extraContext: form.extraContext,
      };
      const url = editing ? `/api/icps/${initial!.id}` : "/api/icps";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      const saved = (await res.json()) as Icp;
      onSaved(saved);
    } catch (err) {
      toast.error("Failed to save", { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit ICP" : "New ICP"}</DialogTitle>
          <DialogDescription>
            Describe who you want to reach. Comma-separated lists where shown.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Fintech Series A"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industries">Industries</Label>
            <Input
              id="industries"
              value={form.industries}
              onChange={(e) => setForm({ ...form, industries: e.target.value })}
              placeholder="fintech, payments, lending"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="min">Min employees</Label>
              <Input
                id="min"
                type="number"
                value={form.minEmployees}
                onChange={(e) => setForm({ ...form, minEmployees: e.target.value })}
                placeholder="20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max">Max employees</Label>
              <Input
                id="max"
                type="number"
                value={form.maxEmployees}
                onChange={(e) => setForm({ ...form, maxEmployees: e.target.value })}
                placeholder="200"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="geos">Geographies</Label>
            <Input
              id="geos"
              value={form.geos}
              onChange={(e) => setForm({ ...form, geos: e.target.value })}
              placeholder="US, Canada, UK"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tech">Tech keywords</Label>
            <Input
              id="tech"
              value={form.techKeywords}
              onChange={(e) => setForm({ ...form, techKeywords: e.target.value })}
              placeholder="Stripe, Plaid, React"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="titles">Target titles</Label>
            <Input
              id="titles"
              value={form.targetTitles}
              onChange={(e) => setForm({ ...form, targetTitles: e.target.value })}
              placeholder="VP Sales, Head of GTM, Director of Marketing"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="persona">Buyer persona</Label>
            <Textarea
              id="persona"
              value={form.buyerPersona}
              onChange={(e) => setForm({ ...form, buyerPersona: e.target.value })}
              placeholder="Owns the outbound number, scaling from 5 to 25 reps, frustrated with data quality…"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="extra">Extra context</Label>
            <Textarea
              id="extra"
              value={form.extraContext}
              onChange={(e) => setForm({ ...form, extraContext: e.target.value })}
              placeholder="Anything else — typical pain points, why now, recent triggers…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create ICP"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
