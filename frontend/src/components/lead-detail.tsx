"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Lead,
  AuditLog,
  fetchAuditLogs,
  simulateVoiceCall,
  reprocessLead,
  resolveClaimedLead,
  isAdminUnlockError,
} from "@/lib/api";
import { PREVIEW_ONLY_TOAST, showToast } from "@/lib/toast";

interface LeadDetailProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const blastRadiusColors: Record<string, string> = {
  read_only: "bg-gray-500",
  db_write: "bg-blue-500",
  crm_write: "bg-yellow-500",
  slack_post: "bg-purple-500",
  voice_trigger: "bg-red-500",
  external_api: "bg-orange-500",
};

export function LeadDetail({ lead, open, onClose, onRefresh }: LeadDetailProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [demoWhen, setDemoWhen] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (lead && open) {
      loadAuditLogs();
    }
  }, [lead, open]);

  const loadAuditLogs = async () => {
    if (!lead) return;
    setLoadingLogs(true);
    try {
      const logs = await fetchAuditLogs(lead.id);
      setAuditLogs(logs);
    } catch (error) {
      console.error("Failed to load audit logs:", error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSimulateCall = async (meetingBooked: boolean) => {
    if (!lead) return;
    setActionLoading(true);
    try {
      await simulateVoiceCall(lead.id, meetingBooked);
      await loadAuditLogs();
      onRefresh();
    } catch (error) {
      if (isAdminUnlockError(error)) {
        showToast(PREVIEW_ONLY_TOAST);
      } else {
        console.error("Failed to simulate call:", error);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReprocess = async () => {
    if (!lead) return;
    setActionLoading(true);
    try {
      await reprocessLead(lead.id);
      onRefresh();
      onClose();
    } catch (error) {
      if (isAdminUnlockError(error)) {
        showToast(PREVIEW_ONLY_TOAST);
      } else {
        console.error("Failed to reprocess:", error);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveClaimed = async (action: "complete" | "book_demo") => {
    if (!lead) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await resolveClaimedLead(lead.id, {
        action,
        demo_scheduled_for: demoWhen.trim() || undefined,
        notes: manualNotes.trim() || undefined,
      });
      setDemoWhen("");
      setManualNotes("");
      await loadAuditLogs();
      onRefresh();
    } catch (error) {
      if (isAdminUnlockError(error)) {
        showToast(PREVIEW_ONLY_TOAST);
      } else {
        setActionError(error instanceof Error ? error.message : "Could not update that lead.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.is_fortune_500 && <span className="text-2xl">🏆</span>}
            {lead.name} - {lead.company_name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="enrichment">AI Score</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Contact Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p><span className="text-muted-foreground">Email:</span> {lead.email}</p>
                  <p><span className="text-muted-foreground">Phone:</span> {lead.phone || "N/A"}</p>
                  <p><span className="text-muted-foreground">Title:</span> {lead.job_title || "N/A"}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lead Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge>
                      {{
                        scoring: "scoring",
                        scored: "scored",
                        enriching: "scoring",
                        enriched: "scored",
                      }[lead.status] ?? lead.status.replace(/_/g, " ")}
                    </Badge>
                  </p>
                  <p><span className="text-muted-foreground">ICP Score:</span> <span className="font-bold">{lead.icp_score.toFixed(0)}/100</span></p>
                  <p><span className="text-muted-foreground">Tier:</span> {lead.tier?.replace(/_/g, " ") || "Pending"}</p>
                </CardContent>
              </Card>
            </div>

            {lead.message && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Original Message</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{lead.message}</p>
                </CardContent>
              </Card>
            )}

            {(lead.status === "booked_demo" || lead.demo_scheduled_for) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Booked demo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">When: </span>
                    {lead.demo_scheduled_for || "Time not extracted"}
                  </p>
                  {lead.demo_booking_notes && (
                    <p>
                      <span className="text-muted-foreground">Notes: </span>
                      {lead.demo_booking_notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {lead.voice_call_summary && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Voice Call Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded">
                    {lead.voice_call_summary}
                  </pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="enrichment" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Company data from scoring</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p><span className="text-muted-foreground">Domain:</span> {lead.company_domain || "N/A"}</p>
                  <p><span className="text-muted-foreground">Industry:</span> {lead.company_industry || "N/A"}</p>
                  <p><span className="text-muted-foreground">Size:</span> {lead.company_size || "N/A"}</p>
                </div>
                <div>
                  <p><span className="text-muted-foreground">Employees:</span> {lead.company_employees?.toLocaleString() || "N/A"}</p>
                  <p><span className="text-muted-foreground">Revenue:</span> {lead.company_revenue ? `$${(lead.company_revenue / 1000000).toFixed(0)}M` : "N/A"}</p>
                  <p><span className="text-muted-foreground">Region:</span> {lead.company_region || "N/A"}</p>
                </div>
              </CardContent>
            </Card>

            {lead.company_description && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Company Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{lead.company_description}</p>
                </CardContent>
              </Card>
            )}

            {lead.icp_reasoning && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Why this score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded">
                    <p className="text-sm">{lead.icp_reasoning}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Audit Trail
                  <Button variant="ghost" size="sm" onClick={loadAuditLogs}>
                    Refresh
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : auditLogs.length === 0 ? (
                  <p className="text-muted-foreground">No audit logs yet</p>
                ) : (
                  <div className="space-y-3">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="border-l-2 border-muted pl-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{log.action.replace(/_/g, " ")}</span>
                          {log.blast_radius && (
                            <Badge
                              variant="outline"
                              className={`${blastRadiusColors[log.blast_radius] || "bg-gray-500"} text-white text-xs`}
                            >
                              {log.blast_radius.replace(/_/g, " ")}
                            </Badge>
                          )}
                          {log.requires_approval && (
                            <Badge variant="outline" className="text-xs">
                              {log.approved_by ? `✓ ${log.approved_by}` : "⏳ Pending"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          by {log.actor} • {new Date(log.created_at).toLocaleString()}
                        </p>
                        {log.details && (
                          <p className="text-sm mt-1">{log.details}</p>
                        )}
                        {log.reasoning && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer">
                              View reasoning chain
                            </summary>
                            <pre className="text-xs bg-muted p-2 rounded mt-1 whitespace-pre-wrap">
                              {log.reasoning}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Available Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Reprocess this lead through the scoring pipeline:
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleReprocess}
                    disabled={actionLoading}
                  >
                    {actionLoading ? "Processing..." : "Reprocess Lead"}
                  </Button>
                </div>

                {(lead.status === "voice_scheduled" || lead.status === "approved") && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Simulate a voice call completion (for demo):
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleSimulateCall(false)}
                        disabled={actionLoading}
                      >
                        Simulate Call (No Meeting)
                      </Button>
                      <Button
                        onClick={() => handleSimulateCall(true)}
                        disabled={actionLoading}
                      >
                        Simulate Call (Meeting Booked)
                      </Button>
                    </div>
                  </div>
                )}

                {lead.status === "claimed_manually" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      This lead was claimed by a person. After their call, mark it completed or booked (manual — no ElevenLabs webhook).
                    </p>
                    <label className="block text-sm">
                      Demo time (for booked)
                      <Input
                        className="mt-1"
                        value={demoWhen}
                        onChange={(e) => setDemoWhen(e.target.value)}
                        placeholder="e.g. Thursday 2pm"
                      />
                    </label>
                    <label className="block text-sm">
                      Notes
                      <Input
                        className="mt-1"
                        value={manualNotes}
                        onChange={(e) => setManualNotes(e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={actionLoading}
                        onClick={() => handleResolveClaimed("complete")}
                      >
                        Mark completed
                      </Button>
                      <Button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleResolveClaimed("book_demo")}
                      >
                        Mark booked demo
                      </Button>
                    </div>
                    {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
