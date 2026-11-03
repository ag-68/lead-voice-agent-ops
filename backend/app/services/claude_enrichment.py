from ..models import LeadEnrichment, LeadTier
from .llm_client import LlmCallError, score_lead


async def enrich_lead(
    name: str,
    email: str,
    company_name: str,
    job_title: str | None = None,
    message: str | None = None,
) -> tuple[LeadEnrichment, str, str]:
    """Score one lead. Returns enrichment, a short note, and who scored it."""

    try:
        return await score_lead(name, email, company_name, job_title, message)
    except LlmCallError as exc:
        # Billing, auth, or schema failures should not leave the lead stuck on Failed.
        enrichment, reasoning = _mock_enrichment(name, email, company_name, job_title, message)
        return (
            enrichment,
            f"Model scoring failed ({exc}). Fell back to name list. {reasoning}",
            "rules",
        )


def _mock_enrichment(
    name: str,
    email: str,
    company_name: str,
    job_title: str | None,
    message: str | None,
) -> tuple[LeadEnrichment, str]:
    """Name-list score used when no model key is configured."""

    domain = email.split("@")[1] if "@" in email else "unknown.com"
    company_lower = company_name.lower()

    fortune_500_keywords = ["microsoft", "google", "meta", "amazon", "apple", "ibm",
                           "oracle", "salesforce", "adobe", "cisco", "intel", "nvidia",
                           "deutsche telekom", "at&t", "verizon", "comcast"]

    is_fortune_500 = any(kw in company_lower for kw in fortune_500_keywords)

    if is_fortune_500:
        tier = LeadTier.FORTUNE_500
        score = 92
        employees = 50000
        revenue = 50000000000
        size = "enterprise"
    elif any(kw in company_lower for kw in ["corp", "inc", "technologies", "systems", "global"]):
        tier = LeadTier.ENTERPRISE
        score = 75
        employees = 2500
        revenue = 500000000
        size = "enterprise"
    elif "startup" in company_lower or "labs" in company_lower:
        tier = LeadTier.MID_MARKET
        score = 55
        employees = 150
        revenue = 20000000
        size = "mid-market"
    else:
        tier = LeadTier.SMB
        score = 35
        employees = 50
        revenue = 5000000
        size = "smb"

    enrichment = LeadEnrichment(
        company_domain=domain,
        company_industry="technology",
        company_size=size,
        company_employees=employees,
        company_revenue=revenue,
        company_region="north_america",
        company_description=f"{company_name} is a company in the technology sector.",
        is_fortune_500=is_fortune_500,
        icp_score=score,
        icp_reasoning="Fortune 500 company - high priority enterprise target." if is_fortune_500 else "Estimated from the company name. No model key is set.",
        tier=tier,
    )

    reasoning = (
        f"Name list, no model call. {name} at {company_name} ({email}). "
        f"Score {score}/100, tier {tier.value}."
    )
    return enrichment, reasoning
