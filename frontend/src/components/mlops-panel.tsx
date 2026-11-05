"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EvalReportsSection } from "@/components/eval-reports-section";
import {
  EvalReportMeta,
  EvalsStatus,
  MlflowTraceRow,
  ReviewFeedback,
  fetchEvalReports,
  fetchEvalsStatus,
  fetchMlflowTraces,
  fetchReviewFeedback,
} from "@/lib/api";

function verdictTone(verdict: string) {
  if (verdict === "approve_handover_to_ai" || verdict === "approved") {
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }
  if (verdict === "lead_call_rejected" || verdict === "rejected") {
    return "bg-rose-500/15 text-rose-800 dark:text-rose-300";
  }
  return "bg-amber-500/15 text-amber-900 dark:text-amber-300";
}

function verdictLabel(verdict: string) {
  if (verdict === "approve_handover_to_ai" || verdict === "approved") {
    return "approve-handover-to-AI";
  }
  if (verdict === "call_by_human" || verdict === "claimed" || verdict === "flagged_for_review") {
    return "call-by-human";
  }
  if (verdict === "lead_call_rejected" || verdict === "rejected") {
    return "lead-call-rejected";
  }
  return verdict.replace(/_/g, "-");
}

function TraceLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<MlflowTraceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMlflowTraces(80);
        if (!cancelled) setRows(data.traces || []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load traces.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Trace log</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Recent MLflow runs from lead scoring, demo extraction, and golden evals.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Latency</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Prompt hash</th>
                <th className="px-3 py-2 font-medium">Trace</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    Loading traces…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No traces yet — process a lead or run evals.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.run_id} className="border-t">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {row.start_time ? new Date(row.start_time).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.name || row.span || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.lead_id && row.lead_id !== "0" ? `#${row.lead_id}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.latency_ms != null ? `${Math.round(row.latency_ms)} ms` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.icp_score != null ? row.icp_score : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">
                      {row.prompt_tokens != null || row.completion_tokens != null
                        ? `${row.prompt_tokens ?? "—"}/${row.completion_tokens ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.cost_usd != null ? `$${row.cost_usd.toFixed(5)}` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {row.prompt_hash || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {row.trace_id ? `${row.trace_id.slice(0, 10)}…` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MlopsPanel() {
  const [status, setStatus] = useState<EvalsStatus | null>(null);
  const [reportList, setReportList] = useState<EvalReportMeta[]>([]);
  const [feedback, setFeedback] = useState<ReviewFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traceLogOpen, setTraceLogOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextReports, nextFeedback] = await Promise.all([
        fetchEvalsStatus(),
        fetchEvalReports(),
        fetchReviewFeedback(),
      ]);
      setStatus(nextStatus);
      setReportList(nextReports);
      setFeedback(nextFeedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load MLOps data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">MLOps &amp; Agentic Governance</h2>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">
              Local observability for the lead pipeline: versioned prompts, MLflow traces, deterministic
              guardrails, golden-set judges, and a closed loop of human review feedback.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-amber-500/25 bg-yellow-50 p-5 dark:bg-yellow-950">
            <h3 className="text-lg font-semibold">Guardrails</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>• Intake validates email domain and phone format before the lead is saved</li>
              <li>• Decide actions must be call / claim / reject</li>
              <li>• Voice dial only when status is Selected (HITL) and a phone is present</li>
              <li>• Slack signing secret + ElevenLabs HMAC gate outbound side effects</li>
              <li>• Immutable audit rows carry blast radius and approved_by</li>
            </ul>
          </div>
          <div className="rounded-lg border bg-muted/30 p-5">
            <h3 className="text-lg font-semibold">Judges &amp; feedback loop</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>
                • <span className="font-medium text-foreground">Lead judges</span> — groundedness, gate
                accuracy, tone on golden leads
              </li>
              <li>
                • <span className="font-medium text-foreground">Demo judges</span> — booked accuracy +
                date tokens on quiz transcripts
              </li>
              <li>• Dashboard / Slack Call·Claim·Reject append rows to review_feedback_log (below)</li>
            </ul>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <h3 className="text-base font-semibold">Prompt registry</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Active: <span className="font-mono text-foreground">{status?.active_prompt_version ?? "…"}</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Versioned YAML instructions for LLM calls:{" "}
              <span className="font-medium text-foreground">lead_scoring</span> (ICP score /
              select vs park) and{" "}
              <span className="font-medium text-foreground">demo_extract</span> (did the call book
              a demo, and when).
            </p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              scoring #{status?.prompt_hash ?? "—"}
            </p>
            <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
              demo_extract #{status?.demo_extract_hash ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <h3 className="text-base font-semibold">MLflow tracing</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {status?.mlflow_reachable ? "Tracking URI reachable" : loading ? "Checking…" : "Not reachable"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Records timelines for lead qualification, scoring LLM calls, demo extraction, and
              golden-eval cases (latency, tokens, cost, prompt hash).
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              onClick={() => setTraceLogOpen(true)}
            >
              See trace log
            </Button>
            <TraceLogDialog open={traceLogOpen} onClose={() => setTraceLogOpen(false)} />
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">Golden evals</h3>
            <p className="mt-1 text-xs text-muted-foreground">Latest lead quiz runs (up to 3)</p>
            {(() => {
              const snapshots = reportList.filter((r) => !r.is_latest).slice(0, 3);
              const recent =
                snapshots.length > 0
                  ? snapshots
                  : reportList.filter((r) => r.is_latest).slice(0, 1);
              if (recent.length === 0) {
                return (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No report yet"}
                  </p>
                );
              }
              return (
                <ul className="mt-2 space-y-2">
                  {recent.map((meta) => (
                    <li key={meta.id} className="rounded-md border bg-background/60 px-2.5 py-2">
                      <p className="text-[11px] text-muted-foreground">
                        {meta.generated_at
                          ? new Date(meta.generated_at).toLocaleString()
                          : meta.id}
                      </p>
                      <p className="mt-0.5 text-sm text-foreground">
                        Mean {meta.mean_aggregate ?? "—"} · gate{" "}
                        {meta.mean_gate_accuracy ?? "—"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {meta.prompt_version ?? "?"}#
                        {(meta.prompt_hash || "—").slice(0, 8)} · {meta.n_ok ?? "—"}/
                        {meta.n_cases ?? "—"} cases
                      </p>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>

        <EvalReportsSection />

        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="text-lg font-semibold">Review feedback log</h3>
            <p className="text-xs text-muted-foreground">
              HITL decisions: Voice-Agent Call → approve-handover-to-AI · Claim → call-by-human · Reject → lead-call-rejected.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Verdict</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Trace</th>
                </tr>
              </thead>
              <tbody>
                {feedback.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      {loading
                        ? "Loading…"
                        : "No feedback yet — release a Selected lead with Voice Agent / Myself / Remove."}
                    </td>
                  </tr>
                ) : (
                  feedback.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">#{row.lead_id ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${verdictTone(row.human_verdict)}`}>
                          {verdictLabel(row.human_verdict)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{row.action ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{row.actor}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                        {row.trace_id || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
