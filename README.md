# Lead Qualifier Pipeline

An autonomous inbound lead qualifier with Claude-powered enrichment, Slack human-in-the-loop approval, and ElevenAgents voice follow-up.

![Pipeline Flow](https://img.shields.io/badge/Pipeline-Webhook→Claude→Slack→Voice-blue)

## Overview

This project demonstrates building AI-first internal tooling for GTM/Sales automation—the exact type of work described in the ElevenLabs Internal AI Engineer role. It showcases:

- **Webhook-driven lead intake** - FastAPI endpoint captures enterprise form submissions
- **Claude-powered enrichment** - AI analyzes companies, scores against ICP, and classifies tier
- **Human-in-the-loop guardrails** - High-value leads (Fortune 500, high ICP score) require Slack approval
- **ElevenAgents voice integration** - Automated voice outreach after human approval
- **Complete audit trail** - Every action logged with blast-radius classification
- **Systems-thinking design** - Security, auditability, and controlled blast radius from the start

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Webhook    │────▶│    Claude    │────▶│    Slack     │────▶│  ElevenLabs  │
│   Intake     │     │  Enrichment  │     │   Approval   │     │  Voice Agent │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       └────────────────────┴────────────────────┴────────────────────┘
                                    │
                           ┌───────────────┐
                           │  Audit Trail  │
                           │  (Immutable)  │
                           └───────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Python 3.11+, SQLAlchemy (async) |
| Database | SQLite (production: PostgreSQL) |
| AI Enrichment | Claude API (Anthropic) |
| Voice Agent | ElevenLabs Conversational AI |
| Approval Workflow | Slack Interactive Components |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- (Optional) Anthropic API key for Claude enrichment
- (Optional) ElevenLabs API key for voice calls
- (Optional) Slack app credentials for approval workflow

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
# Edit .env with your API keys (optional - works with mock mode)

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at http://localhost:3456

## API Endpoints

### Leads

- `POST /api/leads/` - Create a new lead (webhook endpoint)
- `GET /api/leads/` - List all leads with optional filters
- `GET /api/leads/{id}` - Get a specific lead
- `GET /api/leads/stats` - Pipeline statistics
- `POST /api/leads/{id}/reprocess` - Re-run enrichment

### Slack Integration

- `POST /api/slack/interactions` - Slack button callback handler
- `POST /api/slack/approve/{token}` - Direct URL approval (for testing)

### Audit

- `GET /api/audit/lead/{id}` - Complete audit trail for a lead
- `GET /api/audit/high-risk` - Recent high-risk actions
- `GET /api/audit/stats` - Audit statistics

### Voice

- `GET /api/voice/config` - Current voice agent configuration
- `POST /api/voice/callback` - ElevenAgents completion callback
- `POST /api/voice/simulate/{id}` - Simulate voice call (demo mode)

## Pipeline Flow

1. **Lead Received** - Webhook captures form submission with contact and company info
2. **Claude Enrichment** - AI analyzes the company:
   - Extracts/infers company domain, industry, size
   - Estimates employee count and revenue
   - Scores against Ideal Customer Profile (0-100)
   - Classifies tier (Fortune 500, Enterprise, Mid-Market, SMB, Unqualified)
3. **Approval Gate** - If Fortune 500 or ICP score ≥90:
   - Posts interactive message to Slack
   - Buttons: [Approve Voice Call] [Claim Manually] [Reject]
   - Blocks automated outreach until human decision
4. **Voice Outreach** - After approval:
   - Triggers ElevenAgents conversational AI call
   - Agent introduces ElevenLabs, qualifies interest
   - Can answer pricing/security questions
   - Books follow-up meetings

## Blast Radius Controls

Every action in the system is tagged with its blast radius:

| Blast Radius | Description | Example Actions |
|-------------|-------------|-----------------|
| `read_only` | No external effects | Lead lookup, audit queries |
| `db_write` | Internal database changes | Status updates, enrichment save |
| `slack_post` | Slack notifications | Approval request sent |
| `voice_trigger` | Voice call initiation | Outbound call started |
| `crm_write` | External CRM updates | (Future: Salesforce sync) |
| `external_api` | Other external API calls | (Future: Calendar booking) |

High-blast-radius actions require human approval and are logged with full reasoning chains.

## Demo Mode

The system works without any API keys in demo mode:

- **Claude enrichment** - Uses pattern matching for company classification
- **Slack integration** - Generates mock message IDs, approval via direct URL
- **Voice calls** - Simulated with configurable outcomes

To test the full flow:

1. Submit a lead via the dashboard (use "Meta" or "Deutsche Telekom" samples)
2. The lead will be flagged as Fortune 500 requiring approval
3. Use the direct approval URL or simulate approval in the UI
4. Trigger a simulated voice call from the lead detail view

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── config.py         # Settings and environment
│   │   ├── models/           # Database models and Pydantic schemas
│   │   ├── routers/          # API route handlers
│   │   ├── services/         # Business logic
│   │   │   ├── claude_enrichment.py  # AI enrichment
│   │   │   ├── slack_service.py      # Slack integration
│   │   │   ├── voice_agent.py        # ElevenLabs integration
│   │   │   └── audit.py              # Audit logging
│   │   └── utils/            # Database utilities
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js app router
│   │   ├── components/       # React components
│   │   │   ├── stats-cards.tsx
│   │   │   ├── leads-table.tsx
│   │   │   ├── lead-detail.tsx
│   │   │   ├── lead-form.tsx
│   │   │   └── pipeline-viz.tsx
│   │   └── lib/              # API client and utilities
│   └── package.json
└── README.md
```

## Why This Project

This project directly mirrors the responsibilities outlined in the ElevenLabs Internal AI Engineer role:

✅ **"Designing and iterating on AI agents and workflow orchestrations"** - Claude enrichment pipeline with structured outputs

✅ **"Integrating AI systems with core business stack - Salesforce, Slack"** - Full Slack interactive components integration

✅ **"Building reusable automation services and shared templates"** - Modular service architecture, audit framework

✅ **"Owning experiments end-to-end"** - Complete from webhook to voice call

✅ **"Developing evaluation and monitoring frameworks"** - Comprehensive audit trail with blast-radius classification

✅ **"Systems-thinking mindset with security, auditability, and blast radius"** - Core design principle

## License

MIT
