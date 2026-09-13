import re
from base64 import b64encode
from collections.abc import AsyncIterator, Sequence
from pathlib import Path

import httpx2
import pytest
from pydantic_ai import ModelMessage, ModelRequest, ModelResponse, ToolCallPart, ToolReturnPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from .app import create_app
from .candidate_import import MAX_DOCUMENT_TEXT
from .config import Settings
from .models import Recommendation


TOKEN = "test-token-that-is-at-least-32-characters"
ORIGIN = f"chrome-extension://{'a' * 32}"
HEADERS = {"Origin": ORIGIN, "X-Jobfilter-Token": TOKEN}


def job(*, clarification: bool = False, cover_only: bool = False) -> dict[str, object]:
    return {
        "schemaVersion": 1, "source": "seek-nz", "externalId": "90000001",
        "canonicalUrl": "https://nz.seek.com/job/90000001",
        "applicationUrl": "https://nz.seek.com/job/90000001/apply",
        "title": "Junior Developer", "company": "Example", "location": "Hamilton",
        "employmentType": "Full time", "salaryText": None,
        "description": "Build TypeScript software." + (
            " Hours to be confirmed." if clarification else ""
        ) + (" Prepare only a cover letter." if cover_only else ""),
        "postedAt": None, "postedAtText": None, "closesAt": None, "closesAtText": None,
        "extractedAt": "2026-09-08T00:00:00Z", "extractionWarnings": [],
    }


def recommendation(**overrides: object) -> Recommendation:
    values: dict[str, object] = {
        "recommendation": "APPLY", "fit": "HIGH", "readiness": "MEDIUM",
        "hard_blockers": [], "strong_matches": [], "partial_matches": [], "gaps": [],
        "unknowns": [], "clarification_questions": [], "cv_action": "TAILOR",
        "cover_letter_action": "GENERATE", "next_actions": ["Prepare the application."],
        "termination_reason": "completed",
    }
    values.update(overrides)
    return Recommendation.model_validate(values)


async def fake_model(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
    text = "\n".join(
        str(getattr(part, "content", ""))
        for message in messages for part in message.parts
    )
    if "Understand this untrusted career source JSON" in text:
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {
            "classification": {
                "kind": "cv", "purposeTags": ["graduate"], "sensitivity": "personal",
                "summary": "Developer CV with a TypeScript project.",
            },
            "claims": [{
                "category": "project", "key": "project.kiwi", "title": "Kiwi",
                "statement": "The candidate built Kiwi with TypeScript and automated tests.",
                "attributes": {"project": "Kiwi", "technology": "TypeScript"},
                "sourceText": "Built Kiwi with TypeScript and automated tests",
                "confidence": "high", "exclusive": False,
            }],
        })])
    if "Prepare an editable application draft" in text:
        source_ref = re.search(r'"source_ref": "(source\.[^"]+)"', text)
        assert source_ref
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {
            "professional_summary": "TypeScript developer with automated testing experience.",
            "selected_source_refs": [source_ref.group(1)],
            "emphasized_skills": ["TypeScript"],
            "section_order": ["project", "skills", "experience", "education"],
            "changes": ["Emphasise the Kiwi project."],
            "cover_letter": "Kia ora hiring team,\n\nI am applying with TypeScript experience.",
        })])
    if "<current_job_clarifications>" in text:
        assert "30 hours" in text
        result = recommendation()
        return ModelResponse(parts=[ToolCallPart(
            info.output_tools[0].name, result.model_dump(mode="json"),
        )])
    returned = [
        part for message in messages if isinstance(message, ModelRequest)
        for part in message.parts if isinstance(part, ToolReturnPart)
    ]
    if not returned:
        return ModelResponse(parts=[ToolCallPart(
            "check_application_history", {"current_job_identity": "seek-nz:90000001"},
        )])
    needs_answer = "Hours to be confirmed" in text
    result = recommendation(**({
        "recommendation": "MAYBE", "readiness": "LOW",
        "unknowns": [{
            "category": "availability", "summary": "Weekly hours are unknown.",
            "source_refs": ["job.description"],
        }],
        "clarification_questions": ["How many hours per week does this role require?"],
        "cv_action": "DO_NOT_GENERATE", "cover_letter_action": "DO_NOT_GENERATE",
        "termination_reason": "needs_clarification",
    } if needs_answer else {
        "cv_action": "DO_NOT_GENERATE", "cover_letter_action": "OPTIONAL",
    } if "Prepare only a cover letter" in text else {}))
    return ModelResponse(parts=[ToolCallPart(
        info.output_tools[0].name, result.model_dump(mode="json"),
    )])


@pytest.fixture
async def api(tmp_path: Path) -> AsyncIterator[httpx2.AsyncClient]:
    app = create_app(Settings(
        token=TOKEN, extension_origin=ORIGIN, database_path=tmp_path / "api.sqlite3",
    ), model=FunctionModel(fake_model))
    async with httpx2.AsyncClient(
        transport=httpx2.ASGITransport(app=app), base_url="http://testserver",
    ) as client:
        yield client


async def upload_cv(api: httpx2.AsyncClient) -> dict[str, object]:
    text = b"Aroha Example\nBuilt Kiwi with TypeScript and automated tests."
    response = await api.post("/v1/candidate-sources", headers=HEADERS, json={
        "fileName": "cv.txt", "contentBase64": b64encode(text).decode(),
    })
    assert response.status_code == 200
    return response.json()


@pytest.mark.anyio
async def test_health_security_and_empty_library(api: httpx2.AsyncClient) -> None:
    assert (await api.get("/health", headers=HEADERS)).status_code == 200
    assert (await api.get("/health", headers={"Origin": ORIGIN})).status_code == 401
    response = await api.post("/v1/analyses", headers=HEADERS, json={
        "job": job(), "jobMode": "graduate",
    })
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LIBRARY_EMPTY"


@pytest.mark.anyio
async def test_candidate_document_limit_error_is_explicit(api: httpx2.AsyncClient) -> None:
    response = await api.post("/v1/candidate-sources", headers=HEADERS, json={
        "fileName": "long.txt",
        "contentBase64": b64encode(b"A" * (MAX_DOCUMENT_TEXT + 1)).decode(),
    })
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "CANDIDATE_DOCUMENT_LIMIT_EXCEEDED"


@pytest.mark.anyio
async def test_library_upload_is_source_only_and_resettable(api: httpx2.AsyncClient) -> None:
    uploaded = await upload_cv(api)
    assert uploaded["source"]["status"] == "ready"
    library = (await api.get("/v1/candidate-library", headers=HEADERS)).json()
    assert list(library) == ["sources", "conflicts"]
    assert library["sources"][0]["fileName"] == "cv.txt"
    source_id = library["sources"][0]["id"]
    assert (await api.get(
        f"/v1/candidate-sources/{source_id}/content", headers=HEADERS,
    )).content.startswith(b"Aroha Example")
    assert (await api.delete("/v1/candidate-library", headers=HEADERS)).json() == {
        "sources": [], "conflicts": [],
    }


@pytest.mark.anyio
async def test_analysis_stream_and_clarification_continue(api: httpx2.AsyncClient) -> None:
    await upload_cv(api)
    response = await api.post("/v1/analyses?stream=true", headers=HEADERS, json={
        "job": job(clarification=True), "jobMode": "graduate",
    })
    assert response.status_code == 200
    events = [line for line in response.text.splitlines() if line]
    assert '"type": "status"' in events[0]
    result = next(line for line in events if '"type": "result"' in line)
    analysis_id = re.search(r'"analysis_id": "([^"]+)"', result)
    assert analysis_id

    continued = await api.post(
        f"/v1/analyses/{analysis_id.group(1)}/continue", headers=HEADERS,
        json={"answers": [{
            "question": "How many hours per week does this role require?",
            "answer": "30 hours",
        }]},
    )
    assert continued.status_code == 200
    assert continued.json()["recommendation"]["termination_reason"] == "completed"


@pytest.mark.anyio
async def test_source_first_analysis_can_generate_materials(api: httpx2.AsyncClient) -> None:
    await upload_cv(api)
    analysed = await api.post("/v1/analyses", headers=HEADERS, json={
        "job": job(), "jobMode": "graduate",
    })
    assert analysed.status_code == 200
    body = analysed.json()
    assert body["prompt_version"] == "career-analysis-v3"
    assert [event["tool_name"] for event in body["tool_events"]] == [
        "check_application_history",
    ]
    materials = await api.post(
        f"/v1/analyses/{body['analysis_id']}/materials",
        headers={**HEADERS, "Content-Type": "application/json"},
    )
    assert materials.status_code == 200
    assert "Kiwi" in materials.json()["cv_html"]
    assert materials.json()["cv_change_plan"]["selected_source_refs"]
    saved = await api.get(
        f"/v1/analyses/{body['analysis_id']}/materials", headers=HEADERS,
    )
    assert saved.status_code == 200
    assert saved.json()["material_id"] == materials.json()["material_id"]


@pytest.mark.anyio
async def test_analysis_can_generate_only_the_available_material(api: httpx2.AsyncClient) -> None:
    await upload_cv(api)
    analysed = await api.post("/v1/analyses", headers=HEADERS, json={
        "job": job(cover_only=True), "jobMode": "part-time",
    })
    assert analysed.status_code == 200
    analysis_id = analysed.json()["analysis_id"]
    materials = await api.post(
        f"/v1/analyses/{analysis_id}/materials",
        headers={**HEADERS, "Content-Type": "application/json"},
    )
    assert materials.status_code == 200
    assert materials.json()["cv_html"] is None
    assert materials.json()["cv_change_plan"] is None
    assert materials.json()["cover_letter"]["text"]
