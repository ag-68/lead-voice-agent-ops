"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lead } from "@/lib/api";

/** True when extraction failed or left the backend placeholder. */
function isMissingDemoTime(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  return /^time not extracted/i.test(value.trim());
}

interface BookedDemosTableProps {
  leads: Lead[];
  loading: boolean;
  onSelectLead: (lead: Lead) => void;
  onDeleteLead: (lead: Lead) => Promise<void>;
}

export function BookedDemosTable({
  leads,
  loading,
  onSelectLead,
  onDeleteLead,
}: BookedDemosTableProps) {
  const booked = leads.filter((lead) => lead.status === "booked_demo");
  const [transcriptLead, setTranscriptLead] = useState<Lead | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const confirmRemove = async (lead: Lead) => {
    setRemovingId(lead.id);
    try {
      await onDeleteLead(lead);
      setPendingId(null);
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading booked demos…</p>;
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Demo time</TableHead>
              <TableHead>Call finished</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[1%] whitespace-nowrap">Transcript</TableHead>
              <TableHead className="w-[1%] whitespace-nowrap text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {booked.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No booked demos yet. After a call where a demo is agreed, the lead moves here.
                </TableCell>
              </TableRow>
            ) : (
              booked.map((lead) => {
                const missingTime = isMissingDemoTime(lead.demo_scheduled_for);
                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer"
                    onClick={() => onSelectLead(lead)}
                  >
                    <TableCell>
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </TableCell>
                    <TableCell>{lead.company_name}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          missingTime
                            ? "bg-red-600 text-white hover:bg-red-600"
                            : "bg-teal-600 text-white hover:bg-teal-600"
                        }
                      >
                        {missingTime
                          ? lead.demo_scheduled_for?.trim() || "Time not extracted"
                          : lead.demo_scheduled_for}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.voice_call_completed_at
                        ? new Date(lead.voice_call_completed_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                      {lead.demo_booking_notes || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTranscriptLead(lead);
                        }}
                      >
                        <FileText className="size-3.5" aria-hidden />
                        View
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {pendingId === lead.id ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="bg-destructive text-white hover:bg-destructive/90 hover:text-white"
                              disabled={removingId === lead.id}
                              onClick={() => confirmRemove(lead)}
                            >
                              {removingId === lead.id ? "Removing..." : "Remove"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${lead.company_name}`}
                            onClick={() => setPendingId(lead.id)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!transcriptLead} onOpenChange={(open) => !open && setTranscriptLead(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Call transcript — {transcriptLead?.name}
              {transcriptLead?.company_name ? ` · ${transcriptLead.company_name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {isMissingDemoTime(transcriptLead?.demo_scheduled_for) ? (
              <p className="font-medium text-red-600">
                Demo time:{" "}
                {transcriptLead?.demo_scheduled_for?.trim() || "Time not extracted"}
              </p>
            ) : (
              <p>
                <span className="font-medium">Demo time: </span>
                {transcriptLead?.demo_scheduled_for}
              </p>
            )}
            {transcriptLead?.demo_booking_notes && (
              <p className="text-muted-foreground">{transcriptLead.demo_booking_notes}</p>
            )}
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
              {transcriptLead?.voice_call_summary || "No transcript stored for this call."}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
