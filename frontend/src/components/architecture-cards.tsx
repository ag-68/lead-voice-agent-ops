"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CardId = "stack" | "features" | "endpoints";

const edge = {
  stack: "border-t-emerald-500",
  features: "border-t-rose-500",
  endpoints: "border-t-teal-500",
} as const;

const CARDS: {
  id: CardId;
  title: string;
  lines: { label: string; text: string }[];
}[] = [
  {
    id: "stack",
    title: "Tech Stack",
    lines: [
      { label: "Backend", text: "FastAPI and SQLite. Next.js in the browser." },
      { label: "Model", text: "Claude, OpenAI, Gemini, Groq, or compatible." },
      { label: "Reach-out", text: "ElevenLabs dial + post-call webhook." },
    ],
  },
  {
    id: "features",
    title: "Key Features",
    lines: [
      { label: "Intake", text: "A webhook or this page saves the lead." },
      { label: "Score", text: "Chosen model scores; booking LLM reads the call." },
      { label: "Demos", text: "Booked Demo state and Booked Demos tab." },
    ],
  },
  {
    id: "endpoints",
    title: "API Endpoints",
    lines: [
      { label: "Leads", text: "Create, list, decide, stats, remove." },
      { label: "Gate", text: "Slack buttons and audit trail." },
      { label: "Voice", text: "Post-call webhook and simulate." },
    ],
  },
];

const STACK = [
  ["Backend", "FastAPI + Python"],
  ["Database", "SQLite (async)"],
  ["AI Scoring", "Claude, OpenAI, Gemini, Groq, or compatible"],
  ["Voice Agent", "ElevenLabs"],
  ["Approval Workflow", "Slack Interactive"],
  ["Frontend", "Next.js + shadcn/ui"],
] as const;

const FEATURES = [
  "Webhook-driven lead intake",
  "Schema-based scoring by the chosen model (Groq, OpenAI, …)",
  "Human-in-the-loop for high-value leads (Selected vs Parked)",
  "ElevenLabs outbound call after approval",
  "ElevenLabs post-call webhook (HMAC) with transcript",
  "LLM extraction of booked demo time",
  "Booked Demos tab with full transcript view",
  "Complete audit trail and blast-radius guardrails",
] as const;

const ENDPOINTS = [
  { method: "POST /api/leads/", note: "Create new lead (intake webhook)", tone: "text-green-600" },
  { method: "GET /api/leads/", note: "List all leads with filters", tone: "text-blue-600" },
  { method: "POST /api/leads/{id}/decide", note: "Dashboard Call / Claim / Reject (Selected or Parked override)", tone: "text-yellow-600" },
  { method: "POST /api/leads/{id}/resolve", note: "Manual complete / book demo after Claim", tone: "text-yellow-600" },
  { method: "DELETE /api/leads/{id}", note: "Remove one lead", tone: "text-red-600" },
  { method: "GET /api/leads/stats", note: "Pipeline statistics (includes demos booked)", tone: "text-blue-600" },
  { method: "POST /api/slack/interactions", note: "Slack button callbacks", tone: "text-yellow-600" },
  { method: "GET /api/audit/lead/{id}", note: "Lead audit trail", tone: "text-blue-600" },
  { method: "POST /api/voice/callback", note: "ElevenLabs post-call webhook (transcript → Voice Completed or Booked Demo)", tone: "text-purple-600" },
  { method: "POST /api/voice/simulate/{id}", note: "Simulate call completion (optional meeting booked)", tone: "text-purple-600" },
] as const;

export function ArchitectureCards() {
  const [open, setOpen] = useState<CardId | null>(null);
  const selected = CARDS.find((item) => item.id === open) ?? null;

  return (
    <>
      <div className="grid gap-2 md:grid-cols-3">
        {CARDS.map((item) => (
          <article key={item.id} className={`flex min-w-0 flex-col rounded-lg border border-t-4 bg-card p-2.5 ${edge[item.id]}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{item.title}</h3>
              <Button type="button" size="sm" onClick={() => setOpen(item.id)}>
                See details
              </Button>
            </div>
            <ul className="space-y-0.5 text-sm">
              {item.lines.map((line) => (
                <li key={line.label}>
                  <span className="font-semibold">{line.label}.</span> {line.text}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <Dialog open={selected !== null} onOpenChange={(next) => { if (!next) setOpen(null); }}>
        <DialogContent className="flex! h-[80vh]! max-h-[80vh]! w-[80vw]! max-w-[80vw]! flex-col gap-4 overflow-hidden sm:max-w-[80vw]!">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
                {selected.id === "stack" && (
                  <div className="space-y-3">
                    {STACK.map(([name, value]) => (
                      <div key={name} className="flex items-center justify-between rounded bg-muted p-2">
                        <span>{name}</span>
                        <span className="font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selected.id === "features" && (
                  <ul className="space-y-2">
                    {FEATURES.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {selected.id === "endpoints" && (
                  <div className="space-y-4 font-mono">
                    {ENDPOINTS.map((item) => (
                      <div key={item.method}>
                        <p className={item.tone}>{item.method}</p>
                        <p className="mt-1 font-sans text-xs text-muted-foreground">{item.note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
