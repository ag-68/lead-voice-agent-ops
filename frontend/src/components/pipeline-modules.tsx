"use client";

import { useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type NodeId =
  | "receive"
  | "score"
  | "parked"
  | "selected"
  | "human"
  | "claim"
  | "reject"
  | "dial"
  | "postcall"
  | "completed"
  | "record";

type Block = { label: string; text: string };

type FlowNode = {
  id: NodeId;
  title: string;
  blurb: string;
  tone: string;
  tag: string;
  blocks: Block[];
};

const NODES: Record<NodeId, FlowNode> = {
  receive: {
    id: "receive",
    title: "Receive",
    blurb: "Webhook or form intake",
    tone: "border-slate-400",
    tag: "bg-slate-500/15 text-slate-800 dark:text-slate-200",
    blocks: [
      { label: "Processing", text: "Test Lead or POST /api/leads/ saves the lead after intake guardrails (email domain + phone format). Scoring runs in its own DB session." },
      { label: "AI", text: "No LLM and no voice agent at intake." },
      { label: "State", text: "Received until scoring moves it to Scoring." },
    ],
  },
  score: {
    id: "score",
    title: "Score",
    blurb: "LLM ICP sheet, 3 tries",
    tone: "border-sky-500",
    tag: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
    blocks: [
      { label: "Processing", text: "Scoring → structured ICP sheet from ACTIVE_PROMPT_VERSION YAML. Up to 3 retries; fallback to name list. MLflow child span logs prompt_hash, latency, tokens." },
      { label: "AI", text: "Needs provider + API key + model in Configure. Client Preferences inject into the versioned prompt." },
      { label: "Branch", text: "Gate reads ICP score and Fortune 500. Next: Parked or Selected. Golden evals judge groundedness + gate accuracy." },
    ],
  },
  parked: {
    id: "parked",
    title: "Parked",
    blurb: "Under 90 — still reviewable",
    tone: "border-zinc-500",
    tag: "bg-zinc-500/15 text-zinc-800 dark:text-zinc-200",
    blocks: [
      { label: "When", text: "ICP under 90 and not Fortune 500. No automatic Slack ping and no auto-dial." },
      { label: "Human override", text: "Parked is not a dead end. Agents still see the lead on Leads and can Call (voice agent), Claim, or Reject anyway — same human gate as Selected." },
      { label: "State", text: "Parked until a person acts." },
    ],
  },
  selected: {
    id: "selected",
    title: "Selected",
    blurb: "90+ or Fortune 500",
    tone: "border-amber-500",
    tag: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    blocks: [
      { label: "When", text: "ICP ≥ 90 or Fortune 500. Waiting for a person before any dial." },
      { label: "Notify", text: "Slack (if configured) plus the dashboard action strip: Voice Agent / Myself / Remove." },
      { label: "State", text: "Selected until Call, Claim, or Reject." },
    ],
  },
  human: {
    id: "human",
    title: "Human gate",
    blurb: "Call, claim, or reject",
    tone: "border-amber-600",
    tag: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    blocks: [
      { label: "Who", text: "Reached from Selected (usual) or from Parked when someone decides to act anyway." },
      { label: "Call", text: "Guardrail: Selected + phone required. Starts ElevenLabs dial → Voice Scheduled. HITL: approve-handover-to-AI." },
      { label: "Claim", text: "Person owns follow-up. HITL: call-by-human. Later mark Completed or Booked Demo." },
      { label: "Reject", text: "Stops outreach. HITL: lead-call-rejected. Terminal Rejected state." },
      { label: "Endpoints", text: "POST /api/leads/{id}/decide or Slack → review_feedback_log (MLOps tab)." },
    ],
  },
  claim: {
    id: "claim",
    title: "Claim",
    blurb: "Human owns the follow-up",
    tone: "border-orange-500",
    tag: "bg-orange-500/15 text-orange-900 dark:text-orange-200",
    blocks: [
      { label: "Effect", text: "Assigned to a person. ElevenLabs is not started. Status Claimed manually." },
      { label: "Manual close", text: "After their own call/email, the agent opens the lead → Actions and chooses Mark completed or Mark booked demo (optional demo time + notes). That is manual — no post-call webhook." },
      { label: "Endpoint", text: "POST /api/leads/{id}/resolve with action complete or book_demo." },
    ],
  },
  reject: {
    id: "reject",
    title: "Reject",
    blurb: "Stop outreach",
    tone: "border-rose-500",
    tag: "bg-rose-500/15 text-rose-900 dark:text-rose-200",
    blocks: [
      { label: "Effect", text: "No dial, no claim. Outreach ends." },
      { label: "State", text: "Rejected (terminal)." },
    ],
  },
  dial: {
    id: "dial",
    title: "Dial",
    blurb: "ElevenLabs one outbound call",
    tone: "border-violet-500",
    tag: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
    blocks: [
      { label: "Trigger", text: "Voice Agent after HITL — blast-radius VOICE_TRIGGER + audit approved_by." },
      { label: "Needs", text: "API key, agent id, phone number id. Otherwise simulated Voice Scheduled." },
      { label: "State", text: "Voice Scheduled + conversation id for the webhook." },
    ],
  },
  postcall: {
    id: "postcall",
    title: "Post-call",
    blurb: "Webhook + HMAC verify",
    tone: "border-violet-600",
    tag: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
    blocks: [
      { label: "Processing", text: "ElevenLabs POSTs transcript/analysis to POST /api/voice/callback (public HTTPS / ngrok). HMAC checked; lead matched by conversation id." },
      { label: "AI", text: "Versioned demo_extract prompt + MLflow span; heuristics then LLM for booking/time." },
      { label: "Branch", text: "Booked → Record. Otherwise → Completed (includes busy / no-answer summaries)." },
    ],
  },
  completed: {
    id: "completed",
    title: "Completed",
    blurb: "Done without a demo",
    tone: "border-emerald-500",
    tag: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    blocks: [
      { label: "Auto path", text: "Post-call webhook with no clear demo booking (or initiation failure)." },
      { label: "Manual path", text: "Also reachable from Claim when a human marks the outreach completed without a demo." },
      { label: "State", text: "Voice Completed. Transcript/summary kept on the lead." },
    ],
  },
  record: {
    id: "record",
    title: "Record",
    blurb: "Booked demo entry",
    tone: "border-teal-600",
    tag: "bg-teal-500/15 text-teal-900 dark:text-teal-200",
    blocks: [
      { label: "Auto path", text: "Voice agent notes + LLM reading the post-call transcript → Booked Demo with demo time/notes." },
      { label: "Manual path", text: "From Claim: human enters demo time/notes and Mark booked demo. Also Simulate Meeting Booked for voice-scheduled demos." },
      { label: "UI", text: "Booked Demos tab lists these leads; View opens the full transcript/summary." },
      { label: "Stored", text: "demo_scheduled_for, demo_booking_notes, voice_call_summary." },
    ],
  },
};

type Point = { x: number; y: number };

/** Top-left of each node in the shared horizontal canvas. */
const POS: Record<NodeId, Point> = {
  receive: { x: 40, y: 48 },
  score: { x: 40, y: 160 },
  parked: { x: 220, y: 36 },
  selected: { x: 220, y: 210 },
  human: { x: 380, y: 180 },
  claim: { x: 540, y: 36 },
  reject: { x: 540, y: 130 },
  dial: { x: 540, y: 170 },
  postcall: { x: 540, y: 270 },
  completed: { x: 720, y: 130 },
  record: { x: 720, y: 270 },
};

type FlowEdge = {
  from: NodeId;
  to: NodeId;
  label?: string;
  /** Prefer label above or below the stroke so branches stay readable. */
  labelSide?: "above" | "below";
};

const EDGES: FlowEdge[] = [
  { from: "receive", to: "score", label: "intake", labelSide: "above" },
  { from: "score", to: "parked", label: "under 90", labelSide: "above" },
  { from: "score", to: "selected", label: "90+ / F500", labelSide: "below" },
  { from: "parked", to: "human", label: "optional: still act", labelSide: "above" },
  { from: "selected", to: "human", label: "Slack / UI", labelSide: "below" },
  { from: "human", to: "claim", label: "self-claim", labelSide: "above" },
  { from: "human", to: "reject", label: "reject", labelSide: "above" },
  { from: "human", to: "dial", label: "voice call", labelSide: "below" },
  { from: "claim", to: "completed", label: "manual done", labelSide: "above" },
  { from: "claim", to: "record", label: "manual book", labelSide: "below" },
  { from: "dial", to: "postcall", label: "Voice Scheduled", labelSide: "below" },
  { from: "postcall", to: "completed", label: "no demo", labelSide: "above" },
  { from: "postcall", to: "record", label: "demo booked", labelSide: "below" },
];

const CANVAS = { w: 1020, h: 340 };
const NODE = { w: 96, h: 32 };

function port(id: NodeId, side: "left" | "right" | "top" | "bottom", size: { w: number; h: number }) {
  const p = POS[id];
  if (side === "left") return { x: p.x, y: p.y + size.h / 2 };
  if (side === "right") return { x: p.x + size.w, y: p.y + size.h / 2 };
  if (side === "top") return { x: p.x + size.w / 2, y: p.y };
  return { x: p.x + size.w / 2, y: p.y + size.h };
}

function edgeEnds(from: NodeId, to: NodeId, size: { w: number; h: number }) {
  const a = POS[from];
  const b = POS[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) return { start: port(from, "right", size), end: port(to, "left", size) };
    return { start: port(from, "left", size), end: port(to, "right", size) };
  }
  if (dy >= 0) return { start: port(from, "bottom", size), end: port(to, "top", size) };
  return { start: port(from, "top", size), end: port(to, "bottom", size) };
}

function curveControls(start: Point, end: Point): { c1: Point; c2: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const bulge = Math.max(36, Math.abs(dx) * 0.4);
    return {
      c1: { x: start.x + Math.sign(dx || 1) * bulge, y: start.y },
      c2: { x: end.x - Math.sign(dx || 1) * bulge, y: end.y },
    };
  }
  const bulge = Math.max(28, Math.abs(dy) * 0.4);
  return {
    c1: { x: start.x, y: start.y + Math.sign(dy || 1) * bulge },
    c2: { x: end.x, y: end.y - Math.sign(dy || 1) * bulge },
  };
}

function curvePath(start: Point, end: Point): string {
  const { c1, c2 } = curveControls(start, end);
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

/** Point on cubic Bezier at t in [0, 1]. */
function cubicAt(start: Point, c1: Point, c2: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
    y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
  };
}

/** Exact cubic midpoint — chip is CSS-centered on this point. */
function edgeMidpoint(start: Point, end: Point): Point {
  const { c1, c2 } = curveControls(start, end);
  return cubicAt(start, c1, c2, end, 0.5);
}

function HorizontalGraph({
  selectedId,
  onSelect,
  onSeeDetails,
  large = false,
}: {
  selectedId: NodeId;
  onSelect: (id: NodeId) => void;
  onSeeDetails: () => void;
  large?: boolean;
}) {
  const scale = large ? 1.25 : 1;
  const width = CANVAS.w * scale;
  const height = CANVAS.h * scale;
  const nodeW = NODE.w * scale;
  const nodeH = NODE.h * scale;
  const fontSize = large ? 11 : 9;

  const drawn = useMemo(
    () =>
      EDGES.map((edge) => {
        const { start, end } = edgeEnds(edge.from, edge.to, NODE);
        const scaledStart = { x: start.x * scale, y: start.y * scale };
        const scaledEnd = { x: end.x * scale, y: end.y * scale };
        const d = curvePath(scaledStart, scaledEnd);
        const mid = edge.label ? edgeMidpoint(scaledStart, scaledEnd) : null;
        return {
          key: `${edge.from}-${edge.to}`,
          d,
          label: edge.label,
          mid,
        };
      }),
    [scale, fontSize],
  );

  const selected = NODES[selectedId];

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative mx-auto" style={{ width, height }}>
          <svg
            width={width}
            height={height}
            className="pointer-events-none absolute left-0 top-0"
            aria-hidden
          >
            <defs>
              <marker
                id={`arrow-${large ? "lg" : "sm"}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground/70" />
              </marker>
            </defs>
            {drawn.map((edge) => (
              <path
                key={edge.key}
                d={edge.d}
                fill="none"
                className="stroke-foreground/55"
                strokeWidth={large ? 2 : 1.5}
                markerEnd={`url(#arrow-${large ? "lg" : "sm"})`}
              />
            ))}
          </svg>

          {drawn.map(
            (edge) =>
              edge.label &&
              edge.mid && (
                <span
                  key={`label-${edge.key}`}
                  className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-border/80 bg-background px-1.5 py-0.5 font-semibold leading-none text-muted-foreground shadow-sm"
                  style={{
                    left: edge.mid.x,
                    top: edge.mid.y,
                    fontSize,
                  }}
                >
                  {edge.label}
                </span>
              ),
          )}

          {(Object.keys(POS) as NodeId[]).map((id) => {
            const node = NODES[id];
            const pos = POS[id];
            const active = id === selectedId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                className={`absolute z-[2] rounded-md border border-t-[3px] bg-card text-left shadow-sm transition-shadow ${node.tone} ${
                  active
                    ? "ring-2 ring-foreground/80 ring-offset-1 ring-offset-background"
                    : "hover:shadow-md"
                }`}
                style={{
                  left: pos.x * scale,
                  top: pos.y * scale,
                  width: nodeW,
                  height: nodeH,
                }}
              >
                <span
                  className={`block truncate px-2 font-semibold ${large ? "text-sm" : "text-[11px]"}`}
                  style={{ lineHeight: `${nodeH - 3}px` }}
                >
                  {node.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t bg-background/95 px-3 py-2">
        <span className="text-xs font-semibold">{selected.title}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {selected.blurb}
        </span>
        <Button type="button" size="xs" onClick={onSeeDetails}>
          See details
        </Button>
      </div>
    </div>
  );
}

export function PipelineModules() {
  const [selectedId, setSelectedId] = useState<NodeId>("receive");
  const [detailOpen, setDetailOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const selected = NODES[selectedId];

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Horizontal flow — click a node, then See details. Expand for a larger canvas.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(true)}>
            <Maximize2 className="size-3.5" aria-hidden />
            Expand
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20">
          <HorizontalGraph
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSeeDetails={() => setDetailOpen(true)}
          />
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex! h-[80vh]! max-h-[80vh]! w-[80vw]! max-w-[80vw]! flex-col gap-3 overflow-hidden sm:max-w-[80vw]!">
          <DialogHeader>
            <DialogTitle>Pipeline flow</DialogTitle>
          </DialogHeader>
          <p className="shrink-0 text-sm text-muted-foreground">
            Same horizontal graph, larger. Select a node to reveal See details.
          </p>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20">
            <HorizontalGraph
              large
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSeeDetails={() => setDetailOpen(true)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex! h-[80vh]! max-h-[80vh]! w-[80vw]! max-w-[80vw]! flex-col gap-4 overflow-hidden sm:max-w-[80vw]!">
          <DialogHeader>
            <DialogTitle>{selected.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{selected.blurb}</p>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed">
            {selected.blocks.map((block) => (
              <section key={block.label} className="rounded-lg border bg-muted/40 p-4">
                <h3 className="mb-1">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${selected.tag}`}>
                    {block.label}
                  </span>
                </h3>
                <p>{block.text}</p>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
