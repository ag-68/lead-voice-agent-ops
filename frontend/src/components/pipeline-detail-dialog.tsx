"use client";

import { useEffect, type ReactNode } from "react";
import { DecisionFlow } from "@/components/decision-flow";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PipelineDetailSection = "decisions" | "stages" | "scoring" | "approval" | "voice";

const ENDPOINTS = [
  { method: "POST", path: "/api/leads/", note: "Intake webhook / form. Lead enters Received, then scoring starts." },
  { method: "GET", path: "/api/leads/", note: "Lists the leads on the Leads tab." },
  { method: "POST", path: "/api/leads/{id}/decide", note: "Dashboard Call, Claim, or Reject. Call places the outbound dial." },
  { method: "DELETE", path: "/api/leads/{id}", note: "Removes one lead." },
  { method: "GET", path: "/api/leads/stats", note: "Pipeline counts, including demos booked." },
  { method: "POST", path: "/api/slack/interactions", note: "Slack decision. Voice Agent starts the dial." },
  { method: "GET", path: "/api/audit/lead/{id}", note: "Audit trail: score, tier, dial, post-call, demo booked." },
  { method: "POST", path: "/api/voice/callback", note: "ElevenLabs post-call webhook (HMAC). Sets Voice Completed or Booked Demo and stores the transcript." },
  { method: "POST", path: "/api/voice/simulate/{id}", note: "Fake call completion for local demos (optional meeting booked)." },
];

const METHOD_TONE: Record<string, string> = {
  POST: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  GET: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  DELETE: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
};

function Section({
  id,
  title,
  edge,
  children,
}: {
  id?: string;
  title: string;
  edge: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`space-y-3 rounded-lg border border-l-4 bg-muted/40 p-4 ${edge}`}>
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${tone}`}>
      {children}
    </span>
  );
}

const sky = "bg-sky-500/15 text-sky-800 dark:text-sky-200";
const amber = "bg-amber-500/15 text-amber-900 dark:text-amber-200";
const emerald = "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
const violet = "bg-violet-500/15 text-violet-800 dark:text-violet-200";

export function PipelineDetailDialog({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: PipelineDetailSection;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`pipeline-detail-${section}`)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, section]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex! h-[80vh]! max-h-[80vh]! w-[80vw]! max-w-[80vw]! flex-col gap-4 overflow-hidden sm:max-w-[80vw]!">
        <DialogHeader>
          <DialogTitle>Project Pipeline</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm leading-relaxed">
          <div id="pipeline-detail-decisions">
            <DecisionFlow detailed />
          </div>

          <Section title="How to read the chart" edge="border-l-slate-400">
            <p><Tag tone={sky}>ICP score</Tag>The 0–100 number. <strong>This is the only number the gate uses.</strong> A score of 89 and a score of 15 are the same decision when the company is not Fortune 500.</p>
            <p><Tag tone={sky}>Tier</Tag>A word stored next to the score: fortune 500, enterprise, mid-market, smb, or unqualified. <strong>Unqualified does not stop a call, and it does not start one.</strong> The next step never reads it.</p>
            <p><Tag tone={amber}>The person’s three choices</Tag>Shown only for a score of <strong>90+</strong> or a Fortune 500 company. <strong>Voice Agent</strong> dials now. <strong>Myself</strong> assigns a person and does not dial. <strong>Remove</strong> ends outreach. Same labels as the dashboard call card.</p>
            <p><Tag tone={emerald}>Under 90</Tag>The app marks the lead Approved and stops. Slack is not asked. No call is placed.</p>
          </Section>

          <Section id="pipeline-detail-stages" title="Pipeline stages" edge="border-l-slate-400">
            <p>Each stage is a status stored with the lead. The bars on the summary count how many leads are in that status now.</p>
            <ul className="space-y-2">
              <li><Tag tone={sky}>Received</Tag>POST /api/leads/ saves the message. No LLM has scored the company yet.</li>
              <li><Tag tone={sky}>Scoring</Tag>The server calls the LLM chosen in Configure and rates the company against Client Preferences. With no model key, a name list on this computer is used instead.</li>
              <li><Tag tone={sky}>Scored</Tag>The LLM score and tier are saved. The lead moves to the gate immediately.</li>
              <li><Tag tone={amber}>Selected</Tag>Score <strong>90 or higher</strong>, or Fortune 500. Waiting for a person to choose Voice Agent, Myself, or Remove.</li>
              <li><Tag tone={emerald}>Parked</Tag>Under 90 and not Fortune 500. No Slack ask and no automatic call; a person can still act from the dashboard.</li>
              <li><Tag tone={violet}>Voice Scheduled</Tag>A person released the call. The dial starts immediately (or is simulated if the agent is incomplete).</li>
              <li><Tag tone={violet}>Voice Completed</Tag>ElevenLabs post-call webhook recorded the call without a clear demo booking (includes busy / no-answer summaries).</li>
              <li><Tag tone={emerald}>Booked Demo</Tag>A demo was agreed on the call. Demo time/notes are stored; the lead also appears under Booked Demos with the transcript.</li>
            </ul>
          </Section>

          <Section id="pipeline-detail-scoring" title="Scoring" edge="border-l-sky-500">
            <p><Tag tone={sky}>LLM</Tag>One structured call. The model fills a fixed score sheet from the lead and from Client Preferences. The key is sent only to the provider you chose. A failed call is tried again, up to <strong>3</strong> times. A rejected key stops at once.</p>
            <p><Tag tone={sky}>Bands</Tag>The LLM is asked to use <strong>85–100</strong> for Fortune 500, <strong>70–84</strong> for enterprise, <strong>50–69</strong> for mid-market, <strong>30–49</strong> for a small business, and <strong>0–29</strong> for a poor fit. These bands only steer the number. They are not the approval gate.</p>
            <p><Tag tone={sky}>Tier</Tag>The same reply must also pick <strong>fortune 500</strong>, <strong>enterprise</strong>, <strong>mid-market</strong>, <strong>smb</strong>, or <strong>unqualified</strong>. That word is stored on the lead and shown in the audit. The next step does not read it.</p>
            <p><Tag tone={sky}>No key</Tag>A name list on this computer assigns a score. That path still uses the same 90 / Fortune 500 gate.</p>
          </Section>

          <Section id="pipeline-detail-approval" title="Approval" edge="border-l-amber-500">
            <p><Tag tone={amber}>Person</Tag>The lead waits when the score is <strong>90 or higher</strong>, or when the LLM sets Fortune 500, even if that score is lower. Slack and the dashboard offer Voice Agent, Myself, or Remove. Only Voice Agent may start the dial.</p>
            <p><Tag tone={emerald}>89 and 15</Tag>There is <strong>no difference</strong> between them at this gate. Both are under 90 and, if the company is not Fortune 500, both are marked Approved at once. Neither is declined, and <strong>neither is called</strong>.</p>
            <p><Tag tone={emerald}>Unqualified</Tag>The tier does <strong>not</strong> approve, block, or sort the call. An unqualified lead with a score of 15 follows the same path as a mid-market lead with a score of 89.</p>
            <p><Tag tone={amber}>What “approved” means</Tag>On the under-90 path, Approved means the gate was passed. <strong>No one is asked, and no call is placed.</strong> A call exists only after a person chooses Voice Agent on the 90+ / Fortune 500 path.</p>
          </Section>

          <Section id="pipeline-detail-voice" title="Voice call" edge="border-l-violet-500">
            <p><Tag tone={violet}>Who dials</Tag>The score never starts a call. A person presses Voice Agent in Slack or on the dashboard, or uses a direct approval link.</p>
            <p><Tag tone={violet}>Schedule</Tag>There is <strong>no calendar slot</strong> and no queue. Voice Scheduled is the clock time of that release.</p>
            <p><Tag tone={violet}>One try</Tag>The app does <strong>not</strong> dial again. Busy / no-answer still close via the post-call path (or initiation-failure webhook) into Voice Completed.</p>
            <p><Tag tone={violet}>Agent</Tag>A real call needs ElevenLabs API key, agent id, and phone number id. Missing any of those → simulated Voice Scheduled only.</p>
            <p><Tag tone={violet}>Post-call webhook</Tag>ElevenLabs sends <code className="text-xs">post_call_transcription</code> to <strong>POST /api/voice/callback</strong> over public HTTPS (ngrok locally). Signature: HMAC with the webhook secret. The app stores the transcript and sets Voice Completed or Booked Demo.</p>
            <p><Tag tone={emerald}>Booked Demo</Tag>Collected notes + transcript hints, then the scoring LLM (e.g. Groq) extract whether a demo was booked and the agreed time. Those leads show on the Booked Demos tab.</p>
          </Section>

          <Section title="Architecture" edge="border-l-slate-400">
            <ul className="space-y-1.5">
              <li><Tag tone={sky}>Frontend</Tag>Next.js: Leads, Booked Demos, Project Pipeline, Configure.</li>
              <li><Tag tone={sky}>API</Tag>FastAPI: intake webhook, LLM score, Slack/dashboard decide, ElevenLabs dial + post-call webhook.</li>
              <li><Tag tone={sky}>Database</Tag>SQLite: lead, score, conversation id, call summary/transcript, demo time/notes, audit trail.</li>
              <li><Tag tone={amber}>Slack</Tag>Human step for Selected (90+ or Fortune 500).</li>
              <li><Tag tone={violet}>ElevenLabs</Tag>Outbound Twilio call, then workspace post-call webhook back into this API.</li>
              <li><Tag tone={sky}>Tunnel</Tag>Local post-call delivery needs a public URL (ngrok → port 8000).</li>
            </ul>
          </Section>

          <Section title="Endpoints" edge="border-l-slate-400">
            <ul className="space-y-2.5">
              {ENDPOINTS.map((item) => (
                <li key={item.path}>
                  <p>
                    <Tag tone={METHOD_TONE[item.method]}>{item.method}</Tag>
                    <span className="font-mono text-xs font-semibold">{item.path}</span>
                  </p>
                  <p className="mt-0.5">{item.note}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
