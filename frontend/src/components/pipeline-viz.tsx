"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineStats } from "@/lib/api";

interface PipelineVizProps {
  stats: PipelineStats | null;
}

const pipelineStages = [
  { key: "received", label: "Received", icon: "📥", color: "bg-gray-400" },
  { key: "enriching", label: "Enriching", icon: "🔄", color: "bg-blue-400" },
  { key: "enriched", label: "Enriched", icon: "✨", color: "bg-cyan-400" },
  { key: "pending_approval", label: "Pending Approval", icon: "⏳", color: "bg-yellow-400" },
  { key: "approved", label: "Approved", icon: "✅", color: "bg-green-400" },
  { key: "voice_scheduled", label: "Voice Scheduled", icon: "📅", color: "bg-purple-400" },
  { key: "voice_completed", label: "Voice Completed", icon: "🎉", color: "bg-emerald-400" },
];

export function PipelineViz({ stats }: PipelineVizProps) {
  if (!stats) return null;

  const maxCount = Math.max(...Object.values(stats.leads_by_status), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pipeline Stages</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {pipelineStages.map((stage) => {
            const count = stats.leads_by_status[stage.key] || 0;
            const percentage = (count / maxCount) * 100;

            return (
              <div key={stage.key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span>{stage.icon}</span>
                    <span>{stage.label}</span>
                  </span>
                  <span className="font-mono font-medium">{count}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stage.color} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">Lead Tiers</h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(stats.leads_by_tier).map(([tier, count]) => (
              <div
                key={tier}
                className="flex items-center justify-between p-2 bg-muted rounded text-sm"
              >
                <span className="capitalize">{tier.replace(/_/g, " ")}</span>
                <span className="font-mono font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
