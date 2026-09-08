import sqlite3
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic_ai import ModelMessage, ModelRequest, ModelResponse, ToolCallPart, ToolReturnPart, models
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.usage import RequestUsage

from .agent import (
    AgentDependencies,
    compact_agent_history,
    create_career_agent,
    page_candidates,
    retrieval_character_budget,
    run_analysis,
)
from .app import runtime_checkpoint
from .models import (
    CandidateSourceClaimInput,
    CandidateSourceClassification,
    JobPosting,
    Recommendation,
    ToolEvent,
)
from .repository import create_candidate_source, open_database, save_candidate_source_claims, update_candidate_source


pytestmark = [
    pytest.mark.anyio,
    pytest.mark.filterwarnings("ignore:A `cost_limit` is set but cannot be enforced"),
]
models.ALLOW_MODEL_REQUESTS = False


def returned_tools(messages: Sequence[ModelMessage]) -> list[ToolReturnPart]:
    return [
        part
        for message in messages if isinstance(message, ModelRequest)
        for part in message.parts if isinstance(part, ToolReturnPart)
    ]


def output(info: AgentInfo, **overrides: object) -> ModelResponse:
    values: dict[str, object] = {
        "recommendation": "MAYBE", "fit": "MEDIUM", "readiness": "MEDIUM",
        "hard_blockers": [], "strong_matches": [], "partial_matches": [], "gaps": [],
        "unknowns": [], "clarification_questions": [], "cv_action": "DO_NOT_GENERATE",
        "cover_letter_action": "DO_NOT_GENERATE", "next_actions": [],
        "termination_reason": "completed",
    }
    values.update(overrides)
    recommendation = Recommendation.model_validate(values)
    return ModelResponse(parts=[ToolCallPart(
        info.output_tools[0].name, recommendation.model_dump(mode="json"),
    )])


def dependencies(tmp_path: Path, text: str = "Built Kiwi with Python automation."):
    connection = open_database(tmp_path / "agent.sqlite3")
    source, _ = create_candidate_source(
        connection, "cv.txt", "text/plain", text.encode(), text,
    )
    source = update_candidate_source(connection, source.id, CandidateSourceClassification(
        kind="cv", purposeTags=["graduate"], sensitivity="personal", summary="Developer CV.",
    ))
    job = JobPosting.model_validate({
        "schemaVersion": 1, "source": "seek-nz", "externalId": "90010001",
        "canonicalUrl": "https://nz.seek.com/job/90010001", "applicationUrl": None,
        "title": "Graduate Developer", "company": "Example", "location": "Hamilton",
        "employmentType": "Full time", "salaryText": None,
        "description": "Build Python automation and test software.", "postedAt": None,
        "postedAtText": None, "closesAt": None, "closesAtText": None,
        "extractedAt": "2026-09-08T00:00:00Z", "extractionWarnings": [],
    })
    return AgentDependencies(
        connection=connection, job=job, job_mode="graduate", now=datetime.now(UTC),
    ), connection, source


async def test_agent_may_finish_without_a_mandatory_tool_sequence(tmp_path: Path) -> None:
    async def planner(_messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        return output(
            info,
            unknowns=[{
                "category": "other", "summary": "The salary is not stated.",
                "source_refs": ["job.description"],
            }],
        )

    deps, connection, _ = dependencies(tmp_path)
    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.output.unknowns[0].source_refs == ["job.description"]
    assert deps.tool_events == []
    connection.close()


async def test_agent_chooses_claim_retrieval_and_receives_only_relevant_records(
    tmp_path: Path,
) -> None:
    deps, connection, source = dependencies(
        tmp_path, "Dilyar Example\nBuilt Kiwi with Python automation and tests.",
    )
    save_candidate_source_claims(connection, source.id, "Dilyar Example\nBuilt Kiwi with Python automation and tests.", [
        CandidateSourceClaimInput.model_validate({
            "category": "identity", "key": "identity.name", "title": "Name",
            "statement": "The candidate is Dilyar Example.",
            "attributes": {"full-name": "Dilyar Example"}, "sourceText": "Dilyar Example",
            "confidence": "high", "exclusive": True,
        }),
        CandidateSourceClaimInput.model_validate({
            "category": "project", "key": "project.kiwi", "title": "Kiwi",
            "statement": "The candidate built Kiwi with Python automation and tests.",
            "attributes": {"project": "Kiwi", "technology": "Python"},
            "sourceText": "Built Kiwi with Python automation and tests",
            "confidence": "high", "exclusive": False,
        }),
    ])

    async def planner(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        returned = returned_tools(messages)
        if not returned:
            return ModelResponse(parts=[ToolCallPart(
                "get_candidate_claims", {"requirements": ["Python automation experience"]},
            )])
        claims = returned[-1].content["claims"]
        assert len(claims) == 1 and claims[0]["title"] == "Kiwi"
        return output(info, strong_matches=[{
            "category": "skills", "summary": "The Kiwi project uses Python automation.",
            "source_refs": [claims[0]["sourceRef"]],
        }])

    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.output.strong_matches
    assert [event.tool_name for event in deps.tool_events] == ["get_candidate_claims"]
    connection.close()


async def test_agent_can_deliberately_open_a_sensitive_source(tmp_path: Path) -> None:
    text = "The holder may work in New Zealand for up to 20 hours each week."
    deps, connection, source = dependencies(tmp_path, text)
    source = update_candidate_source(connection, source.id, CandidateSourceClassification(
        kind="visa", purposeTags=["work-rights"], sensitivity="highly-sensitive",
        summary="New Zealand work visa.",
    ))

    async def planner(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        returned = returned_tools(messages)
        if not returned:
            prompt = "\n".join(
                str(getattr(part, "content", ""))
                for message in messages for part in message.parts
            )
            assert "visa" in prompt and source.id in prompt and "highly-sensitive" in prompt
            return ModelResponse(parts=[ToolCallPart(
                "open_candidate_source", {"source_id": source.id},
            )])
        opened = returned[-1].content
        assert opened["content"] == text
        return output(info, partial_matches=[{
            "category": "work_rights", "summary": "The visa states a 20-hour condition.",
            "source_refs": [opened["sourceRef"]],
        }])

    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.output.partial_matches[0].source_refs == [f"{source.id}.original"]
    assert deps.tool_events[0].result["characters"] == len(text)
    assert "content" not in deps.tool_events[0].result
    assert text not in str(runtime_checkpoint(deps))
    connection.close()


async def test_sensitive_search_text_is_observed_but_not_checkpointed(tmp_path: Path) -> None:
    text = "The holder may work in New Zealand for up to 20 hours each week."
    deps, connection, source = dependencies(tmp_path, text)
    update_candidate_source(connection, source.id, CandidateSourceClassification(
        kind="visa", purposeTags=["work-rights"], sensitivity="highly-sensitive",
        summary="New Zealand work visa.",
    ))

    async def planner(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        returned = returned_tools(messages)
        if not returned:
            return ModelResponse(parts=[ToolCallPart("search_candidate_documents", {
                "requirements": ["work New Zealand"], "source_ids": [source.id],
            })])
        match = returned[-1].content["sources"][0]
        assert text in match["excerpt"]
        return output(info, partial_matches=[{
            "category": "work_rights", "summary": "The visa states a 20-hour condition.",
            "source_refs": [match["sourceRef"]],
        }])

    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.output.partial_matches
    assert text not in str(deps.tool_events)
    assert text not in str(runtime_checkpoint(deps))
    connection.close()


async def test_repeated_full_source_reads_enter_safe_finalization(tmp_path: Path) -> None:
    deps, connection, source = dependencies(tmp_path)

    async def planner(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        if len(returned_tools(messages)) < 3:
            return ModelResponse(parts=[ToolCallPart(
                "open_candidate_source", {"source_id": source.id},
            )])
        return output(info, unknowns=[{
            "category": "other",
            "summary": "No further source inspection is needed.",
            "source_refs": ["job.description"],
        }])

    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert len(deps.tool_events) == 3
    assert deps.repeated_tool_calls == 2
    assert deps.finalization_reason == "no-progress"
    assert result.output.unknowns
    connection.close()


async def test_clarification_continuation_reuses_prior_source_observations(tmp_path: Path) -> None:
    deps, connection, source = dependencies(tmp_path)
    source_ref = f"{source.id}.chunk-1"
    deps.inherit([ToolEvent(
        sequence=1, tool_name="search_candidate_documents",
        arguments={"requirements": ["Python"], "sourceIds": [], "cursor": 0},
        result={"sourceRefs": [source_ref], "sources": [{"sourceRef": source_ref}]},
    )])

    async def planner(_messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        return output(info, partial_matches=[{
            "category": "skills", "summary": "Prior retrieval found Python.",
            "source_refs": [source_ref],
        }])

    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.output.partial_matches[0].source_refs == [source_ref]
    connection.close()


async def test_paid_result_is_not_discarded_by_a_total_token_cap(tmp_path: Path) -> None:
    async def planner(_messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        result = output(info)
        result.usage = RequestUsage(input_tokens=81_000, output_tokens=1_000)
        return result

    deps, connection, _ = dependencies(tmp_path)
    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.usage.total_tokens == 82_000
    connection.close()


async def test_distinct_empty_searches_do_not_take_tool_choice_from_the_agent(
    tmp_path: Path,
) -> None:
    queries = ["Kubernetes", "hospitality", "property management"]

    async def planner(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        returned = returned_tools(messages)
        if len(returned) < len(queries):
            return ModelResponse(parts=[ToolCallPart(
                "search_candidate_documents",
                {"requirements": [queries[len(returned)]]},
            )])
        return output(info, unknowns=[{
            "category": "experience",
            "summary": "The searched experience is not established by the current sources.",
            "source_refs": ["job.description"],
        }])

    deps, connection, _ = dependencies(tmp_path)
    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert len(deps.tool_events) == 3
    assert deps.finalizing is False
    assert result.output.unknowns
    connection.close()


async def test_json_encoded_tool_arrays_from_a_provider_are_normalised(tmp_path: Path) -> None:
    deps, connection, source = dependencies(tmp_path)

    async def planner(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        returned = returned_tools(messages)
        if not returned:
            return ModelResponse(parts=[ToolCallPart("search_candidate_documents", {
                "requirements": '["Python automation"]',
                "source_ids": f'["{source.id}"]',
            })])
        match = returned[-1].content["sources"][0]
        return output(info, strong_matches=[{
            "category": "skills", "summary": "The source describes Python automation.",
            "source_refs": [match["sourceRef"]],
        }])

    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.output.strong_matches
    assert deps.tool_events[0].arguments["sourceIds"] == [source.id]
    connection.close()


async def test_opened_source_id_citations_are_normalised_to_the_original(tmp_path: Path) -> None:
    deps, connection, source = dependencies(tmp_path)

    async def planner(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
        if not returned_tools(messages):
            return ModelResponse(parts=[ToolCallPart(
                "open_candidate_source", {"source_id": source.id},
            )])
        return output(info, strong_matches=[{
            "category": "skills", "summary": "The source describes Python automation.",
            "source_refs": [source.id],
        }])

    result = await run_analysis(create_career_agent(FunctionModel(planner)), deps, 5)
    assert result.output.strong_matches[0].source_refs == [f"{source.id}.original"]
    connection.close()


async def test_runtime_pagination_and_compaction_preserve_progress(tmp_path: Path) -> None:
    ranked = [
        ("Python", [{"sourceRef": "source.a"}, {"sourceRef": "source.b"}]),
        ("Testing", [{"sourceRef": "source.c"}, {"sourceRef": "source.d"}]),
    ]
    cursor = 0
    found: set[str] = set()
    while True:
        page, _coverage, next_cursor, _remaining = page_candidates(ranked, cursor, 1)
        found.update(str(item["sourceRef"]) for item in page)
        if next_cursor is None:
            break
        cursor = next_cursor
    assert found == {"source.a", "source.b", "source.c", "source.d"}

    deps, connection, _ = dependencies(tmp_path)
    messages = [
        ModelRequest(parts=[ToolReturnPart("search_candidate_documents", {"sources": ["old"]})]),
        ModelRequest(parts=[ToolReturnPart("search_candidate_documents", {"sources": ["latest"]})]),
    ]
    ctx = SimpleNamespace(deps=deps, context_window_used=0.7, run_id="test-run")
    processed = await compact_agent_history(ctx, messages)  # type: ignore[arg-type]
    assert returned_tools(processed)[0].content["kiwiCompacted"] is True

    budget_ctx = SimpleNamespace(
        context_window_used=0.9,
        model=SimpleNamespace(model_name="qwen3.7-plus", context_window=None), messages=[],
    )
    budget = retrieval_character_budget(budget_ctx)  # type: ignore[arg-type]
    assert budget is not None and 29_000 <= budget <= 30_000
    connection.close()
