from html import escape
from pathlib import Path

from .models import (
    CandidateSourceClaim,
    JobPosting,
    MaterialGenerationPlan,
)


SECTION_NAMES = {
    "experience": "Experience",
    "project": "Projects",
    "portfolio": "Portfolio",
    "achievement": "Achievements",
    "education": "Additional education evidence",
    "skills": "Skills",
    "certification": "Certifications",
}


def render_source_targeted_cv(
    name: str,
    claims: list[CandidateSourceClaim],
    job: JobPosting,
    plan: MaterialGenerationPlan,
    base_source_id: str,
) -> str:
    css = (Path(__file__).parent / "templates" / "cv.css").read_text(encoding="utf-8")
    selected = set(plan.selected_source_refs)
    contact = []
    for claim in claims:
        if claim.source_id != base_source_id or claim.category != "contact":
            continue
        contact.extend(claim.attributes.values())
    contact_html = " · ".join(escape(value) for value in dict.fromkeys(contact))

    grouped: dict[str, list[CandidateSourceClaim]] = {}
    for claim in claims:
        category = "skills" if claim.category == "skill" else claim.category
        if category in SECTION_NAMES:
            grouped.setdefault(category, []).append(claim)
    order = [*plan.section_order, *(
        category for category in SECTION_NAMES if category not in plan.section_order
    )]
    sections = []
    for category in order:
        records = grouped.get(category, [])
        if not records:
            continue
        records.sort(key=lambda claim: claim.source_ref not in selected)
        items = []
        for claim in records:
            attributes = claim.attributes
            heading = next((
                attributes[key]
                for key in ("role", "qualification", "project", "name", "skill")
                if key in attributes
            ), claim.title)
            meta = " · ".join(dict.fromkeys(
                attributes[key]
                for key in (
                    "employer", "institution", "organisation", "location",
                    "start-date", "end-date", "expected-completion", "period",
                )
                if key in attributes
            ))
            items.append(
                f'<article data-source-ref="{escape(claim.source_ref, quote=True)}">'
                f"<h3>{escape(heading)}</h3>"
                f'{f"<p class=\"meta\">{escape(meta)}</p>" if meta else ""}'
                f"<p>{escape(claim.statement)}</p></article>"
            )
        sections.append(
            f"<section><h2>{SECTION_NAMES[category]}</h2>{''.join(items)}</section>"
        )

    target = " · ".join(value for value in [job.title, job.company] if value)
    headline = " · ".join(plan.emphasized_skills[:4]) or job.title
    return f"""<!doctype html>
<html lang="en-NZ">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{escape(name)} — {escape(job.title)} CV</title><style>{css}</style></head>
<body><main contenteditable="true" spellcheck="true">
<header><h1>{escape(name)}</h1><p class="headline">{escape(headline)}</p><p class="target">Target role: {escape(target)}</p><p>{contact_html}</p></header>
<section><h2>Profile</h2><p>{escape(plan.professional_summary)}</p></section>
{''.join(sections)}
</main></body></html>"""
