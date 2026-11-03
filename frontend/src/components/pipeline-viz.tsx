"use client";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineStats } from "@/lib/api";

interface PipelineVizProps {
  stats: PipelineStats | null;
  onReadMore: () => void;
}

const pipelineStages = [
  { key: "received", label: "Received", detail: "Message from your contact platform is captured.", icon: "📥", color: "bg-gray-400" },
  { key: "scoring", label: "Scoring", detail: "LLM scores the company against your preferences.", icon: "🔄", color: "bg-blue-400" },
  { key: "scored", label: "Scored", detail: "Score saved; lead goes to approval.", icon: "✨", color: "bg-cyan-400" },
  { key: "pending_approval", label: "Pending Approval", detail: "A person reviews the score before a call.", icon: "⏳", color: "bg-yellow-400" },
  { key: "approved", label: "Approved", detail: "Person or score approved this client for a call.", icon: "✅", color: "bg-green-400" },
  { key: "voice_scheduled", label: "Voice Scheduled", detail: "Voice agent will call to book the demo.", icon: "📅", color: "bg-purple-400" },
  { key: "voice_completed", label: "Voice Completed", detail: "Call finished without a clear demo booking.", icon: "🎉", color: "bg-emerald-400" },
  { key: "booked_demo", label: "Booked Demo", detail: "Demo agreed on the call.", icon: "✅", color: "bg-teal-500" },
];

export function PipelineViz({ stats, onReadMore }: PipelineVizProps) {
  if (!stats) return null;

  const maxCount = Math.max(...Object.values(stats.leads_by_status), 1);

  return (
    <Card className="h-fit self-start">
      <CardHeader>
        <CardTitle>Pipeline Stages Summary</CardTitle>
        <CardAction>
          <Button type="button" variant="outline" size="xs" onClick={onReadMore}>
            Read More
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {pipelineStages.map((stage) => {
            const count = stats.leads_by_status[stage.key] || 0;
            const percentage = (count / maxCount) * 100;

            return (
              <div key={stage.key} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span>{stage.icon}</span>
                    <span className="truncate">
                      <span className="font-medium">{stage.label}</span>
                      <span className="text-muted-foreground"> — {stage.detail}</span>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono font-medium">{count}</span>
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
      </CardContent>
    </Card>
  );
}
