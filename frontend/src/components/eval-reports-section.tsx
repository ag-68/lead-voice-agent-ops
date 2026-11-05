"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DemoEvalReport,
  DemoQuizCase,
  EvalCaseResult,
  EvalReport,
  EvalReportMeta,
  EvalRunStatus,
  LeadQuizCase,
  fetchDemoEvalReport,
  fetchDemoEvalReports,
  fetchDemoEvalRunStatus,
  fetchDemoFixtures,
  fetchEvalReport,
  fetchEvalReports,
  fetchEvalRunStatus,
  fetchLeadFixtures,
  isAdminUnlockError,
  startDemoEvalSuite,
  startEvalSuite,
} from "@/lib/api";

const EVAL_REPEATS = 3;

function Code({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.9em] leading-none">
      {children}
    </span>
  );
}

function scoreTone(value: number | null | undefined) {
  if (value == null) return "text-muted-foreground";
  if (value >= 0.8) return "text-emerald-700 dark:text-emerald-300";
  if (value >= 0.5) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

function fmtMean(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function fmtMetricCell(mean: number | null | undefined, stdev?: number | null) {
  if (mean == null) return "—";
  if (stdev != null && stdev > 0) return `${mean.toFixed(2)} ±${stdev.toFixed(2)}`;
  return mean.toFixed(2);
}

function fmtScoreCell(row: EvalCaseResult) {
  if (row.error) return null;
  const mean = row.icp_score;
  if (mean == null) return "—";
  const repeats = row.n_repeats ?? 1;
  if (repeats <= 1 || row.icp_score_min == null || row.icp_score_max == null) {
    return mean.toFixed(0);
  }
  if (row.icp_score_min === row.icp_score_max) return mean.toFixed(0);
  return `${mean.toFixed(0)} (${row.icp_score_min.toFixed(0)}–${row.icp_score_max.toFixed(0)})`;
}

function fmtGateCell(row: EvalCaseResult) {
  if (!row.judge) return "—";
  const counts = row.judge.actual_gate_counts;
  const expected = row.judge.expected_gate;
  if (counts && Object.keys(counts).length > 0) {
    const parts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([gate, n]) => `${gate}×${n}`)
      .join(" ");
    return `${parts} / ${expected}`;
  }
  return `${row.judge.actual_gate} / ${expected}`;
}

function reportOptionLabel(meta: EvalReportMeta) {
  const when = meta.generated_at ? new Date(meta.generated_at).toLocaleString() : meta.id;
  const ver = meta.prompt_version ?? "?";
  const hash = meta.prompt_hash ? meta.prompt_hash.slice(0, 8) : "—";
  const mean = meta.mean_aggregate != null ? ` · mean ${meta.mean_aggregate}` : "";
  const latest = meta.is_latest ? " (latest pointer)" : "";
  return `${when} · ${ver}#${hash}${mean}${latest}`;
}

function runParam(label: string, value: string, tone: string) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 break-all font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

function LeadFixturesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cases, setCases] = useState<LeadQuizCase[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const next = await fetchLeadFixtures();
        if (!cancelled) setCases(next);
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
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Lead quiz fixtures</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Fixed fake leads used by the lead scoring quiz (answer key included).
        </p>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            cases.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{c.id}</span>
                  <span className="text-xs text-muted-foreground">
                    expect {c.expected_gate}
                    {c.expected_score_min != null ? ` · score≥${c.expected_score_min}` : ""}
                    {c.expected_score_max != null ? ` · score≤${c.expected_score_max}` : ""}
                  </span>
                </div>
                {expanded === c.id && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">{c.lead.name}</span> ·{" "}
                      {c.lead.job_title} @ {c.lead.company_name}
                    </p>
                    <p className="font-mono">{c.lead.email}</p>
                    <p>Phone: {c.lead.phone || "(none)"}</p>
                    <p className="rounded bg-muted/50 p-2 text-[12px] leading-relaxed text-foreground">
                      {c.lead.message}
                    </p>
                    {c.notes && <p className="italic">{c.notes}</p>}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DemoFixturesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cases, setCases] = useState<DemoQuizCase[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const next = await fetchDemoFixtures();
        if (!cancelled) setCases(next);
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
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Demo quiz transcripts</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Simulated post-call blobs (summary + dialogue) with known booking answers.
        </p>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            cases.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted/40"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{c.id}</span>
                  <span className="text-xs text-muted-foreground">
                    expect booked={String(c.expected_meeting_booked)}
                    {(c.expected_date_contains || []).length
                      ? ` · date∋ ${(c.expected_date_contains || []).join(", ")}`
                      : ""}
                  </span>
                </div>
                {expanded === c.id && (
                  <div className="mt-2 space-y-1 text-xs">
                    {c.notes && <p className="italic text-muted-foreground">{c.notes}</p>}
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                      {c.call_text}
                    </pre>
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadMethodDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead eval method</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-base leading-relaxed">
          <div className="rounded-lg border border-sky-500/25 bg-sky-50/80 p-4 dark:bg-sky-950/40">
            <p className="text-[0.95rem] font-semibold text-sky-900 dark:text-sky-100">What this quiz is</p>
            <p className="mt-1.5 text-sky-950/80 dark:text-sky-100/80">
              Fixed golden fake leads. Each case is scored <strong>{EVAL_REPEATS} times</strong> with
              the active <strong>lead_scoring</strong> prompt. Heuristic judges grade each pass; the
              table shows means.
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/25 bg-amber-50/80 p-4 dark:bg-amber-950/40">
            <p className="text-[0.95rem] font-semibold text-amber-900 dark:text-amber-100">Gate</p>
            <p className="mt-1.5 text-amber-950/80 dark:text-amber-100/80">
              Selected if Fortune-500 or ICP ≥ 90, else parked. Votes shown as{" "}
              <Code>selected×2 parked×1 / expected</Code>.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DemoMethodDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Demo eval method</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-base leading-relaxed">
          <div className="rounded-lg border border-sky-500/25 bg-sky-50/80 p-4 dark:bg-sky-950/40">
            <p className="text-[0.95rem] font-semibold text-sky-900 dark:text-sky-100">What this quiz is</p>
            <p className="mt-1.5 text-sky-950/80 dark:text-sky-100/80">
              Simulated post-call transcripts/summaries (same shape production builds from
              ElevenLabs). Each fixture is run <strong>{EVAL_REPEATS}×</strong> through{" "}
              <strong>demo_extract</strong>.
            </p>
          </div>
          <div className="rounded-lg border border-violet-500/25 bg-violet-50/80 p-4 dark:bg-violet-950/40">
            <p className="text-[0.95rem] font-semibold text-violet-900 dark:text-violet-100">Booked acc</p>
            <p className="mt-1.5 text-violet-950/80 dark:text-violet-100/80">
              1.0 if <Code>meeting_booked</Code> matches the answer key, else 0.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-50/80 p-4 dark:bg-emerald-950/40">
            <p className="text-[0.95rem] font-semibold text-emerald-900 dark:text-emerald-100">Date ok</p>
            <p className="mt-1.5 text-emerald-950/80 dark:text-emerald-100/80">
              If a date is expected, required tokens (e.g. tuesday, 15:00) must appear in{" "}
              <Code>demo_scheduled_for</Code>. If not booked, empty date scores best.
            </p>
          </div>
          <div className="rounded-lg border border-slate-500/25 bg-slate-50/80 p-4 dark:bg-slate-900/50">
            <p className="text-[0.95rem] font-semibold text-slate-900 dark:text-slate-100">Aggregate</p>
            <p className="mt-1.5 text-slate-700 dark:text-slate-300">
              Mean of booked accuracy and date ok.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EvalReportsSection() {
  const [kind, setKind] = useState<"lead" | "demo">("lead");
  const [leadList, setLeadList] = useState<EvalReportMeta[]>([]);
  const [demoList, setDemoList] = useState<EvalReportMeta[]>([]);
  const [leadId, setLeadId] = useState("latest");
  const [demoId, setDemoId] = useState("latest");
  const [leadWrap, setLeadWrap] = useState<{
    available: boolean;
    message: string | null;
    report: EvalReport | null;
  } | null>(null);
  const [demoWrap, setDemoWrap] = useState<{
    available: boolean;
    message: string | null;
    report: DemoEvalReport | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<EvalRunStatus | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [fixturesOpen, setFixturesOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (kind === "lead") {
        const [reports, report] = await Promise.all([
          fetchEvalReports(),
          fetchEvalReport(leadId),
        ]);
        setLeadList(reports);
        setLeadWrap(report);
      } else {
        const [reports, report] = await Promise.all([
          fetchDemoEvalReports(),
          fetchDemoEvalReport(demoId),
        ]);
        setDemoList(reports);
        setDemoWrap(report);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load eval reports.");
    } finally {
      setLoading(false);
    }
  }, [kind, leadId, demoId]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const leadReport = leadWrap?.report;
  const demoReport = demoWrap?.report;
  const reportList = kind === "lead" ? leadList : demoList;
  const selectedId = kind === "lead" ? leadId : demoId;
  const activeReport = kind === "lead" ? leadReport : demoReport;
  const promptHash =
    kind === "lead"
      ? leadReport?.prompt_hash ||
        leadReport?.results?.find((r) => r.prompt_hash)?.prompt_hash ||
        null
      : demoReport?.prompt_hash || null;

  async function handleRun() {
    setRunning(true);
    setRunMessage(null);
    setRunProgress(null);
    setError(null);
    try {
      const started =
        kind === "lead"
          ? await startEvalSuite(EVAL_REPEATS)
          : await startDemoEvalSuite(EVAL_REPEATS);
      setRunProgress(started);
      for (;;) {
        await new Promise((r) => setTimeout(r, 500));
        const next =
          kind === "lead" ? await fetchEvalRunStatus() : await fetchDemoEvalRunStatus();
        setRunProgress(next);
        if (next.status === "completed") {
          const summary = next.summary;
          if (summary?.report_id) {
            if (kind === "lead") setLeadId(summary.report_id);
            else setDemoId(summary.report_id);
            setRunMessage(
              `New run ${summary.report_id} · ${summary.prompt_version ?? "?"}#${
                summary.prompt_hash ?? "—"
              } · mean ${summary.mean_aggregate ?? "—"}`,
            );
          }
          setLoading(true);
          break;
        }
        if (next.status === "failed") {
          setError(next.error || next.label || "Eval run failed.");
          break;
        }
      }
    } catch (err) {
      if (isAdminUnlockError(err)) {
        setError("Unlock Configure (admin key) to re-run evals.");
      } else {
        setError(err instanceof Error ? err.message : "Eval run failed.");
      }
    } finally {
      setRunning(false);
    }
  }

  const leadScorers = Array.from(
    new Set(
      (leadReport?.scorers?.length
        ? leadReport.scorers
        : (leadReport?.results || []).flatMap((row) =>
            (row.scorer || "").split(",").map((s) => s.trim()).filter(Boolean),
          )
      ) as string[],
    ),
  );

  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                kind === "lead" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
              onClick={() => setKind("lead")}
            >
              Lead Eval Report
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                kind === "demo" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
              onClick={() => setKind("demo")}
            >
              Demo Eval Report
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={running}
              onClick={() => void handleRun()}
            >
              {running ? "Running eval…" : "Run eval now"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              onClick={() => setFixturesOpen(true)}
            >
              {kind === "lead" ? "See quiz leads" : "See quiz transcripts"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700"
              disabled={!activeReport}
              onClick={() => setParamsOpen(true)}
            >
              See Run Parameters
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-sky-600 text-white hover:bg-sky-700"
              onClick={() => setMethodOpen(true)}
            >
              Eval Method Details
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {runMessage && !running && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{runMessage}</p>
        )}
        {(running || runProgress?.status === "running") && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-50/80 p-3 dark:bg-emerald-950/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                {runProgress?.label || "Starting eval…"}
              </p>
              <p className="font-mono text-xs text-emerald-800/80 dark:text-emerald-200/80">
                {runProgress?.n_steps
                  ? `${runProgress.step_index ?? 0}/${runProgress.n_steps}`
                  : "…"}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-200/70 dark:bg-emerald-900">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                style={{
                  width: `${
                    runProgress?.n_steps
                      ? Math.min(
                          100,
                          Math.round(((runProgress.step_index || 0) / runProgress.n_steps) * 100),
                        )
                      : 4
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="eval-kind-select">
            Show run
          </label>
          <select
            id="eval-kind-select"
            className="h-8 min-w-[16rem] flex-1 rounded-md border border-input bg-background px-2 text-sm"
            value={selectedId}
            onChange={(e) => {
              setLoading(true);
              if (kind === "lead") setLeadId(e.target.value);
              else setDemoId(e.target.value);
            }}
            disabled={reportList.length === 0}
          >
            {reportList.length === 0 ? (
              <option value="latest">No reports yet</option>
            ) : (
              reportList.map((meta) => (
                <option key={meta.filename} value={meta.id}>
                  {reportOptionLabel(meta)}
                </option>
              ))
            )}
          </select>
        </div>
        {!activeReport && (
          <p className="text-sm text-muted-foreground">
            {(kind === "lead" ? leadWrap?.message : demoWrap?.message) ||
              (loading ? "Loading…" : "No report loaded")}
          </p>
        )}
      </div>

      <Dialog open={paramsOpen} onOpenChange={(n) => { if (!n) setParamsOpen(false); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run parameters</DialogTitle>
          </DialogHeader>
          {!activeReport ? (
            <p className="text-sm text-muted-foreground">No report loaded.</p>
          ) : kind === "lead" && leadReport ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {runParam(
                "Generated",
                leadReport.generated_at
                  ? new Date(leadReport.generated_at).toLocaleString()
                  : "—",
                "border-slate-500/20 bg-slate-50/80 dark:bg-slate-900/40",
              )}
              {runParam(
                "Prompt version",
                leadReport.prompt_version ?? "—",
                "border-violet-500/25 bg-violet-50/80 dark:bg-violet-950/40",
              )}
              {runParam(
                "Prompt hash",
                promptHash ?? "—",
                "border-sky-500/25 bg-sky-50/80 dark:bg-sky-950/40",
              )}
              {runParam(
                "Scorer",
                leadScorers.length ? leadScorers.join(", ") : "—",
                "border-amber-500/25 bg-amber-50/80 dark:bg-amber-950/40",
              )}
              {runParam(
                "Passes / case",
                `${leadReport.n_repeats ?? 1}×`,
                "border-indigo-500/25 bg-indigo-50/80 dark:bg-indigo-950/40",
              )}
              {runParam(
                "Cases",
                `${leadReport.n_ok ?? 0}/${leadReport.n_cases ?? 0} ok`,
                "border-emerald-500/25 bg-emerald-50/80 dark:bg-emerald-950/40",
              )}
              {runParam(
                "Mean aggregate / gate",
                `${leadReport.mean_aggregate ?? "—"} / ${leadReport.mean_gate_accuracy ?? "—"}`,
                "border-rose-500/25 bg-rose-50/80 dark:bg-rose-950/40 sm:col-span-2",
              )}
            </div>
          ) : demoReport ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {runParam(
                "Generated",
                demoReport.generated_at
                  ? new Date(demoReport.generated_at).toLocaleString()
                  : "—",
                "border-slate-500/20 bg-slate-50/80 dark:bg-slate-900/40",
              )}
              {runParam(
                "Prompt version",
                demoReport.prompt_version ?? "—",
                "border-violet-500/25 bg-violet-50/80 dark:bg-violet-950/40",
              )}
              {runParam(
                "Prompt hash",
                promptHash ?? "—",
                "border-sky-500/25 bg-sky-50/80 dark:bg-sky-950/40",
              )}
              {runParam(
                "Passes / case",
                `${demoReport.n_repeats ?? 1}×`,
                "border-indigo-500/25 bg-indigo-50/80 dark:bg-indigo-950/40",
              )}
              {runParam(
                "Cases",
                `${demoReport.n_ok ?? 0}/${demoReport.n_cases ?? 0} ok`,
                "border-emerald-500/25 bg-emerald-50/80 dark:bg-emerald-950/40",
              )}
              {runParam(
                "Mean aggregate / booked",
                `${demoReport.mean_aggregate ?? "—"} / ${demoReport.mean_booked_accuracy ?? "—"}`,
                "border-rose-500/25 bg-rose-50/80 dark:bg-rose-950/40 sm:col-span-2",
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {kind === "lead" ? (
        <LeadMethodDialog open={methodOpen} onClose={() => setMethodOpen(false)} />
      ) : (
        <DemoMethodDialog open={methodOpen} onClose={() => setMethodOpen(false)} />
      )}
      {kind === "lead" ? (
        <LeadFixturesDialog open={fixturesOpen} onClose={() => setFixturesOpen(false)} />
      ) : (
        <DemoFixturesDialog open={fixturesOpen} onClose={() => setFixturesOpen(false)} />
      )}

      <div className="overflow-x-auto">
        {kind === "lead" && (leadReport?.n_repeats ?? 1) > 1 && (
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            Each row averages {leadReport?.n_repeats} passes — score mean (min–max), gate votes,
            metrics mean ± stdev when passes differ.
          </p>
        )}
        {kind === "demo" && (demoReport?.n_repeats ?? 1) > 1 && (
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            Each row averages {demoReport?.n_repeats} passes of demo_extract on the quiz transcript.
          </p>
        )}

        {kind === "lead" ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Case</th>
                <th className="px-3 py-2 font-medium">Passes</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Gate votes</th>
                <th className="px-3 py-2 font-medium">Grounded</th>
                <th className="px-3 py-2 font-medium">Gate acc</th>
                <th className="px-3 py-2 font-medium">Tone</th>
                <th className="px-3 py-2 font-medium">Aggregate</th>
              </tr>
            </thead>
            <tbody>
              {(leadReport?.results || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    {loading ? "Loading…" : "Run lead evals to populate this table."}
                  </td>
                </tr>
              ) : (
                leadReport!.results!.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.n_ok_passes != null && row.n_repeats != null
                        ? `${row.n_ok_passes}/${row.n_repeats}`
                        : "1/1"}
                    </td>
                    <td className="px-3 py-2">
                      {row.error ? (
                        <span className="text-rose-600">err</span>
                      ) : (
                        fmtScoreCell(row) ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs leading-snug">
                      {row.judge ? fmtGateCell(row) : "—"}
                    </td>
                    <td className={`px-3 py-2 ${scoreTone(row.judge?.groundedness)}`}>
                      {fmtMetricCell(row.judge?.groundedness, row.judge?.groundedness_stdev)}
                    </td>
                    <td className={`px-3 py-2 ${scoreTone(row.judge?.gate_accuracy)}`}>
                      {fmtMean(row.judge?.gate_accuracy)}
                    </td>
                    <td className={`px-3 py-2 ${scoreTone(row.judge?.tone_policy)}`}>
                      {fmtMetricCell(row.judge?.tone_policy, row.judge?.tone_policy_stdev)}
                    </td>
                    <td className={`px-3 py-2 font-medium ${scoreTone(row.judge?.aggregate)}`}>
                      {fmtMetricCell(row.judge?.aggregate, row.judge?.aggregate_stdev)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Case</th>
                <th className="px-3 py-2 font-medium">Passes</th>
                <th className="px-3 py-2 font-medium">Booked votes</th>
                <th className="px-3 py-2 font-medium">Sample when</th>
                <th className="px-3 py-2 font-medium">Booked acc</th>
                <th className="px-3 py-2 font-medium">Date ok</th>
                <th className="px-3 py-2 font-medium">Aggregate</th>
              </tr>
            </thead>
            <tbody>
              {(demoReport?.results || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    {loading ? "Loading…" : "Run demo evals to populate this table."}
                  </td>
                </tr>
              ) : (
                demoReport!.results!.map((row) => {
                  const counts = row.judge?.predicted_booked_counts;
                  const vote =
                    counts != null
                      ? `true×${counts.true} false×${counts.false}${
                          counts.unknown ? ` ?×${counts.unknown}` : ""
                        } / ${row.judge?.expected_meeting_booked}`
                      : "—";
                  return (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.n_ok_passes != null && row.n_repeats != null
                          ? `${row.n_ok_passes}/${row.n_repeats}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs leading-snug">{vote}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-muted-foreground">
                        {row.judge?.sample_when || "—"}
                      </td>
                      <td className={`px-3 py-2 ${scoreTone(row.judge?.booked_accuracy)}`}>
                        {fmtMean(row.judge?.booked_accuracy)}
                      </td>
                      <td className={`px-3 py-2 ${scoreTone(row.judge?.date_ok)}`}>
                        {fmtMetricCell(row.judge?.date_ok, row.judge?.date_ok_stdev)}
                      </td>
                      <td className={`px-3 py-2 font-medium ${scoreTone(row.judge?.aggregate)}`}>
                        {fmtMetricCell(row.judge?.aggregate, row.judge?.aggregate_stdev)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
