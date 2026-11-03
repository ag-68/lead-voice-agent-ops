const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create lead");
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && typeof body.detail === "string" ? body.detail : "That action did not finish.";
    throw new Error(detail);
  }
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = data && typeof data.detail === "string" ? data.detail : "Could not resolve that lead.";
    throw new Error(detail);
  }
  return res.json();
}

export async function deleteLead(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/leads/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to remove lead");
}

export async function reprocessLead(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/leads/${id}/reprocess`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reprocess lead");
}

export async function simulateVoiceCall(leadId: number, meetingBooked: boolean = false): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/api/voice/simulate/${leadId}?meeting_booked=${meetingBooked}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Failed to simulate voice call");
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "Could not save client preferences.";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // The response had no JSON detail.
    }
    throw new Error(detail);
  }
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
