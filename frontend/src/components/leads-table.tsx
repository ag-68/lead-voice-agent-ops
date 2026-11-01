"use client";

import { useState } from "react";
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
import { Lead } from "@/lib/api";

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  onSelectLead: (lead: Lead) => void;
}

const statusColors: Record<string, string> = {
  received: "bg-gray-500",
  enriching: "bg-blue-500",
  enriched: "bg-cyan-500",
  pending_approval: "bg-yellow-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  voice_scheduled: "bg-purple-500",
  voice_completed: "bg-emerald-500",
  claimed_manually: "bg-orange-500",
  failed: "bg-red-700",
};

const tierLabels: Record<string, { label: string; color: string }> = {
  fortune_500: { label: "Fortune 500", color: "bg-amber-500" },
  enterprise: { label: "Enterprise", color: "bg-blue-500" },
  mid_market: { label: "Mid-Market", color: "bg-cyan-500" },
  smb: { label: "SMB", color: "bg-gray-500" },
  unqualified: { label: "Unqualified", color: "bg-red-500" },
};

export function LeadsTable({ leads, loading, onSelectLead }: LeadsTableProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No leads yet</p>
        <p className="text-sm">Submit a lead using the form to see it here</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead className="text-right">ICP Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50">
              <TableCell>
                <div>
                  <p className="font-medium">{lead.name}</p>
                  <p className="text-sm text-muted-foreground">{lead.email}</p>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{lead.company_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {lead.company_industry || "Unknown industry"}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                {lead.tier && tierLabels[lead.tier] ? (
                  <Badge className={tierLabels[lead.tier].color}>
                    {lead.is_fortune_500 && "🏆 "}
                    {tierLabels[lead.tier].label}
                  </Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span
                  className={`font-mono font-bold ${
                    lead.icp_score >= 70
                      ? "text-green-600"
                      : lead.icp_score >= 40
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {lead.icp_score.toFixed(0)}
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={`${statusColors[lead.status] || "bg-gray-500"} text-white`}
                >
                  {lead.status.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(lead.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => onSelectLead(lead)}>
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
