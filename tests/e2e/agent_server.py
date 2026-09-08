import os
import re
from collections.abc import Sequence
from pathlib import Path

import uvicorn
from pydantic_ai import ModelMessage, ModelRequest, ModelResponse, ToolCallPart, ToolReturnPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_service.app import create_app
from agent_service.config import Settings
from agent_service.models import CandidateSourceClaimInput, CandidateSourceClassification, Recommendation
from agent_service.repository import (
    create_candidate_source,
    open_database,
    save_candidate_source_claims,
    update_candidate_source,
)


async def model(messages: Sequence[ModelMessage], info: AgentInfo) -> ModelResponse:
    text = "\n".join(
        str(getattr(part, "content", ""))
        for message in messages for part in message.parts
    )
    if "Prepare an editable application draft" in text:
        source_ref = re.search(r'"source_ref": "(source\.[^"]+)"', text)
        assert source_ref
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {
            "professional_summary": "Developer with automated testing experience.",
            "selected_source_refs": [source_ref.group(1)],
            "emphasized_skills": ["automated browser testing"],
            "section_order": ["project", "skills", "experience", "education"],
            "changes": ["Emphasise relevant testing experience."],
            "cover_letter": "Kia ora hiring team,\n\nCreated unit and browser-level tests for Kiwi.",
        })])
    returned = [
        part for message in messages if isinstance(message, ModelRequest)
        for part in message.parts if isinstance(part, ToolReturnPart)
    ]
    if not returned:
        return ModelResponse(parts=[ToolCallPart(
            "get_candidate_claims", {"requirements": ["automated testing"]},
        )])
    claim = returned[-1].content["claims"][0]
    output = Recommendation(
        recommendation="APPLY", fit="MEDIUM", readiness="MEDIUM", hard_blockers=[],
        strong_matches=[{
            "category": "skills", "summary": "Testing experience is available for tailoring.",
            "source_refs": [claim["sourceRef"]],
        }],
        partial_matches=[], gaps=[], unknowns=[], clarification_questions=[],
        cv_action="TAILOR", cover_letter_action="OPTIONAL",
        next_actions=["Review the source before preparing an application."],
        termination_reason="completed",
    )
    return ModelResponse(parts=[ToolCallPart(
        info.output_tools[0].name, output.model_dump(mode="json"),
    )])


def main() -> None:
    database = Path(os.environ["JOBFILTER_DATABASE_PATH"])
    connection = open_database(database)
    text = "Built Kiwi with automated browser testing."
    source, created = create_candidate_source(
        connection, "cv.txt", "text/plain", text.encode(), text,
    )
    if created:
        update_candidate_source(connection, source.id, CandidateSourceClassification(
            kind="cv", purposeTags=["graduate"], sensitivity="personal", summary="Developer CV.",
        ))
        save_candidate_source_claims(connection, source.id, text, [
            CandidateSourceClaimInput.model_validate({
                "category": "project", "key": "project.kiwi", "title": "Kiwi",
                "statement": "The candidate built Kiwi with automated browser testing.",
                "attributes": {"project": "Kiwi", "testing": "automated browser testing"},
                "sourceText": text, "confidence": "high", "exclusive": False,
            }),
        ])
    connection.close()
    settings = Settings.from_env()
    uvicorn.run(
        create_app(settings, model=FunctionModel(model)), host="127.0.0.1",
        port=settings.port, access_log=False, log_level="warning",
    )


if __name__ == "__main__":
    main()
