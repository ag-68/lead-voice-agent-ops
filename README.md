# Voice-Agent Aided Lead Pipeline

Inbound lead qualifier with configurable LLM scoring, a human gate (dashboard + Slack), ElevenLabs outbound voice, and HMAC post-call webhooks — designed with **blast-radius** and an immutable audit trail.

![Pipeline](https://img.shields.io/badge/Pipeline-Intake→Score→Gate→Voice→Post--call-blue)

> **Live demo:** _add URL after deploy_ · **Walkthrough:** _add Loom / short video_

## Why this project (Internal AI / GTM automation)

Built as a portfolio demo of the work an **Internal AI Engineer** ships for GTM and ops: agentic workflows, Slack in the loop, Python APIs and webhooks, and safety as a first-class design choice.

| Theme from the role | How this repo shows it |
|---------------------|-------------------------|
| AI agents & workflow orchestration | Score → Selected/Parked → human choice → ElevenLabs dial → post-call branch |
| Integrate with the business stack (e.g. Slack) | Incoming webhook + interactivity (`Voice Agent` / `Myself` / `Remove`) |
| Reusable automation patterns | Modular FastAPI services, Configure panel, Client Preferences |
| Own the experiment end-to-end | Test Lead → score → gate → call (real or simulated) → Booked Demo |
| Evaluation, auditability, blast radius | Retries on scoring, audit log, blast-radius tags on sensitive actions |
| Backend depth (APIs, webhooks, orchestration) | FastAPI intake, HMAC callbacks, async pipeline jobs |

## Screenshots

Drop captures into [`docs/screenshots/`](docs/screenshots/) (see that folder’s README for filenames). Suggested embeds once files exist:

```markdown
![General](docs/screenshots/01-general.png)
![Pipeline flow](docs/screenshots/02-pipeline-flow.png)
![Leads + call card](docs/screenshots/03-leads.png)
![Slack gate](docs/screenshots/04-slack.png)
![Booked demos](docs/screenshots/05-booked-demos.png)
```

Never commit screenshots that show API keys, webhook URLs, or personal accounts.

## Overview

- **Intake** — `POST /api/leads/` or dashboard **Test Lead**
- **Scoring** — Groq / OpenAI / Claude / Gemini / compatible (Configure → Model); name-list fallback without a key
- **Human gate** — Selected (ICP ≥ 90 or Fortune 500) waits for **Voice Agent** / **Myself** / **Remove** (dashboard or Slack)
- **Voice** — ElevenLabs Conversational AI + Twilio after Voice Agent; simulates if voice is not configured
- **Post-call** — HMAC webhook → **Voice Completed** or **Booked Demo** (LLM may extract demo time)
- **Audit** — every step logged with blast-radius classification

## Architecture

```
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌─────────────────┐
│  Intake    │──▶│  LLM Score │──▶│  Human     │──▶│ ElevenLabs │──▶│ Post-call       │
│  webhook / │   │  (Groq…)   │   │  gate      │   │ outbound   │   │ webhook (HMAC)  │
│  Test Lead │   │            │   │ Slack / UI │   │ call       │   │ → Completed or  │
└────────────┘   └────────────┘   └────────────┘   └────────────┘   │   Booked Demo   │
       │                │                │                │          └────────┬────────┘
       └────────────────┴────────────────┴────────────────┘                   │
                                    │                                         ▼
                           ┌───────────────┐                         ┌────────────────┐
                           │  Audit Trail  │                         │ Booked Demos   │
                           └───────────────┘                         └────────────────┘
```

Callbacks need a **public HTTPS** API host (cloud deploy, or `ngrok http 8000` for local).

## Tech stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Python 3.11+, SQLAlchemy (async) |
| Database | SQLite locally (PostgreSQL-ready URL) |
| Scoring | Groq / OpenAI / Claude / Gemini / OpenAI-compatible |
| Voice | ElevenLabs Conversational AI + Twilio |
| Post-call | ElevenLabs webhook → `POST /api/voice/callback` |
| Human gate | Slack interactivity + dashboard call card |
| Frontend | Next.js, TypeScript, Tailwind, shadcn/ui |

## Quick start

### Prerequisites

- Python 3.11+, Node.js 18+
- Optional: LLM key, ElevenLabs + Twilio, Slack app, public HTTPS (ngrok or cloud)

### Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Leave keys empty for demo mode, or set them / paste via Configure on localhost
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard: http://localhost:3456

### Secrets

- Copy from `backend/.env.example` only. Never commit `.env` or `*.db`.
- On localhost you can paste Model / Voice / Slack into **Configure** (in-memory for that server process).
- For a public demo host, use environment variables on the platform — do not bake keys into the image or README.

## API (high level)

| Area | Endpoints |
|------|-----------|
| Leads | `POST/GET /api/leads/`, `GET /api/leads/stats`, `POST /api/leads/{id}/reprocess`, decide actions |
| Slack | `POST /api/slack/interactions`, `POST /api/slack/approve/{token}` |
| Voice | `POST /api/voice/callback`, `POST /api/voice/simulate/{id}`, `GET /api/voice/config` |
| Audit | `GET /api/audit/lead/{id}`, `GET /api/audit/high-risk`, `GET /api/audit/stats` |
| Local setup | `GET/POST /api/local-keys/…` (loopback only) |

## Pipeline statuses

1. **Received** → **Scoring** → **Scored**
2. **Selected** (≥90 or Fortune 500) or **Parked**
3. Human chooses **Voice Agent** / **Myself** / **Remove**
4. **Voice Scheduled** → post-call → **Voice Completed** or **Booked Demo**

## Blast radius

| Tag | Meaning | Examples |
|-----|---------|----------|
| `read_only` | No external effects | Lookups |
| `db_write` | Internal persistence | Status, score sheet |
| `slack_post` | Workspace message | Approval request |
| `voice_trigger` | Outbound dial | ElevenLabs call |
| `crm_write` / `external_api` | Reserved for CRM / calendar | Future |

High-blast steps wait on the human gate and are audited.

## Demo mode (no keys)

- Scoring falls back to a local name list
- Slack posts are skipped / mocked if no webhook
- Voice Agent simulates the dial

Suggested walkthrough:

1. **Test Lead** → pick Meta or Deutsche Telekom sample  
2. Confirm **Selected** and open the call card or Slack  
3. **Voice Agent** (simulate or real)  
4. Post-call or Simulate Meeting Booked → **Booked Demos**

## Project structure

```
├── backend/app/
│   ├── main.py
│   ├── config.py
│   ├── models/
│   ├── routers/          # leads, slack, voice, audit, local-keys, preferences
│   ├── services/         # pipeline, llm_client, slack, voice, audit, demo_booking
│   └── utils/
├── frontend/src/
│   ├── app/
│   ├── components/       # pipeline, leads, configure, booked demos, …
│   └── lib/
├── docs/screenshots/
└── README.md
```

## License

MIT
