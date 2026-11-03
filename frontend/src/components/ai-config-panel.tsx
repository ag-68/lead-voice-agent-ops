"use client";

import { useEffect, useState } from "react";
import { Check, CircleDashed, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  AiStatus,
  clearLlmSetup,
  clearSlackSetup,
  clearVoiceSetup,
  fetchAiStatus,
  saveLlmSetup,
  saveSlackSetup,
  saveVoiceSetup,
} from "@/lib/api";

function SetupChip({
  ready,
  pending,
  name,
  value,
}: {
  ready: boolean;
  pending?: boolean;
  name: string;
  value: string;
}) {
  const Icon = ready ? Check : CircleDashed;
  const tone = pending
    ? "bg-muted text-muted-foreground"
    : ready
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <Icon className="size-3" aria-hidden />
      <span>{name}</span>
      <span className="font-normal">{value}</span>
    </span>
  );
}

const PRIVACY_NOTE =
  "Keys you paste here stay on this computer and are not written into the project. A model key is sent only to the provider you choose, to score a lead. An ElevenLabs key is sent only to ElevenLabs, to place a call. A Slack webhook is used only to post approval requests to your workspace.";

const PROVIDERS = [
  { id: "anthropic", label: "Claude (Anthropic)" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini (Google)" },
  { id: "groq", label: "Groq" },
  { id: "openai_compatible", label: "Other, OpenAI-compatible URL" },
];

function SectionConsent({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{PRIVACY_NOTE}</p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
        />
        <span>I understand the note above.</span>
      </label>
    </div>
  );
}

export function AiConfigPanel() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [provider, setProvider] = useState("anthropic");
  const [modelKey, setModelKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [voiceKey, setVoiceKey] = useState("");
  const [agentId, setAgentId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackSigningSecret, setSlackSigningSecret] = useState("");
  const [acceptedModel, setAcceptedModel] = useState(false);
  const [acceptedVoice, setAcceptedVoice] = useState(false);
  const [acceptedSlack, setAcceptedSlack] = useState(false);
  const [saving, setSaving] = useState<"model" | "voice" | "slack" | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [voiceGuideOpen, setVoiceGuideOpen] = useState(false);
  const [slackGuideOpen, setSlackGuideOpen] = useState(false);

  const load = async () => {
    try {
      const next = await fetchAiStatus();
      setStatus(next);
      if (next.llm.source === "this_session" && next.llm.provider !== "none") {
        setProvider(next.llm.provider);
      }
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedModel) return;
    setSaving("model");
    setModelError(null);
    try {
      const next = await saveLlmSetup({
        provider,
        api_key: modelKey.trim() || undefined,
        model: model.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
      });
      setStatus(next);
      setModelKey("");
      setAcceptedModel(false);
    } catch {
      setModelError("The local server did not save the model setup.");
    } finally {
      setSaving(null);
    }
  };

  const handleVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedVoice) return;
    setSaving("voice");
    setVoiceError(null);
    try {
      const next = await saveVoiceSetup({
        api_key: voiceKey.trim() || undefined,
        agent_id: agentId.trim() || undefined,
        phone_number_id: phoneNumberId.trim() || undefined,
        webhook_secret: webhookSecret.trim() || undefined,
      });
      setStatus(next);
      setVoiceKey("");
      setWebhookSecret("");
      setAcceptedVoice(false);
    } catch {
      setVoiceError("The local server did not save the voice setup.");
    } finally {
      setSaving(null);
    }
  };

  const handleSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedSlack) return;
    setSaving("slack");
    setSlackError(null);
    try {
      const next = await saveSlackSetup({
        webhook_url: slackWebhookUrl.trim() || undefined,
        signing_secret: slackSigningSecret.trim() || undefined,
      });
      setStatus(next);
      setSlackWebhookUrl("");
      setSlackSigningSecret("");
      setAcceptedSlack(false);
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : "The local server did not save the Slack setup.");
    } finally {
      setSaving(null);
    }
  };

  const modelReady = status?.llm.configured ?? false;
  const modelValue = !status ? "…" : modelReady ? status.llm.label : "Not set";
  const voiceReady = status?.voice.configured ?? false;
  const voiceValue = !status ? "…" : voiceReady ? "Set" : "Not set";
  const slackReady = status?.slack?.configured ?? false;
  const slackValue = !status ? "…" : slackReady ? "Set" : "Not set";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col items-stretch gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-background/70 hover:text-foreground"
      >
        <span className="flex items-center gap-2 font-medium">
          <SlidersHorizontal className="size-4" aria-hidden />
          Configure
        </span>
        <span className="flex flex-col items-start gap-1">
          <SetupChip ready={modelReady} pending={!status} name="Model" value={modelValue} />
          <SetupChip ready={voiceReady} pending={!status} name="Voice Agent" value={voiceValue} />
          <SetupChip ready={slackReady} pending={!status} name="Slack" value={slackValue} />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[80vw]! max-w-[80vw]! sm:max-w-[80vw]! max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure LLMs/Agents</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form onSubmit={handleModel} className="space-y-3">
              <h3 className="text-sm font-semibold">Model that scores the company</h3>
              <p className="text-sm text-muted-foreground">
                Scoring needs a provider, an API key, and a model name. The chip turns Set only after you save here — values sitting in .env alone do not count as configured.
              </p>
              {status?.llm.source === "this_session" && status.llm.key_set && (
                <p className="text-sm text-muted-foreground">
                  An API key is already set on this computer. Leave the key field blank to keep it, or paste a new one to replace it.
                </p>
              )}
              <label className="block text-sm">
                Provider
                <select
                  className="mt-1 h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                API key
                <Input
                  type="password"
                  autoComplete="off"
                  value={modelKey}
                  onChange={(e) => setModelKey(e.target.value)}
                  placeholder="Paste the key. Leave blank to keep the current one."
                />
              </label>
              <label className="block text-sm">
                Model name
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Optional. A default is used when this is empty."
                />
              </label>
              {provider === "openai_compatible" && (
                <label className="block text-sm">
                  Base URL
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
              )}
              <SectionConsent accepted={acceptedModel} onAcceptedChange={setAcceptedModel} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving !== null || !acceptedModel}>
                  {saving === "model" ? "Saving..." : "Use this model on this computer"}
                </Button>
                {status?.llm.source === "this_session" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving !== null}
                    onClick={async () => setStatus(await clearLlmSetup())}
                  >
                    Clear model setup
                  </Button>
                )}
              </div>
              {modelError && <p className="text-sm text-red-600">{modelError}</p>}
            </form>

            <form onSubmit={handleVoice} className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">ElevenLabs voice agent</h3>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setVoiceGuideOpen(true)}
                  className="border-emerald-600/30 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-300"
                >
                  Quick guidance
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                A real call needs a key, an agent id, and the ElevenLabs phone number id from your Twilio line. Until you save a setup here, this step is simulated.
              </p>
              <label className="block text-sm">
                ElevenLabs API key
                <Input
                  type="password"
                  autoComplete="off"
                  value={voiceKey}
                  onChange={(e) => setVoiceKey(e.target.value)}
                  placeholder="Paste the key. Leave blank to keep the current one."
                />
              </label>
              <label className="block text-sm">
                Voice agent id
                <Input
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="The agent that should place the call"
                />
              </label>
              <label className="block text-sm">
                Phone number id
                <Input
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="phnum_… from ElevenLabs phone numbers"
                />
              </label>
              <label className="block text-sm">
                Post-call webhook secret
                <Input
                  type="password"
                  autoComplete="off"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={
                    status?.voice.webhook_secret_set && status.voice.source === "this_session"
                      ? "Leave blank to keep the current secret."
                      : "wsec_… from ElevenLabs Create Webhook"
                  }
                />
              </label>
              <SectionConsent accepted={acceptedVoice} onAcceptedChange={setAcceptedVoice} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving !== null || !acceptedVoice}>
                  {saving === "voice" ? "Saving..." : "Use this voice agent on this computer"}
                </Button>
                {status?.voice.source === "this_session" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving !== null}
                    onClick={async () => setStatus(await clearVoiceSetup())}
                  >
                    Clear voice setup
                  </Button>
                )}
              </div>
              {voiceError && <p className="text-sm text-red-600">{voiceError}</p>}
            </form>

            <form onSubmit={handleSlack} className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Slack approvals</h3>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setSlackGuideOpen(true)}
                  className="border-emerald-600/30 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-300"
                >
                  Quick guidance
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Optional. Without a saved webhook here, Selected leads stay on the dashboard Call / Claim / Reject strip.
              </p>
              <label className="block text-sm">
                Incoming webhook URL
                <Input
                  type="password"
                  autoComplete="off"
                  value={slackWebhookUrl}
                  onChange={(e) => setSlackWebhookUrl(e.target.value)}
                  placeholder={
                    status?.slack?.webhook_set && status.slack.source === "this_session"
                      ? "Leave blank to keep the current webhook."
                      : "https://hooks.slack.com/services/…"
                  }
                />
              </label>
              <label className="block text-sm">
                Signing secret (for button clicks)
                <Input
                  type="password"
                  autoComplete="off"
                  value={slackSigningSecret}
                  onChange={(e) => setSlackSigningSecret(e.target.value)}
                  placeholder={
                    status?.slack?.signing_secret_set && status.slack.source === "this_session"
                      ? "Leave blank to keep the current secret."
                      : "From Slack app → Basic Information → Signing Secret"
                  }
                />
              </label>
              <SectionConsent accepted={acceptedSlack} onAcceptedChange={setAcceptedSlack} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving !== null || !acceptedSlack}>
                  {saving === "slack" ? "Saving..." : "Use this Slack setup on this computer"}
                </Button>
                {status?.slack?.source === "this_session" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving !== null}
                    onClick={async () => setStatus(await clearSlackSetup())}
                  >
                    Clear Slack setup
                  </Button>
                )}
              </div>
              {slackError && <p className="text-sm text-red-600">{slackError}</p>}
            </form>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={voiceGuideOpen} onOpenChange={setVoiceGuideOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Voice agent setup</DialogTitle>
          </DialogHeader>
          <ol className="max-h-[60vh] list-decimal space-y-3 overflow-y-auto pl-5 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Choose an ElevenLabs agent.</span>{" "}
              Use a blank agent or the Outbound Sales template. Publish it, then copy the agent id from the address bar (`agent_…`).
            </li>
            <li>
              <span className="font-medium text-foreground">Rewrite the script for ElevenLabs.</span>{" "}
              Keep Alex as the SDR whose only job is to book a demo. Remove leftover product names from the template (for example CloudSync).
            </li>
            <li>
              <span className="font-medium text-foreground">Connect a phone line with Twilio.</span>{" "}
              Upgrade if needed, complete Trust Hub identity checks, and allow the countries you will dial under Voice Geo Permissions. Import a Twilio number or verified caller ID into ElevenLabs Phone numbers, assign it to the agent, and copy the phone number id (`phnum_…`).
            </li>
            <li>
              <span className="font-medium text-foreground">Paste the three values here.</span>{" "}
              ElevenLabs API key (Conversational AI / ElevenAgents Write), voice agent id, and phone number id. Save until the chip says Voice Agent Set.
            </li>
            <li>
              <span className="font-medium text-foreground">Test from Leads.</span>{" "}
              Call a lead whose phone is not the same as your caller ID. The lead moves to Voice Scheduled when the dial starts.
            </li>
            <li>
              <span className="font-medium text-foreground">Public HTTPS base URL.</span>{" "}
              ElevenLabs cannot reach <code className="text-foreground">localhost</code>. If the API is already deployed with a public URL, use that. For local development only, install ngrok, run the backend on port 8000, then{" "}
              <code className="text-foreground">ngrok http 8000</code>, and use the HTTPS forwarding URL (for example{" "}
              <code className="text-foreground">https://abc123.ngrok-free.app</code>). Keep ngrok running while you test locally; if the tunnel host changes, update the webhook URL in ElevenLabs.
            </li>
            <li>
              <span className="font-medium text-foreground">Post-call webhook.</span>{" "}
              In Agents settings → Post-Call Webhook, set the URL to{" "}
              <code className="text-foreground">https://&lt;public-host&gt;/api/voice/callback</code>
              {" "}(your cloud host or ngrok host). Paste the webhook secret (`wsec_…`) in the field above. After a real call ends, ElevenLabs posts transcript and notes; this app marks the lead Voice Completed.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
      <Dialog open={slackGuideOpen} onOpenChange={setSlackGuideOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Slack approvals setup</DialogTitle>
          </DialogHeader>
          <ol className="max-h-[60vh] list-decimal space-y-3 overflow-y-auto pl-5 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Create a Slack app.</span>{" "}
              At{" "}
              <code className="text-foreground">api.slack.com/apps</code>, create an app from scratch in the workspace where sales should approve leads.
            </li>
            <li>
              <span className="font-medium text-foreground">Incoming Webhook.</span>{" "}
              Enable Incoming Webhooks, add one to the channel that should receive Selected leads, and copy the webhook URL (`https://hooks.slack.com/services/…`). Paste it above and save until the Slack chip says Set.
            </li>
            <li>
              <span className="font-medium text-foreground">Public HTTPS base URL.</span>{" "}
              Slack button clicks cannot reach <code className="text-foreground">localhost</code>. If the API is already deployed with a public URL, use that. For local development only, run the backend on port 8000, then{" "}
              <code className="text-foreground">ngrok http 8000</code>, and use that HTTPS forwarding URL while you test. If the ngrok host changes, update Slack’s Request URL.
            </li>
            <li>
              <span className="font-medium text-foreground">Interactivity.</span>{" "}
              In the Slack app → Interactivity &amp; Shortcuts, turn Interactivity on and set Request URL to{" "}
              <code className="text-foreground">https://&lt;public-host&gt;/api/slack/interactions</code>
              {" "}(your cloud host or ngrok host). Copy the Signing Secret from Basic Information and paste it above.
            </li>
            <li>
              <span className="font-medium text-foreground">Test.</span>{" "}
              Score a lead into Selected. You should see a Slack message with Voice Agent / Myself / Remove — same choices as the dashboard call card.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
