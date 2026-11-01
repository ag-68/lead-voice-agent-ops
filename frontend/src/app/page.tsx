"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatsCards } from "@/components/stats-cards";
import { LeadsTable } from "@/components/leads-table";
import { LeadForm } from "@/components/lead-form";
import { LeadDetail } from "@/components/lead-detail";
import { PipelineViz } from "@/components/pipeline-viz";
import { Lead, PipelineStats, fetchLeads, fetchStats } from "@/lib/api";

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [leadsData, statsData] = await Promise.all([
        fetchLeads(),
        fetchStats(),
      ]);
      setLeads(leadsData);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to load data:", error);
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
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Lead Qualifier Pipeline</h1>
              <p className="text-sm text-muted-foreground">
                AI-powered lead enrichment with human-in-the-loop approval
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Auto-refresh</p>
                <p className="text-sm font-medium">Every 5s</p>
              </div>
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          <StatsCards stats={stats} loading={loading} />

          <Tabs defaultValue="leads" className="space-y-4">
            <TabsList>
              <TabsTrigger value="leads">Leads</TabsTrigger>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              <TabsTrigger value="submit">Submit Lead</TabsTrigger>
              <TabsTrigger value="architecture">Architecture</TabsTrigger>
            </TabsList>

            <TabsContent value="leads">
              <LeadsTable
                leads={leads}
                loading={loading}
                onSelectLead={handleSelectLead}
              />
            </TabsContent>

            <TabsContent value="pipeline">
              <div className="grid md:grid-cols-2 gap-6">
                <PipelineViz stats={stats} />
                <div className="space-y-4">
                  <div className="p-6 border rounded-lg">
                    <h3 className="font-semibold mb-4">Pipeline Flow</h3>
                    <div className="space-y-4 text-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">1️⃣</span>
                        <div>
                          <p className="font-medium">Lead Received</p>
                          <p className="text-muted-foreground">Webhook captures form submission</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-xl">2️⃣</span>
                        <div>
                          <p className="font-medium">Claude Enrichment</p>
                          <p className="text-muted-foreground">AI analyzes and scores against ICP</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-xl">3️⃣</span>
                        <div>
                          <p className="font-medium">Approval Gate</p>
                          <p className="text-muted-foreground">High-value leads require human approval via Slack</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-xl">4️⃣</span>
                        <div>
                          <p className="font-medium">Voice Outreach</p>
                          <p className="text-muted-foreground">ElevenAgents makes automated call</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border rounded-lg bg-yellow-50 dark:bg-yellow-950">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <span>⚠️</span> Blast Radius Controls
                    </h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Fortune 500 leads always require human approval</li>
                      <li>• Voice calls need explicit Slack sign-off</li>
                      <li>• All actions logged to immutable audit trail</li>
                      <li>• External APIs gated behind approval workflow</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="submit">
              <div className="max-w-2xl mx-auto">
                <LeadForm onSuccess={handleLeadCreated} />
              </div>
            </TabsContent>

            <TabsContent value="architecture">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-6 border rounded-lg">
                    <h3 className="font-semibold mb-4">Tech Stack</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span>Backend</span>
                        <span className="font-mono">FastAPI + Python</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span>Database</span>
                        <span className="font-mono">SQLite (async)</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span>AI Enrichment</span>
                        <span className="font-mono">Claude API</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span>Voice Agent</span>
                        <span className="font-mono">ElevenLabs</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span>Approval Workflow</span>
                        <span className="font-mono">Slack Interactive</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span>Frontend</span>
                        <span className="font-mono">Next.js + shadcn/ui</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border rounded-lg">
                    <h3 className="font-semibold mb-4">Key Features</h3>
                    <ul className="text-sm space-y-2">
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>Webhook-driven lead intake</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>Claude-powered ICP scoring</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>Human-in-the-loop for high-value leads</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>ElevenAgents voice integration</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>Complete audit trail</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        <span>Blast radius guardrails</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="p-6 border rounded-lg">
                  <h3 className="font-semibold mb-4">API Endpoints</h3>
                  <div className="space-y-4 text-sm font-mono">
                    <div>
                      <p className="text-green-600">POST /api/leads/</p>
                      <p className="text-muted-foreground text-xs mt-1">Create new lead (webhook)</p>
                    </div>
                    <div>
                      <p className="text-blue-600">GET /api/leads/</p>
                      <p className="text-muted-foreground text-xs mt-1">List all leads with filters</p>
                    </div>
                    <div>
                      <p className="text-blue-600">GET /api/leads/stats</p>
                      <p className="text-muted-foreground text-xs mt-1">Pipeline statistics</p>
                    </div>
                    <div>
                      <p className="text-yellow-600">POST /api/slack/interactions</p>
                      <p className="text-muted-foreground text-xs mt-1">Slack button callbacks</p>
                    </div>
                    <div>
                      <p className="text-blue-600">GET /api/audit/lead/&#123;id&#125;</p>
                      <p className="text-muted-foreground text-xs mt-1">Lead audit trail</p>
                    </div>
                    <div>
                      <p className="text-purple-600">POST /api/voice/callback</p>
                      <p className="text-muted-foreground text-xs mt-1">ElevenAgents callback</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <LeadDetail
        lead={selectedLead}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onRefresh={loadData}
      />

      <footer className="border-t mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>Lead Qualifier Pipeline — Portfolio Project for ElevenLabs Application</p>
            <p>Built with FastAPI, Claude, ElevenLabs, and Next.js</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
