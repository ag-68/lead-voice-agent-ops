"use client";

import { useState } from "react";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
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

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  chosenId: number | null;
  onChooseLead: (lead: Lead) => void;
  onSelectLead: (lead: Lead) => void;
  onDeleteLead: (lead: Lead) => Promise<void>;
  onSubmitLead: () => void;
}

type HelpKey = "tier" | "icp" | "status";

type HelpItem = {
  text: string;
  badge?: { label: string; color: string };
};

const statusColors: Record<string, string> = {
  received: "bg-gray-500",
  scoring: "bg-blue-500",
  scored: "bg-cyan-500",
  enriching: "bg-blue-500",
  enriched: "bg-cyan-500",
  pending_approval: "bg-yellow-500",
  selected: "bg-sky-600",
  parked: "bg-zinc-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  voice_scheduled: "bg-purple-500",
  voice_completed: "bg-emerald-500",
  booked_demo: "bg-teal-600",
  claimed_manually: "bg-orange-500",
  failed: "bg-red-700",
};

const statusLabels: Record<string, string> = {
  scoring: "scoring",
  scored: "scored",
  enriching: "scoring",
  enriched: "scored",
  pending_approval: "pending approval",
  voice_scheduled: "voice scheduled",
  voice_completed: "voice completed",
  booked_demo: "booked demo",
  claimed_manually: "claimed manually",
};

const tierLabels: Record<string, { label: string; color: string }> = {
  fortune_500: { label: "Fortune 500", color: "bg-amber-500" },
  enterprise: { label: "Enterprise", color: "bg-blue-500" },
  mid_market: { label: "Mid-Market", color: "bg-cyan-500" },
  smb: { label: "SMB", color: "bg-gray-500" },
  unqualified: { label: "Unqualified", color: "bg-red-500" },
};

const COLUMN_HELP: Record<HelpKey, { title: string; items: HelpItem[] }> = {
  tier: {
    title: "What each tier means",
    items: [
      { badge: { label: "Fortune 500", color: tierLabels.fortune_500.color }, text: "The model flags the company as Fortune 500. That flag also decides Selected vs Parked." },
      { badge: { label: "Enterprise", color: tierLabels.enterprise.color }, text: "Large company fit, usually 1000+ employees." },
      { badge: { label: "Mid-Market", color: tierLabels.mid_market.color }, text: "Mid-size company fit, usually 100–999 employees." },
      { badge: { label: "SMB", color: tierLabels.smb.color }, text: "Small business fit, usually under 100 employees." },
      { badge: { label: "Unqualified", color: tierLabels.unqualified.color }, text: "Weak fit label. It does not block a call; a person can still Call, claim, or reject." },
      { text: "Tier is kept for the list and the audit log. The gate that chooses Selected vs Parked reads only the ICP score and the Fortune 500 flag." },
    ],
  },
  icp: {
    title: "How the ICP score works",
    items: [
      { text: "The scoring model rates company fit from 0 to 100 using Client Preferences." },
      { badge: { label: "85–100", color: "bg-green-600" }, text: "Fortune 500 style fit" },
      { badge: { label: "70–84", color: "bg-green-600" }, text: "Enterprise, large company in a fitting industry" },
      { badge: { label: "50–69", color: "bg-yellow-500" }, text: "Mid-market fit" },
      { badge: { label: "30–49", color: "bg-yellow-500" }, text: "Small business fit" },
      { badge: { label: "0–29", color: "bg-red-600" }, text: "Poor fit" },
      { text: "After scoring: 90 or higher, or Fortune 500 → Selected. Otherwise → Parked. Tier is not used in that choice." },
    ],
  },
  status: {
    title: "What each status means",
    items: [
      { badge: { label: "received", color: statusColors.received }, text: "Saved, scoring has not started." },
      { badge: { label: "scoring", color: statusColors.scoring }, text: "LLM is rating the company." },
      { badge: { label: "scored", color: statusColors.scored }, text: "Score is saved; selection runs next." },
      { badge: { label: "selected", color: statusColors.selected }, text: "90+ or Fortune 500. Waiting for a person to release a call." },
      { badge: { label: "parked", color: statusColors.parked }, text: "Under 90 and not Fortune 500. No auto Slack/call; a person can still Call, Claim, or Reject." },
      { badge: { label: "voice scheduled", color: statusColors.voice_scheduled }, text: "A call was placed (or simulated)." },
      { badge: { label: "voice completed", color: statusColors.voice_completed }, text: "Finished without a demo — via post-call webhook or manual close after Claim." },
      { badge: { label: "booked demo", color: statusColors.booked_demo }, text: "Demo booked (webhook+LLM or manual after Claim). Also under Booked Demos." },
      { badge: { label: "claimed manually", color: statusColors.claimed_manually }, text: "A person owns follow-up. Later they manually mark Completed or Booked Demo." },
      { badge: { label: "rejected", color: statusColors.rejected }, text: "Outreach ended. No call." },
      { badge: { label: "failed", color: statusColors.failed }, text: "Scoring failed after retries." },
      { badge: { label: "pending approval", color: statusColors.pending_approval }, text: "Older label from before Selected." },
      { badge: { label: "approved", color: statusColors.approved }, text: "Older label from before the Selected / Parked split." },
    ],
  },
};

export function LeadsTable({
  leads,
  loading,
  chosenId,
  onChooseLead,
  onSelectLead,
  onDeleteLead,
  onSubmitLead,
}: LeadsTableProps) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [helpKey, setHelpKey] = useState<HelpKey | null>(null);
  const help = helpKey ? COLUMN_HELP[helpKey] : null;

  const tableIntro = (
    <div className="mb-2 flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" onClick={onSubmitLead}>
        <Plus className="size-4" aria-hidden />
        Test Lead
      </Button>
      <p className="text-sm text-muted-foreground">
        Call a lead to release a voice call, claim it, or reject it.
      </p>
    </div>
  );

  const confirmRemove = async (lead: Lead) => {
    setRemovingId(lead.id);
    setRemoveError(null);
    try {
      await onDeleteLead(lead);
      setPendingId(null);
    } catch {
      setRemoveError("That lead was not removed.");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {tableIntro}
        <div className="flex min-h-0 flex-1 items-center justify-center text-center text-muted-foreground">
          <div>
            <p className="text-lg">No leads yet</p>
            <p className="text-sm">Use Test Lead to add a sample intake and see it here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {removeError && <p className="mb-2 text-sm text-red-600">{removeError}</p>}
      {tableIntro}
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Tier
                <button
                  type="button"
                  className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="What each tier means"
                  onClick={() => setHelpKey("tier")}
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </span>
            </TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center justify-end gap-1">
                ICP Score
                <button
                  type="button"
                  className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="How the ICP score works"
                  onClick={() => setHelpKey("icp")}
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </span>
            </TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Status
                <button
                  type="button"
                  className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="What each status means"
                  onClick={() => setHelpKey("status")}
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </span>
            </TableHead>
            <TableHead>Created</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow
              key={lead.id}
              data-state={chosenId === lead.id ? "selected" : undefined}
              className={chosenId === lead.id ? "bg-muted" : undefined}
            >
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
                  {statusLabels[lead.status] ?? lead.status.replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(lead.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button className="text-base" onClick={() => onChooseLead(lead)}>
                    Call
                  </Button>
                  <Button variant="ghost" className="text-base" onClick={() => onSelectLead(lead)}>
                    View Analysis
                  </Button>
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
                      <Button variant="ghost" size="sm" onClick={() => setPendingId(null)}>
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
          ))}
        </TableBody>
      </Table>
      </div>
      <Dialog open={helpKey !== null} onOpenChange={(next) => { if (!next) setHelpKey(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{help?.title}</DialogTitle>
          </DialogHeader>
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto text-sm text-muted-foreground">
            {help?.items.map((item) => (
              <li key={`${item.badge?.label ?? ""}-${item.text}`} className="flex items-start gap-2">
                {item.badge && (
                  <Badge className={`${item.badge.color} shrink-0 text-white`}>
                    {item.badge.label}
                  </Badge>
                )}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
