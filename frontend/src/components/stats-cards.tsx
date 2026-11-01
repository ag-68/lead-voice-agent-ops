"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineStats } from "@/lib/api";

interface StatsCardsProps {
  stats: PipelineStats | null;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-24" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      title: "Total Leads",
      value: stats.total_leads,
      description: "All time submissions",
      icon: "📊",
    },
    {
      title: "Avg ICP Score",
      value: `${stats.avg_icp_score.toFixed(0)}/100`,
      description: "Lead quality indicator",
      icon: "🎯",
    },
    {
      title: "Approval Rate",
      value: `${(stats.approval_rate * 100).toFixed(0)}%`,
      description: "Leads approved for outreach",
      icon: "✅",
    },
    {
      title: "Voice Calls",
      value: `${stats.voice_calls_completed}/${stats.voice_calls_scheduled}`,
      description: "Completed / Scheduled",
      icon: "📞",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <span className="text-2xl">{card.icon}</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
