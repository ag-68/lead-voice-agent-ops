"""One structured model call, with a few retries.

This is not an agent. There are no tools the model can choose and no search.
The model must fill one schema. A bad reply or a temporary outage is tried
again, up to MAX_ATTEMPTS. A rejected key is not tried again.
"""

import asyncio
import json
import logging

import httpx

from ..models import LeadEnrichment, LeadTier
from .client_preferences import ideal_client_block, load_preferences
from .local_keys import active_llm

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 3

ENRICHMENT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "company_domain": {"type": "string"},
        "company_industry": {"type": "string"},
        "company_size": {
            "type": "string",
            "enum": ["enterprise", "mid-market", "smb", "startup"],
        },
        "company_employees": {"type": "integer"},
        "company_revenue": {"type": "number"},
        "company_region": {
            "type": "string",
            "enum": ["north_america", "europe", "apac", "latam", "other"],
        },
        "company_description": {"type": "string"},
        "is_fortune_500": {"type": "boolean"},
        "icp_score": {"type": "number"},
        "icp_reasoning": {"type": "string"},
        "tier": {
            "type": "string",
            "enum": ["fortune_500", "enterprise", "mid_market", "smb", "unqualified"],
        },
    },
    "required": [
        "company_domain",
        "company_industry",
        "company_size",
        "company_employees",
        "company_revenue",
        "company_region",
        "company_description",
        "is_fortune_500",
        "icp_score",
        "icp_reasoning",
        "tier",
    ],
}

_PROMPT = """You score one inbound sales lead. Use only the facts below and what you already know about the company. Do not browse.

Lead:
- Name: {name}
- Email: {email}
- Company: {company_name}
- Job title: {job_title}
- Message: {message}

{ideal_client}

Score guide:
- Fortune 500: 85-100
- Enterprise, 1000+ employees, fitting industry: 70-84
- Mid-market, 100-999 employees, fitting industry: 50-69
- Small business, 50-99 employees: 30-49
- Poor fit: 0-29

Fill every field of the schema. If revenue is unknown, use 0.
"""


class LlmCallError(Exception):
    def __init__(self, message: str, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


def parse_enrichment(data: dict) -> LeadEnrichment:
    if not isinstance(data, dict):
        raise LlmCallError("Model reply was not an object.", retryable=True)
    try:
        score = float(data.get("icp_score", 0))
        data = {**data, "icp_score": max(0.0, min(100.0, score))}
        tier = data.get("tier", "unqualified")
        if tier not in {item.value for item in LeadTier}:
            data = {**data, "tier": "unqualified"}
        # Keep flag and tier aligned — models sometimes set Fortune 500 true with tier=enterprise.
        if data.get("is_fortune_500"):
            data = {**data, "tier": LeadTier.FORTUNE_500.value}
        elif data.get("tier") == LeadTier.FORTUNE_500.value:
            data = {**data, "is_fortune_500": True}
        return LeadEnrichment.model_validate(data)
    except Exception as exc:
        raise LlmCallError(f"Model reply did not match the schema: {exc}", retryable=True) from exc


async def score_lead(
    name: str,
    email: str,
    company_name: str,
    job_title: str | None,
    message: str | None,
) -> tuple[LeadEnrichment, str, str]:
    setup = active_llm()
    if setup is None:
        raise LlmCallError("No model key is configured.", retryable=False)

    prefs = await load_preferences()
    ideal_client = ideal_client_block(prefs).replace("{", "{{").replace("}", "}}")
    prompt = _PROMPT.format(
        name=name,
        email=email,
        company_name=company_name,
        job_title=job_title or "Not provided",
        message=message or "Not provided",
        ideal_client=ideal_client,
    )
    last_error = "Model call failed."
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            data = await _call(setup, prompt)
            enrichment = parse_enrichment(data)
            reasoning = (
                f"Scored by {setup['label']} ({setup['model']}) "
                f"on attempt {attempt} of {MAX_ATTEMPTS}. "
                f"{enrichment.icp_reasoning}"
            )
            return enrichment, reasoning, setup["provider"]
        except LlmCallError as exc:
            last_error = str(exc)
            logger.warning("Lead scoring attempt %s failed: %s", attempt, last_error)
            if not exc.retryable or attempt == MAX_ATTEMPTS:
                break
            await asyncio.sleep(0.4 * attempt)
    raise LlmCallError(
        f"{last_error} Stopped after {attempt} of {MAX_ATTEMPTS} attempts.",
        retryable=False,
    )


async def _call(setup: dict, prompt: str) -> dict:
    provider = setup["provider"]
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            if provider == "anthropic":
                return await _anthropic(client, setup, prompt)
            if provider == "gemini":
                return await _gemini(client, setup, prompt)
            return await _openai(client, setup, prompt)
    except httpx.TimeoutException as exc:
        raise LlmCallError("The model provider took too long to answer.", retryable=True) from exc
    except httpx.HTTPError as exc:
        raise LlmCallError("Could not reach the model provider.", retryable=True) from exc


def _provider_detail(response: httpx.Response) -> str:
    try:
        message = response.json().get("error", {}).get("message", "")
    except ValueError:
        message = ""
    if not isinstance(message, str):
        return ""
    return " ".join(message.split())[:240]


def _status_error(response: httpx.Response) -> LlmCallError:
    if response.status_code in (401, 403):
        return LlmCallError("The model provider rejected the API key.", retryable=False)
    retryable = response.status_code in (400, 429) or response.status_code >= 500
    detail = _provider_detail(response)
    text = f"The model provider returned status {response.status_code}."
    if detail:
        text = f"{text} {detail}"
    return LlmCallError(text, retryable=retryable)


async def _anthropic(client: httpx.AsyncClient, setup: dict, prompt: str) -> dict:
    response = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": setup["api_key"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": setup["model"],
            "max_tokens": 1024,
            "tools": [
                {
                    "name": "record_lead_enrichment",
                    "description": "Record the structured score for this lead.",
                    "input_schema": ENRICHMENT_SCHEMA,
                }
            ],
            "tool_choice": {"type": "tool", "name": "record_lead_enrichment"},
            "messages": [{"role": "user", "content": prompt}],
        },
    )
    if response.status_code != 200:
        raise _status_error(response)
    for block in response.json().get("content", []):
        if block.get("type") == "tool_use" and isinstance(block.get("input"), dict):
            return block["input"]
    raise LlmCallError("Claude did not return the schema.", retryable=True)


async def _openai(client: httpx.AsyncClient, setup: dict, prompt: str) -> dict:
    response = await client.post(
        f"{setup['base_url']}/chat/completions",
        headers={
            "authorization": f"Bearer {setup['api_key']}",
            "content-type": "application/json",
        },
        json={
            "model": setup["model"],
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "lead_enrichment",
                    "strict": True,
                    "schema": ENRICHMENT_SCHEMA,
                },
            },
        },
    )
    if response.status_code != 200:
        raise _status_error(response)
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmCallError("The model reply had no content.", retryable=True) from exc
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise LlmCallError("The model reply was not valid JSON.", retryable=True) from exc
    return data


def _gemini_schema() -> dict:
    type_map = {"string": "STRING", "integer": "INTEGER", "number": "NUMBER", "boolean": "BOOLEAN"}
    properties = {}
    for name, spec in ENRICHMENT_SCHEMA["properties"].items():
        field = {"type": type_map[spec["type"]]}
        if "enum" in spec:
            field["enum"] = spec["enum"]
        properties[name] = field
    return {
        "type": "OBJECT",
        "properties": properties,
        "required": ENRICHMENT_SCHEMA["required"],
    }


async def _gemini(client: httpx.AsyncClient, setup: dict, prompt: str) -> dict:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{setup['model']}:generateContent"
    )
    response = await client.post(
        url,
        headers={"x-goog-api-key": setup["api_key"], "content-type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": _gemini_schema(),
            },
        },
    )
    if response.status_code != 200:
        raise _status_error(response)
    try:
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise LlmCallError("Gemini did not return the schema.", retryable=True) from exc
