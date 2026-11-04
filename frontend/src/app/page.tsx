"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarCheck, ExternalLink, GitBranch, Plus, Target, Users } from "lucide-react";
import { StatsCards } from "@/components/stats-cards";
import { LeadsTable } from "@/components/leads-table";
import { BookedDemosTable } from "@/components/booked-demos-table";
import { LeadForm } from "@/components/lead-form";
import { LeadDetail } from "@/components/lead-detail";
import { PipelineModules } from "@/components/pipeline-modules";
import { ArchitectureCards } from "@/components/architecture-cards";
import { AiConfigPanel } from "@/components/ai-config-panel";
import { ClientPreferencesPanel } from "@/components/client-preferences-panel";
import { Lead, PipelineStats, deleteLead, fetchLeads, fetchStats, isAdminUnlockError } from "@/lib/api";
import { LeadActionPanel } from "@/components/lead-action-panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PREVIEW_ONLY_TOAST, showToast } from "@/lib/toast";

const REPO_URL = "https://github.com/ag-68/lead-voice-agent-ops";

const SECTIONS = [
  { id: "pipeline", label: "Project Pipeline", icon: GitBranch },
  { id: "leads", label: "Leads", icon: Users },
  { id: "submit", label: "Test Lead", icon: Plus },
  { id: "demos", label: "Booked Demos", icon: CalendarCheck },
  { id: "preferences", label: "Client Preferences", icon: Target },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const FLOW = [
  { title: "Receive", detail: "Intake webhook or form saves the lead" },
  { title: "Score", detail: "Configured LLM rates the company vs Client Preferences" },
  { title: "Approve", detail: "Selected (90+ / F500) waits for a person to release the call" },
  { title: "Reach-out", detail: "ElevenLabs dials; post-call webhook → Voice Completed or Booked Demo" },
] as const;

const BLAST_RADIUS = [
  "Fortune 500 leads always need human approval",
  "Voice calls need explicit Slack sign-off",
  "All actions logged to an immutable audit trail",
  "External APIs gated behind the approval workflow",
] as const;

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("leads");
  const [pipelinePane, setPipelinePane] = useState<"general" | "flow" | "architecture">("general");
  const [actionLeadId, setActionLeadId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [leadsData, statsData] = await Promise.all([
        fetchLeads(),
        fetchStats(),
      ]);
      setLeads(leadsData);
      setStats(statsData);
    } catch (error) {
      // Backend reloads drop one poll; do not treat that as an app error.
      const transient =
        error instanceof TypeError &&
        typeof error.message === "string" &&
        error.message.toLowerCase().includes("fetch");
      if (!transient) {
        console.error("Failed to load data:", error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const handleLeadCreated = () => {
    loadData();
    setSection("leads");
  };

  const handleDeleteLead = async (lead: Lead) => {
    try {
      await deleteLead(lead.id);
      if (selectedLead?.id === lead.id) {
        setSelectedLead(null);
        setDetailOpen(false);
      }
      if (actionLeadId === lead.id) setActionLeadId(null);
      await loadData();
    } catch (err) {
      if (isAdminUnlockError(err)) showToast(PREVIEW_ONLY_TOAST);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="shrink-0 space-y-1.5">
            <h1 className="text-xl font-bold">Lead Qualifier Pipeline</h1>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5")}
              title="Opens the public GitHub repository so you can clone and deploy your own copy"
            >
              Get GitRepo & Deploy
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <ol className="flex min-w-0 flex-1 gap-2">
            {FLOW.map((step) => (
              <li
                key={step.title}
                className="min-w-0 flex-1 rounded-lg border bg-muted/40 px-3 py-2"
              >
                <p className="text-lg font-semibold">{step.title}</p>
                <p className="whitespace-pre-line text-sm leading-snug text-muted-foreground">{step.detail}</p>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Auto-refresh</p>
              <p className="text-sm font-medium">Every 5s</p>
            </div>
            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex min-h-0 w-[12.6rem] shrink-0 flex-col overflow-y-auto border-r bg-muted/40 p-3">
          <nav className="flex flex-col gap-1">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-3 border-t pt-3">
            <AiConfigPanel />
          </div>
          <p className="mt-auto pt-4 text-xs text-muted-foreground">
            Lead Qualifier Pipeline
          </p>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {section === "leads" && (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="relative">
                  <StatsCards stats={stats} loading={loading} />
                  {actionLeadId !== null && leads.some((lead) => lead.id === actionLeadId) && (
                    <LeadActionPanel
                      lead={leads.find((lead) => lead.id === actionLeadId)!}
                      onClose={() => setActionLeadId(null)}
                      onDone={loadData}
                    />
                  )}
                </div>
                <LeadsTable
                  leads={leads}
                  loading={loading}
                  chosenId={actionLeadId}
                  onChooseLead={(lead) => setActionLeadId(lead.id)}
                  onSelectLead={handleSelectLead}
                  onDeleteLead={handleDeleteLead}
                  onSubmitLead={() => setSection("submit")}
                />
              </div>
            )}
            {section === "pipeline" && (
              <div className="flex min-h-0 flex-1 gap-3">
                <div className="flex shrink-0 flex-col gap-1.5" role="tablist" aria-label="Pipeline view">
                  {([
                    ["general", "General"],
                    ["flow", "Pipeline Flow"],
                    ["architecture", "Architecture"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={pipelinePane === id}
                      onClick={() => setPipelinePane(id)}
                      className={`rounded-md border px-2 py-3 text-sm font-semibold [writing-mode:vertical-rl] rotate-180 ${
                        pipelinePane === id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden" role="tabpanel">
                  {pipelinePane === "general" ? (
                    <div className="h-full overflow-y-auto">
                      <div className="mx-auto max-w-6xl space-y-6 p-1">
                        <div>
                          <h2 className="text-2xl font-semibold">Voice-Agent Aided Lead Pipeline</h2>
                          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                            A portfolio demo of AI-first GTM tooling: inbound leads are scored by a configurable LLM, high-value ones wait for a human gate, then an ElevenLabs voice agent can dial — with a full audit trail and blast-radius controls.
                          </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-lg border bg-muted/30 p-5">
                            <h3 className="text-lg font-semibold">Motivation</h3>
                            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                              Sales teams drown in inbound volume. Auto-dialing every lead is risky; parking everything is slow. This project explores the middle path — models score fit, people release the call — the kind of guarded automation Internal AI / GTM engineering roles ship.
                            </p>
                            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                              The design ideology is <span className="font-medium text-foreground">blast control</span>: treat every step by how far it can reach. Scoring stays inside the app; dialing and Slack posts are high blast and must wait for an explicit human choice. That keeps AI useful without letting it spend trust, money, or a prospect’s phone number on its own.
                            </p>
                          </div>
                          <div className="rounded-lg border border-amber-500/25 bg-yellow-50 p-5 dark:bg-yellow-950">
                            <h3 className="text-lg font-semibold">Blast Control Approach</h3>
                            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                              External side effects are gated; internal writes are logged. In practice:
                            </p>
                            <ul className="mt-3 space-y-1.5 text-base text-muted-foreground">
                              {BLAST_RADIUS.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-lg border bg-muted/30 p-5">
                            <h3 className="text-lg font-semibold">Configurations</h3>
                            <ul className="mt-3 space-y-1.5 text-base text-muted-foreground">
                              <li>• <span className="font-medium text-foreground">Configure → Model</span> — provider, API key, and model name for ICP scoring</li>
                              <li>• <span className="font-medium text-foreground">Configure → Voice Agent</span> — ElevenLabs key, agent id, phone number id, post-call webhook secret</li>
                              <li>• <span className="font-medium text-foreground">Configure → Slack</span> — incoming webhook URL and signing secret for the same human gate</li>
                              <li>• <span className="font-medium text-foreground">Client Preferences</span> — ideal-client criteria the scorer reads</li>
                              <li>• <span className="font-medium text-foreground">Public HTTPS host</span> — cloud URL or ngrok for ElevenLabs / Slack callbacks when not on localhost</li>
                            </ul>
                          </div>
                          <div className="rounded-lg border bg-muted/30 p-5">
                            <h3 className="text-lg font-semibold">Testing</h3>
                            <ul className="mt-3 space-y-1.5 text-base text-muted-foreground">
                              <li>• Use <span className="font-medium text-foreground">Test Lead</span> with a sample company to walk intake → score → Parked or Selected</li>
                              <li>• On Selected, try the dashboard call card or Slack buttons (Voice Agent / Myself / Remove)</li>
                              <li>• Without a full voice setup, Voice Agent still simulates the dial; with ElevenLabs + a public callback URL, use a real post-call webhook</li>
                              <li>• Check Booked Demos after a call that books a meeting (or Simulate Meeting Booked)</li>
                              <li>• Pipeline Flow / Architecture tabs show the stage graph and stack detail</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : pipelinePane === "flow" ? (
                    <PipelineModules />
                  ) : (
                    <div className="h-full overflow-y-auto">
                      <ArchitectureCards />
                    </div>
                  )}
                </div>
              </div>
            )}

            {section === "demos" && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="shrink-0">
                  <h2 className="text-2xl font-semibold">Booked demos</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Demonstrates post-call transcript intake and demo-date extraction. Calendar sync (Google / Outlook / etc.) is future work.
                    {typeof stats?.demos_booked === "number" ? ` · ${stats.demos_booked} booked` : ""}
                  </p>
                </div>
                <BookedDemosTable
                  leads={leads}
                  loading={loading}
                  onSelectLead={handleSelectLead}
                />
              </div>
            )}

            {section === "submit" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl">
                  <LeadForm onSuccess={handleLeadCreated} />
                </div>
              </div>
            )}

            {section === "preferences" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-3xl">
                  <ClientPreferencesPanel />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <LeadDetail
        lead={selectedLead}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onRefresh={loadData}
      />
    </div>
  );
}
