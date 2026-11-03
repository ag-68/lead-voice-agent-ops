"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
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

interface BookedDemosTableProps {
  leads: Lead[];
  loading: boolean;
  onSelectLead: (lead: Lead) => void;
}

export function BookedDemosTable({ leads, loading, onSelectLead }: BookedDemosTableProps) {
  const booked = leads.filter((lead) => lead.status === "booked_demo");
  const [transcriptLead, setTranscriptLead] = useState<Lead | null>(null);

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {booked.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No booked demos yet. After a call where a demo is agreed, the lead moves here.
                </TableCell>
              </TableRow>
            ) : (
              booked.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => onSelectLead(lead)}>
                  <TableCell>
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-xs text-muted-foreground">{lead.email}</div>
                  </TableCell>
                  <TableCell>{lead.company_name}</TableCell>
                  <TableCell>
                    <Badge className="bg-teal-600 text-white hover:bg-teal-600">
                      {lead.demo_scheduled_for || "Time not set"}
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
                </TableRow>
              ))
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
            {transcriptLead?.demo_scheduled_for && (
              <p>
                <span className="font-medium">Demo time: </span>
                {transcriptLead.demo_scheduled_for}
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
