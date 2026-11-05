const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ADMIN_KEY_STORAGE = "lead_voice_admin_key";

export interface DemoStatus {
  locked: boolean;
  repo_url: string;
}

export function getStoredAdminKey(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

export function setStoredAdminKey(key: string | null) {
  if (typeof window === "undefined") return;
  if (key && key.trim()) sessionStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
  else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

function adminHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = { ...(extra || {}) };
  const key = getStoredAdminKey();
  if (key) headers["X-Admin-Key"] = key;
  return headers;
}

/** Expected demo-lock rejection — not an Error, so Next.js won't paint a console overlay. */
export class AdminUnlockRequiredError {
  readonly name = "AdminUnlockRequiredError";
  constructor(public readonly message = "Demo is view-only.") {}
}

export function isAdminUnlockError(err: unknown): boolean {
  if (err instanceof AdminUnlockRequiredError) return true;
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    (err as { name?: string }).name === "AdminUnlockRequiredError"
  ) {
    return true;
  }
  if (err instanceof Error) {
    return /view-only|admin.?unlock|admin_unlock_required/i.test(err.message);
  }
  return false;
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    if (detail && typeof detail === "object") {
      const code = typeof detail.code === "string" ? detail.code : "";
      const message =
        typeof detail.message === "string" ? detail.message : fallback;
      if (code === "admin_unlock_required" || res.status === 403) {
        throw new AdminUnlockRequiredError(message);
      }
      throw new Error(message);
    }
    if (typeof detail === "string") {
      if (res.status === 403) throw new AdminUnlockRequiredError(detail);
      throw new Error(detail);
    }
  } catch (err) {
    if (err instanceof AdminUnlockRequiredError) throw err;
    if (err instanceof Error) throw err;
  }
  if (res.status === 403) throw new AdminUnlockRequiredError(fallback);
  throw new Error(fallback);
}

export async function fetchDemoStatus(): Promise<DemoStatus> {
  const res = await fetch(`${API_BASE}/api/demo/status`);
  if (!res.ok) {
    throw new Error("Could not read demo lock status");
  }
  return res.json();
}

/** True when this browser page is not a local dashboard. */
export function isHostedBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return !["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export interface Lead {
  id: number;
  email: string;
  name: string;
  company_name: string;
  job_title: string | null;
  phone: string | null;
  message: string | null;
  company_domain: string | null;
  company_industry: string | null;
  company_size: string | null;
  company_employees: number | null;
  company_revenue: number | null;
  company_region: string | null;
  company_description: string | null;
  is_fortune_500: boolean;
  icp_score: number;
  icp_reasoning: string | null;
  tier: string | null;
  status: string;
  assigned_to: string | null;
  voice_call_scheduled_at: string | null;
  voice_call_completed_at: string | null;
  voice_call_summary: string | null;
  voice_conversation_id?: string | null;
  demo_scheduled_for?: string | null;
  demo_booking_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  lead_id: number | null;
  action: string;
  actor: string;
  details: string | null;
  reasoning: string | null;
  blast_radius: string | null;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface PipelineStats {
  total_leads: number;
  leads_by_status: Record<string, number>;
  leads_by_tier: Record<string, number>;
  avg_icp_score: number;
  approval_rate: number;
  voice_calls_scheduled: number;
  voice_calls_completed: number;
  demos_booked?: number;
}

export interface LeadFormData {
  email: string;
  name: string;
  company_name: string;
  job_title?: string;
  phone?: string;
  message?: string;
}

export async function fetchLeads(status?: string, tier?: string): Promise<Lead[]> {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  if (tier) params.append("tier", tier);
  
  const url = `${API_BASE}/api/leads/${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch leads");
  return res.json();
}

export async function fetchLead(id: number): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${id}`);
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

export async function createLead(data: LeadFormData): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, "Failed to create lead");
  return res.json();
}

export async function fetchStats(): Promise<PipelineStats> {
  const res = await fetch(`${API_BASE}/api/leads/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchAuditLogs(leadId: number): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/api/audit/lead/${leadId}`);
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

export async function fetchHighRiskActions(): Promise<AuditLog[]> {
  const res = await fetch(`${API_BASE}/api/audit/high-risk`);
  if (!res.ok) throw new Error("Failed to fetch high-risk actions");
  return res.json();
}

export async function decideLead(id: number, action: "call" | "claim" | "reject"): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/leads/${id}/decide`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action }),
  });
  if (!res.ok) await throwApiError(res, "That action did not finish.");
  return res.json();
}

export async function resolveClaimedLead(
  id: number,
  body: {
    action: "complete" | "book_demo";
    demo_scheduled_for?: string;
    notes?: string;
  },
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/api/leads/${id}/resolve`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, "Could not resolve that lead.");
  return res.json();
}

export async function deleteLead(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/leads/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) await throwApiError(res, "Failed to remove lead");
}

export async function reprocessLead(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/leads/${id}/reprocess`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) await throwApiError(res, "Failed to reprocess lead");
}

export async function simulateVoiceCall(leadId: number, meetingBooked: boolean = false): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/api/voice/simulate/${leadId}?meeting_booked=${meetingBooked}`,
    { method: "POST", headers: adminHeaders() }
  );
  if (!res.ok) await throwApiError(res, "Failed to simulate voice call");
  return res.json();
}

export interface AiStatus {
  llm: {
    configured: boolean;
    provider: string;
    key_set: boolean;
    model_set: boolean;
    model: string;
    source: string;
    label: string;
    step: string;
  };
  voice: {
    configured: boolean;
    key_set: boolean;
    agent_set: boolean;
    phone_number_set: boolean;
    webhook_secret_set: boolean;
    source: string;
    label: string;
    step: string;
  };
  slack: {
    configured: boolean;
    webhook_set: boolean;
    signing_secret_set: boolean;
    source: string;
    label: string;
    step: string;
  };
  max_attempts: number;
  stored_in_project: boolean;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/local-keys/`);
  if (!res.ok) throw new Error("Failed to read AI setup");
  return res.json();
}

export async function saveLlmSetup(body: {
  provider: string;
  api_key?: string;
  model?: string;
  base_url?: string;
}): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/local-keys/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to save model setup");
  return res.json();
}

export async function clearLlmSetup(): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/local-keys/llm`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear model setup");
  return res.json();
}

export async function saveVoiceSetup(body: {
  api_key?: string;
  agent_id?: string;
  phone_number_id?: string;
  webhook_secret?: string;
}): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/local-keys/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to save voice setup");
  return res.json();
}

export async function clearVoiceSetup(): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/local-keys/voice`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear voice setup");
  return res.json();
}

export async function saveSlackSetup(body: {
  webhook_url?: string;
  signing_secret?: string;
}): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/local-keys/slack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "Failed to save Slack setup";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // no JSON detail
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function clearSlackSetup(): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/local-keys/slack`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to clear Slack setup");
  return res.json();
}

export interface PreferenceChoice {
  id: string;
  label: string;
}

export interface ClientPreferences {
  sectors: string[];
  regions: string[];
  employee_bands: string[];
  services: string[];
  prompt_block: string;
  options: {
    sectors: string[];
    regions: PreferenceChoice[];
    employee_bands: PreferenceChoice[];
    services: string[];
  };
}

export async function fetchClientPreferences(): Promise<ClientPreferences> {
  const res = await fetch(`${API_BASE}/api/client-preferences`);
  if (!res.ok) throw new Error("Could not load client preferences.");
  return res.json();
}

export async function saveClientPreferences(body: {
  sectors: string[];
  regions: string[];
  employee_bands: string[];
  services: string[];
}): Promise<ClientPreferences> {
  const res = await fetch(`${API_BASE}/api/client-preferences`, {
    method: "PUT",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, "Could not save client preferences.");
  return res.json();
}

export async function approveViaUrl(token: string, action: string = "approve_voice"): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/api/slack/approve/${token}?action=${action}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Failed to approve");
  return res.json();
}

export interface EvalsStatus {
  active_prompt_version: string;
  prompt_hash: string | null;
  demo_extract_hash?: string | null;
  mlflow_reachable: boolean;
  mlflow_tracking_uri: string;
  latest_report_available: boolean;
  latest_report_path: string | null;
}

export interface EvalCaseResult {
  id: string;
  scorer?: string;
  icp_score?: number;
  icp_score_min?: number | null;
  icp_score_max?: number | null;
  icp_score_stdev?: number | null;
  n_repeats?: number;
  n_ok_passes?: number;
  tier?: string | null;
  is_fortune_500?: boolean;
  judge?: {
    groundedness: number;
    groundedness_stdev?: number | null;
    gate_accuracy: number;
    tone_policy: number;
    tone_policy_stdev?: number | null;
    aggregate: number;
    aggregate_stdev?: number | null;
    actual_gate: string;
    expected_gate: string;
    actual_gate_counts?: Record<string, number>;
    gate_pass_rate?: number | null;
  };
  score_band_ok?: boolean;
  prompt_version?: string;
  prompt_hash?: string;
  trials?: EvalCaseResult[];
  error?: string;
}

export interface EvalReport {
  generated_at?: string;
  prompt_version?: string;
  prompt_hash?: string;
  scorers?: string[];
  n_repeats?: number;
  n_cases?: number;
  n_ok?: number;
  mean_aggregate?: number | null;
  mean_gate_accuracy?: number | null;
  results?: EvalCaseResult[];
}

export interface EvalReportMeta {
  id: string;
  filename: string;
  is_latest: boolean;
  modified_at?: number;
  generated_at?: string | null;
  prompt_version?: string | null;
  prompt_hash?: string | null;
  n_cases?: number | null;
  n_ok?: number | null;
  mean_aggregate?: number | null;
  mean_gate_accuracy?: number | null;
  n_repeats?: number | null;
  scorers?: string[];
}

export interface ReviewFeedback {
  id: number;
  lead_id: number | null;
  trace_id: string | null;
  judge_scores: Record<string, unknown> | null;
  human_verdict: string;
  actor: string;
  action: string | null;
  details: string | null;
  created_at: string | null;
}

export async function fetchEvalsStatus(): Promise<EvalsStatus> {
  const res = await fetch(`${API_BASE}/api/evals/status`);
  if (!res.ok) throw new Error("Could not load evals status");
  return res.json();
}

export async function fetchEvalReports(): Promise<EvalReportMeta[]> {
  const res = await fetch(`${API_BASE}/api/evals/reports`);
  if (!res.ok) throw new Error("Could not load eval report list");
  const data = await res.json();
  return data.reports ?? [];
}

export interface EvalRunStatus {
  job_id: string | null;
  status: "idle" | "running" | "completed" | "failed" | string;
  phase?: string | null;
  label?: string | null;
  case_index?: number;
  n_cases?: number;
  pass_index?: number;
  n_repeats?: number;
  step_index?: number;
  n_steps?: number;
  case_id?: string | null;
  error?: string | null;
  summary?: {
    report_id: string;
    filename: string;
    prompt_version?: string;
    prompt_hash?: string;
    mean_aggregate?: number | null;
    n_ok?: number;
    n_cases?: number;
    n_repeats?: number;
  } | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export async function startEvalSuite(nRepeats = 3): Promise<EvalRunStatus> {
  const res = await fetch(`${API_BASE}/api/evals/run?n_repeats=${nRepeats}`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) await throwApiError(res, "Could not run evals");
  return res.json();
}

export async function fetchEvalRunStatus(): Promise<EvalRunStatus> {
  const res = await fetch(`${API_BASE}/api/evals/run/status`);
  if (!res.ok) throw new Error("Could not load eval run status");
  return res.json();
}

export interface MlflowTraceRow {
  run_id: string;
  name: string;
  span?: string | null;
  lead_id?: string | null;
  trace_id?: string | null;
  prompt_hash?: string | null;
  gate_outcome?: string | null;
  status?: string | null;
  start_time?: string | null;
  latency_ms?: number | null;
  icp_score?: number | null;
  cost_usd?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}

export async function fetchMlflowTraces(limit = 50): Promise<{
  available: boolean;
  count: number;
  traces: MlflowTraceRow[];
}> {
  const res = await fetch(`${API_BASE}/api/evals/traces?limit=${limit}`);
  if (!res.ok) throw new Error("Could not load MLflow traces");
  return res.json();
}

export interface LeadQuizCase {
  id: string;
  lead: {
    name: string;
    email: string;
    company_name: string;
    job_title?: string;
    phone?: string;
    message?: string;
  };
  expected_gate: string;
  expected_score_min?: number;
  expected_score_max?: number;
  notes?: string;
}

export interface DemoQuizCase {
  id: string;
  call_text: string;
  expected_meeting_booked: boolean;
  expected_date_contains?: string[];
  notes?: string;
}

export async function fetchLeadFixtures(): Promise<LeadQuizCase[]> {
  const res = await fetch(`${API_BASE}/api/evals/fixtures/leads`);
  if (!res.ok) throw new Error("Could not load lead quiz fixtures");
  const data = await res.json();
  return data.cases ?? [];
}

export async function fetchDemoFixtures(): Promise<DemoQuizCase[]> {
  const res = await fetch(`${API_BASE}/api/evals/fixtures/demos`);
  if (!res.ok) throw new Error("Could not load demo quiz fixtures");
  const data = await res.json();
  return data.cases ?? [];
}

export interface DemoEvalCaseResult {
  id: string;
  n_repeats?: number;
  n_ok_passes?: number;
  scorer?: string;
  judge?: {
    booked_accuracy: number;
    date_ok: number;
    date_ok_stdev?: number | null;
    aggregate: number;
    aggregate_stdev?: number | null;
    expected_meeting_booked: boolean;
    predicted_meeting_booked: boolean | null;
    predicted_booked_counts?: { true: number; false: number; unknown: number };
    sample_when?: string | null;
  };
  error?: string;
}

export interface DemoEvalReport {
  kind?: string;
  generated_at?: string;
  prompt_version?: string;
  prompt_hash?: string;
  n_repeats?: number;
  n_cases?: number;
  n_ok?: number;
  mean_aggregate?: number | null;
  mean_booked_accuracy?: number | null;
  results?: DemoEvalCaseResult[];
}

export async function fetchDemoEvalReports(): Promise<EvalReportMeta[]> {
  const res = await fetch(`${API_BASE}/api/evals/demo/reports`);
  if (!res.ok) throw new Error("Could not load demo eval report list");
  const data = await res.json();
  return data.reports ?? [];
}

export async function fetchDemoEvalReport(reportId?: string | null): Promise<{
  available: boolean;
  message: string | null;
  report_id?: string;
  report: DemoEvalReport | null;
}> {
  const params = reportId ? `?report_id=${encodeURIComponent(reportId)}` : "";
  const res = await fetch(`${API_BASE}/api/evals/demo/report${params}`);
  if (!res.ok) throw new Error("Could not load demo eval report");
  return res.json();
}

export async function startDemoEvalSuite(nRepeats = 3): Promise<EvalRunStatus> {
  const res = await fetch(`${API_BASE}/api/evals/demo/run?n_repeats=${nRepeats}`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) await throwApiError(res, "Could not run demo evals");
  return res.json();
}

export async function fetchDemoEvalRunStatus(): Promise<EvalRunStatus> {
  const res = await fetch(`${API_BASE}/api/evals/demo/run/status`);
  if (!res.ok) throw new Error("Could not load demo eval run status");
  return res.json();
}

export async function fetchEvalReport(reportId?: string | null): Promise<{
  available: boolean;
  message: string | null;
  report_id?: string;
  filename?: string;
  report: EvalReport | null;
}> {
  const params = reportId ? `?report_id=${encodeURIComponent(reportId)}` : "";
  const res = await fetch(`${API_BASE}/api/evals/report${params}`);
  if (!res.ok) throw new Error("Could not load eval report");
  return res.json();
}

export async function fetchReviewFeedback(leadId?: number): Promise<ReviewFeedback[]> {
  const params = leadId != null ? `?lead_id=${leadId}` : "";
  const res = await fetch(`${API_BASE}/api/evals/feedback${params}`);
  if (!res.ok) throw new Error("Could not load review feedback");
  return res.json();
}
