"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lead, decideLead, isAdminUnlockError } from "@/lib/api";
import { PREVIEW_ONLY_TOAST, showToast } from "@/lib/toast";

interface LeadActionPanelProps {
  lead: Lead;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}

export function LeadActionPanel({ lead, onClose, onDone }: LeadActionPanelProps) {
  const [busy, setBusy] = useState<"call" | "claim" | "reject" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "call" | "claim" | "reject") => {
    setBusy(action);
    setNote(null);
    setError(null);
    try {
      const result = await decideLead(lead.id, action);
      setNote(result.message);
      await onDone();
    } catch (err) {
      if (isAdminUnlockError(err)) {
        showToast(PREVIEW_ONLY_TOAST);
      } else {
        setError(err instanceof Error ? err.message : "That action did not finish.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center gap-6 rounded-lg border border-white/10 bg-zinc-950/75 px-5 text-white shadow-lg backdrop-blur-[2px]">
      <p className="min-w-0 flex-1 truncate text-lg font-semibold text-white">
        How to call {lead.name}?
        {(note || error) && (
          <span className={`ml-3 text-sm font-normal ${error ? "text-red-300" : "text-white/70"}`}>
            {error || note}
          </span>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" className="bg-white text-zinc-950 hover:bg-white/90" disabled={busy !== null} onClick={() => run("call")}>
          {busy === "call" ? "Calling..." : "Voice Agent"}
        </Button>
        <Button type="button" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white" disabled={busy !== null} onClick={() => run("claim")}>
          {busy === "claim" ? "Saving..." : "Myself"}
        </Button>
        <Button type="button" variant="destructive" className="bg-destructive text-white hover:bg-destructive/90 hover:text-white" disabled={busy !== null} onClick={() => run("reject")}>
          {busy === "reject" ? "Removing..." : "Remove"}
        </Button>
        <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" disabled={busy !== null} onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
