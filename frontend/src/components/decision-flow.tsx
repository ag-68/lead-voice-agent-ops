"use client";

const sky = "border-sky-500/40 bg-sky-500/10";
const amber = "border-amber-500/40 bg-amber-500/10";
const emerald = "border-emerald-500/40 bg-emerald-500/10";
const violet = "border-violet-500/40 bg-violet-500/10";

function Arrow() {
  return <p className="text-center text-sm text-muted-foreground" aria-hidden>↓</p>;
}

export function DecisionFlow({ detailed = false }: { detailed?: boolean }) {
  return (
    <div className="space-y-2 text-sm">
      <div className={`rounded-lg border p-3 ${sky}`}>
        <p className="font-semibold">1. The LLM writes two fields</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <p>
            <span className="font-semibold">ICP score, 0–100.</span> This number is what the next step reads. The bands 85–100, 70–84, 50–69, 30–49, and 0–29 only guide the number.
          </p>
          <p>
            <span className="font-semibold">Tier, a label.</span> One of fortune 500, enterprise, mid-market, smb, or unqualified. <span className="font-semibold">Unqualified does not mean “do not call”.</span> The gate never reads the tier.
          </p>
        </div>
      </div>
      <Arrow />
      <p className="text-center font-semibold">2. Who decides what happens next</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={`rounded-lg border p-3 ${amber}`}>
          <p className="font-semibold">A person, in Slack</p>
          <p className="mt-1">When the score is <span className="font-semibold">90 or higher</span>, or the company is <span className="font-semibold">Fortune 500</span>.</p>
          <p className="mt-2 font-semibold">The person picks one of three. There is no choice of a later time.</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li><span className="font-semibold">Voice Agent.</span> The voice agent dials now, once.</li>
            <li><span className="font-semibold">Myself.</span> A person follows up. The agent does not call.</li>
            <li><span className="font-semibold">Reject.</span> No outreach.</li>
          </ol>
        </div>
        <div className={`rounded-lg border p-3 ${emerald}`}>
          <p className="font-semibold">Parked (app default)</p>
          <p className="mt-1">When the score is <span className="font-semibold">under 90</span> and the company is <span className="font-semibold">not Fortune 500</span>.</p>
          <p className="mt-2"><span className="font-semibold">89 and 15 are the same.</span> No Slack ask and no auto-dial — but agents can still open the lead and Call / Claim / Reject.</p>
        </div>
      </div>
      <Arrow />
      <div className={`rounded-lg border p-3 ${violet}`}>
        <p className="font-semibold">3. Only “Voice Agent” dials</p>
        <p className="mt-1">The call goes out at that moment. <span className="font-semibold">One try.</span> Status becomes Voice Scheduled. The person does not pick an hour, and the app does not call again.</p>
        {detailed && (
          <p className="mt-1">A real ElevenLabs call needs a key, agent id, and phone number id. If any is missing, nothing is dialed, and the lead is still marked Voice Scheduled with a simulated id.</p>
        )}
      </div>
      <Arrow />
      <div className={`rounded-lg border p-3 ${violet}`}>
        <p className="font-semibold">4. Post-call webhook closes the loop</p>
        <p className="mt-1">ElevenLabs POSTs transcript and analysis to <span className="font-mono text-xs">POST /api/voice/callback</span> (public HTTPS / ngrok). HMAC is verified. The scoring LLM may extract a demo time.</p>
        <p className="mt-1"><span className="font-semibold">Booked Demo</span> if a demo was agreed; otherwise <span className="font-semibold">Voice Completed</span>. Claimed leads skip the webhook — a person manually marks completed or booked.</p>
      </div>
    </div>
  );
}
