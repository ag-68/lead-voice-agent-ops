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
  
  const url = `${API_BASE}/api/leads${params.toString() ? `?${params}` : ""}`;
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

export async function approveViaUrl(token: string, action: string = "approve_voice"): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/api/slack/approve/${token}?action=${action}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("Failed to approve");
  return res.json();
}
