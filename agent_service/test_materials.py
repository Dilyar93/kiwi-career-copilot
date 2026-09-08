from datetime import UTC, datetime
from pathlib import Path

from .materials import build_source_materials, select_base_cv
from .models import (
    AnalysisResponse,
    CandidateSourceClaimInput,
    CandidateSourceClassification,
    JobPosting,
    MaterialGenerationPlan,
    Recommendation,
    Usage,
)
from .repository import (
    create_candidate_source,
    open_database,
    save_candidate_source_claims,
    update_candidate_source,
)


def test_materials_render_from_a_selected_cv_source_only(tmp_path: Path) -> None:
    connection = open_database(tmp_path / "materials.sqlite3")
    text = "Aroha Example\nBuilt Kiwi with TypeScript and automated tests."
    source, _ = create_candidate_source(
        connection, "professional-cv.txt", "text/plain", text.encode(), text,
    )
    source = update_candidate_source(connection, source.id, CandidateSourceClassification(
        kind="cv", purposeTags=["graduate"], sensitivity="personal", summary="Developer CV.",
    ))
    claims = save_candidate_source_claims(connection, source.id, text, [
        CandidateSourceClaimInput.model_validate({
            "category": "project", "key": "project.kiwi", "title": "Kiwi",
            "statement": "Aroha built Kiwi with TypeScript and automated tests.",
            "attributes": {"project": "Kiwi", "technology": "TypeScript"},
            "sourceText": "Built Kiwi with TypeScript and automated tests",
            "confidence": "high", "exclusive": False,
        }),
    ])
    job = JobPosting.model_validate({
        "schemaVersion": 1, "source": "seek-nz", "externalId": "1",
        "canonicalUrl": "https://nz.seek.com/job/1", "applicationUrl": None,
        "title": "Graduate Developer", "company": "Example", "location": "Hamilton",
        "employmentType": "Full time", "salaryText": None,
        "description": "Build TypeScript services.", "postedAt": None,
        "postedAtText": None, "closesAt": None, "closesAtText": None,
        "extractedAt": "2026-09-08T00:00:00Z", "extractionWarnings": [],
    })
    analysis = AnalysisResponse(
        analysis_id="analysis-1", status="completed",
        recommendation=Recommendation(
            recommendation="APPLY", fit="HIGH", readiness="HIGH", hard_blockers=[],
            strong_matches=[], partial_matches=[], gaps=[], unknowns=[],
            clarification_questions=[], cv_action="TAILOR", cover_letter_action="GENERATE",
            next_actions=[], termination_reason="completed",
        ),
        tool_events=[], usage=Usage(), created_at=datetime.now(UTC),
        model="function:test", prompt_version="career-analysis-v3",
    )
    draft = MaterialGenerationPlan(
        professional_summary="TypeScript developer with automated testing experience.",
        selected_source_refs=[claims[0].source_ref], emphasized_skills=["TypeScript"],
        section_order=["project", "skills", "experience", "education"],
        changes=["Emphasise the Kiwi project."],
        cover_letter="Kia ora hiring team,\n\nI am applying with relevant TypeScript experience.",
    )

    assert select_base_cv([source], "graduate") == source
    bundle = build_source_materials(
        source, text, claims, job, analysis, draft, "material-1", datetime.now(UTC),
    )
    assert bundle.cv_change_plan.selected_source_refs == [claims[0].source_ref]
    assert "Kiwi" in bundle.cv_html and 'contenteditable="true"' in bundle.cv_html
    assert bundle.cover_letter.source_refs == [claims[0].source_ref]
