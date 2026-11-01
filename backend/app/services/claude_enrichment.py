import json
from anthropic import AsyncAnthropic
from ..config import get_settings
from ..models import LeadEnrichment, LeadTier

settings = get_settings()

ENRICHMENT_PROMPT = """You are an expert B2B lead qualification analyst. Your task is to enrich and score an inbound enterprise lead.

Given the following lead information:
- Name: {name}
- Email: {email}
- Company: {company_name}
- Job Title: {job_title}
- Message: {message}

Please analyze this lead and provide structured enrichment data. Research the company based on the name and email domain.

Our Ideal Customer Profile (ICP):
- Company Size: 100+ employees (enterprise focus)
- Industries: Technology, Finance, Healthcare, Media, Telecommunications
- Regions: North America, Europe, APAC
- Use Case: Companies needing AI voice/audio solutions for customer experience, content creation, or developer tools

Scoring Guidelines:
- Fortune 500 companies: 85-100 points
- Enterprise (1000+ employees, target industry): 70-84 points
- Mid-Market (100-999 employees, target industry): 50-69 points
- SMB (50-99 employees): 30-49 points
- Below threshold or misaligned industry: 0-29 points

Return ONLY a valid JSON object with these exact fields:
{{
    "company_domain": "extracted or inferred domain",
    "company_industry": "primary industry",
    "company_size": "enterprise/mid-market/smb/startup",
    "company_employees": estimated_employee_count_as_integer,
    "company_revenue": estimated_annual_revenue_as_float_or_null,
    "company_region": "north_america/europe/apac/latam/other",
    "company_description": "brief description of what the company does",
    "is_fortune_500": true_or_false,
    "icp_score": score_0_to_100,
    "icp_reasoning": "2-3 sentence explanation of the score",
    "tier": "fortune_500/enterprise/mid_market/smb/unqualified"
}}

Be realistic with estimates. If you cannot determine something with confidence, use reasonable defaults.
Respond with ONLY the JSON object, no markdown formatting or additional text."""


async def enrich_lead(
    name: str,
    email: str,
    company_name: str,
    job_title: str | None = None,
    message: str | None = None,
) -> tuple[LeadEnrichment, str]:
    """
    Use Claude to enrich lead data and score against ICP.
    Returns (enrichment_data, reasoning_chain)
    """
    
    if not settings.anthropic_api_key:
        return _mock_enrichment(name, email, company_name, job_title, message)
    
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    
    prompt = ENRICHMENT_PROMPT.format(
        name=name,
        email=email,
        company_name=company_name,
        job_title=job_title or "Not provided",
        message=message or "Not provided"
    )
    
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    
    content = response.content[0].text.strip()
    
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    
    data = json.loads(content)
    
    tier_map = {
        "fortune_500": LeadTier.FORTUNE_500,
        "enterprise": LeadTier.ENTERPRISE,
        "mid_market": LeadTier.MID_MARKET,
        "smb": LeadTier.SMB,
        "unqualified": LeadTier.UNQUALIFIED,
    }
    
    enrichment = LeadEnrichment(
        company_domain=data.get("company_domain"),
        company_industry=data.get("company_industry"),
        company_size=data.get("company_size"),
        company_employees=data.get("company_employees"),
        company_revenue=data.get("company_revenue"),
        company_region=data.get("company_region"),
        company_description=data.get("company_description"),
        is_fortune_500=data.get("is_fortune_500", False),
        icp_score=data.get("icp_score", 0),
        icp_reasoning=data.get("icp_reasoning", ""),
        tier=tier_map.get(data.get("tier", "unqualified"), LeadTier.UNQUALIFIED),
    )
    
    reasoning_chain = f"""
Lead Analysis Chain:
1. Input: {name} from {company_name} ({email})
2. Company Research: Analyzed company name and email domain
3. Industry Classification: {enrichment.company_industry}
4. Size Estimation: {enrichment.company_employees} employees ({enrichment.company_size})
5. ICP Alignment: Score {enrichment.icp_score}/100
6. Tier Assignment: {enrichment.tier.value}
7. Reasoning: {enrichment.icp_reasoning}
""".strip()
    
    return enrichment, reasoning_chain


def _mock_enrichment(
    name: str,
    email: str,
    company_name: str,
    job_title: str | None,
    message: str | None,
) -> tuple[LeadEnrichment, str]:
    """Mock enrichment for demo/testing without API key"""
    
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
        icp_reasoning=f"{'Fortune 500 company - high priority enterprise target.' if is_fortune_500 else 'Estimated based on company name patterns and domain analysis.'}",
        tier=tier,
    )
    
    reasoning_chain = f"""
Lead Analysis Chain (MOCK - No API Key):
1. Input: {name} from {company_name} ({email})
2. Domain Extraction: {domain}
3. Pattern Matching: Checked against known company patterns
4. Fortune 500 Check: {is_fortune_500}
5. ICP Score: {score}/100
6. Tier: {tier.value}
7. Note: Set ANTHROPIC_API_KEY for real Claude enrichment
""".strip()
    
    return enrichment, reasoning_chain
