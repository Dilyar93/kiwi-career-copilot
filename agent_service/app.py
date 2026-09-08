import asyncio
from contextlib import suppress
from datetime import UTC, datetime
from decimal import Decimal
import hashlib
import json
import logging
from secrets import compare_digest
from urllib.parse import quote
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic_ai import UnexpectedModelBehavior, UsageLimitExceeded
from pydantic_ai.models import Model
from pydantic_ai.usage import RunUsage
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .agent import AgentDependencies, PROMPT_VERSION, create_career_agent, run_analysis
from .candidate_import import (
    CandidateDocumentError,
    create_candidate_import_agent,
    extract_candidate_document,
    run_candidate_import,
)
from .config import Settings
from .models import (
    AnalysisRequest,
    AnalysisResponse,
    ApplicationSummary,
    ApplicationUpdate,
    CandidateConflictResolutionRequest,
    CandidateLibrarySnapshot,
    CandidateImportRequest,
    CandidateSourceIngestResult,
    CandidateSourceMetadataUpdate,
    CandidateSourceSummary,
    ClarificationAnswer,
    ClarificationRequest,
    HealthResponse,
    JobPosting,
    MaterialBundle,
    Recommendation,
    ToolEvent,
    Usage,
)
from .materials import (
    build_source_materials,
    create_material_agent,
    run_material_plan,
    select_base_cv,
)
from .repository import (
    candidate_context_fingerprint,
    clear_candidate_workspace,
    create_candidate_source,
    delete_candidate_source,
    find_application_by_analysis,
    job_identity,
    list_applications,
    load_analysis,
    load_analysis_candidate_fingerprint,
    load_candidate_conflicts,
    load_candidate_claim_resolutions,
    load_candidate_claims,
    load_candidate_source_content,
    load_candidate_sources,
    load_clarification_answers,
    load_job,
    load_latest_materials,
    load_resumable_analysis,
    open_database,
    resolve_candidate_conflict,
    save_analysis,
    save_analysis_checkpoint,
    save_candidate_source_claims,
    save_materials,
    update_candidate_source,
    update_candidate_source_metadata,
    update_application_status,
)


TOKEN_HEADER = "x-jobfilter-token"
EXTENSION_ID_HEADER = "x-jobfilter-extension-id"
ALLOWED_HEADERS = {"content-type", TOKEN_HEADER, EXTENSION_ID_HEADER}
logger = logging.getLogger("uvicorn.error")


def library_snapshot(connection) -> CandidateLibrarySnapshot:
    return CandidateLibrarySnapshot(
        sources=load_candidate_sources(connection),
        conflicts=load_candidate_conflicts(connection),
    )


def runtime_checkpoint(deps: AgentDependencies) -> dict[str, object]:
    return {
        "observations": {
            key: {**value, "observation": value["summary"]}
            for key, value in deps.runtime_observations.items()
        },
        "requirementCoverage": deps.requirement_coverage,
        "repeatedToolCalls": deps.repeated_tool_calls,
        "consecutiveNoProgress": deps.consecutive_no_progress,
        "retrievalCalls": deps.retrieval_calls,
        "retrievedRefs": sorted(deps.retrieved_refs),
        "compactedToolReturns": deps.compacted_tool_returns,
        "finalizing": deps.finalizing,
        "finalizationReason": deps.finalization_reason,
    }


def restore_runtime(deps: AgentDependencies, run: dict[str, object]) -> None:
    runtime = run.get("runtime")
    if not isinstance(runtime, dict):
        return
    observations = runtime.get("observations", {})
    coverage = runtime.get("requirementCoverage", {})
    if isinstance(observations, dict):
        deps.runtime_observations = observations
    if isinstance(coverage, dict):
        deps.requirement_coverage = coverage
    deps.repeated_tool_calls = int(runtime.get("repeatedToolCalls", 0))
    deps.consecutive_no_progress = int(runtime.get("consecutiveNoProgress", 0))
    deps.retrieval_calls = int(runtime.get("retrievalCalls", 0))
    deps.retrieved_refs = {
        str(item) for item in runtime.get("retrievedRefs", [])
    }
    deps.compacted_tool_returns = int(runtime.get("compactedToolReturns", 0))
    deps.finalizing = bool(runtime.get("finalizing", False))
    reason = runtime.get("finalizationReason")
    deps.finalization_reason = str(reason) if reason else None
    deps.tool_events = [
        ToolEvent.model_validate(event) for event in run.get("toolEvents", [])
    ]


def combined_usage(previous: Usage, current: RunUsage) -> Usage:
    previous_cost = Decimal(previous.cost_usd) if previous.cost_usd is not None else None
    cost = (
        (previous_cost or Decimal(0)) + (current.cost or Decimal(0))
        if previous_cost is not None or current.cost is not None else None
    )
    return Usage(
        model_calls=previous.model_calls + current.requests,
        tool_calls=previous.tool_calls + current.tool_calls,
        input_tokens=previous.input_tokens + current.input_tokens,
        output_tokens=previous.output_tokens + current.output_tokens,
        cost_usd=str(cost) if cost is not None else None,
    )


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def add_cors_headers(response: Response, origin: str) -> None:
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Vary"] = "Origin"


class BodyTooLarge(Exception):
    pass


def candidate_document_error(error: CandidateDocumentError) -> HTTPException:
    code, message, status = {
        "unsupported": (
            "CANDIDATE_FILE_UNSUPPORTED",
            "Choose a PDF, DOCX, Markdown, or plain-text file",
            415,
        ),
        "too-large": (
            "CANDIDATE_FILE_TOO_LARGE",
            "The candidate document is too large",
            413,
        ),
        "no-text": (
            "CANDIDATE_FILE_NO_TEXT",
            "No readable text was found in the candidate document",
            422,
        ),
        "unreadable": (
            "CANDIDATE_FILE_UNREADABLE",
            "The candidate document could not be read",
            422,
        ),
    }[error.code]
    return HTTPException(status, {"code": code, "message": message})


class SecurityMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")

        async def reject(code: str, message: str, status_code: int) -> None:
            response = error_response(code, message, status_code)
            if origin == self.settings.extension_origin:
                add_cors_headers(response, origin)
            await response(scope, receive, send)

        if origin is not None and origin != self.settings.extension_origin:
            await reject("FORBIDDEN_ORIGIN", "Origin is not allowed", 403)
            return
        if origin is None and headers.get(EXTENSION_ID_HEADER) != self.settings.extension_id:
            await reject("FORBIDDEN_CLIENT", "Extension identity is missing or invalid", 403)
            return

        if scope["method"] == "OPTIONS":
            requested_method = headers.get("access-control-request-method", "")
            requested_headers = {
                value.strip().lower()
                for value in headers.get("access-control-request-headers", "").split(",")
                if value.strip()
            }
            if requested_method not in {"GET", "POST", "PATCH", "DELETE"} or not requested_headers <= ALLOWED_HEADERS:
                await reject("INVALID_PREFLIGHT", "CORS preflight is not allowed", 403)
                return
            response = Response(status_code=204)
            add_cors_headers(response, self.settings.extension_origin)
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE"
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, X-Jobfilter-Token, X-Jobfilter-Extension-Id"
            )
            response.headers["Access-Control-Max-Age"] = "600"
            await response(scope, receive, send)
            return

        if not compare_digest(headers.get(TOKEN_HEADER, ""), self.settings.token):
            await reject("UNAUTHORIZED", "Token is missing or invalid", 401)
            return

        limited_receive = receive
        if scope["method"] in {"POST", "PATCH"}:
            if headers.get("content-type", "").split(";", 1)[0].lower() != "application/json":
                await reject("UNSUPPORTED_MEDIA_TYPE", "Expected application/json", 415)
                return
            content_length = headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > self.settings.max_body_bytes:
                        await reject("BODY_TOO_LARGE", "Request body is too large", 413)
                        return
                except ValueError:
                    await reject("INVALID_CONTENT_LENGTH", "Content-Length is invalid", 400)
                    return

            received_bytes = 0

            async def receive_with_limit() -> Message:
                nonlocal received_bytes
                message = await receive()
                if message["type"] == "http.request":
                    received_bytes += len(message.get("body", b""))
                    if received_bytes > self.settings.max_body_bytes:
                        raise BodyTooLarge
                return message

            limited_receive = receive_with_limit

        response_started = False

        async def send_with_cors(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                if origin:
                    response_headers = MutableHeaders(scope=message)
                    response_headers["Access-Control-Allow-Origin"] = origin
                    response_headers["Vary"] = "Origin"
            await send(message)

        try:
            await self.app(scope, limited_receive, send_with_cors)
        except BodyTooLarge:
            if response_started:
                raise
            await reject("BODY_TOO_LARGE", "Request body is too large", 413)


def create_app(settings: Settings, model: Model | str | None = None) -> FastAPI:
    app = FastAPI(
        title="Job Filter Local Agent",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(SecurityMiddleware, settings=settings)
    configured_model = model or settings.agent_model
    career_agent = create_career_agent(configured_model)
    candidate_import_agent = create_candidate_import_agent(configured_model)
    material_agent = create_material_agent(configured_model)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _error: RequestValidationError) -> JSONResponse:
        return error_response("VALIDATION_ERROR", "Request validation failed", 422)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, error: HTTPException) -> JSONResponse:
        if isinstance(error.detail, dict):
            code = error.detail.get("code")
            message = error.detail.get("message")
            if isinstance(code, str) and isinstance(message, str):
                return error_response(code, message, error.status_code)
        return error_response("HTTP_ERROR", str(error.detail), error.status_code)

    async def understand_candidate_source(
        source: CandidateSourceSummary,
        document_text: str,
        warnings: list[str],
    ) -> CandidateSourceIngestResult:
        try:
            result = await run_candidate_import(
                candidate_import_agent,
                source.file_name,
                document_text,
            )
        except Exception:
            logger.exception("Candidate source understanding failed file=%s", source.file_name)
            connection = open_database(settings.database_path)
            try:
                source = update_candidate_source(connection, source.id, None)
                conflicts = load_candidate_conflicts(connection)
            finally:
                connection.close()
            return CandidateSourceIngestResult(
                source=source,
                conflicts=conflicts,
                warnings=[*warnings, "source-understanding-failed"],
            )

        connection = open_database(settings.database_path)
        try:
            source = update_candidate_source(
                connection, source.id, result.output.classification,
            )
            claims = save_candidate_source_claims(
                connection, source.id, document_text, result.output.claims,
            )
            conflicts = load_candidate_conflicts(connection)
        finally:
            connection.close()
        logger.info(
            "Candidate source ready file=%s kind=%s claims=%s",
            source.file_name,
            source.kind,
            len(claims),
        )
        return CandidateSourceIngestResult(
            source=source,
            conflicts=conflicts,
            warnings=warnings,
        )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", service="jobfilter-agent", api_version=1)

    @app.get("/v1/candidate-library", response_model=CandidateLibrarySnapshot)
    async def get_candidate_library() -> CandidateLibrarySnapshot:
        connection = open_database(settings.database_path)
        try:
            return library_snapshot(connection)
        finally:
            connection.close()

    @app.delete("/v1/candidate-library", response_model=CandidateLibrarySnapshot)
    async def reset_candidate_workspace() -> CandidateLibrarySnapshot:
        connection = open_database(settings.database_path)
        try:
            clear_candidate_workspace(connection)
            return library_snapshot(connection)
        finally:
            connection.close()

    @app.post("/v1/candidate-sources", response_model=CandidateSourceIngestResult)
    async def add_candidate_source(request: CandidateImportRequest) -> CandidateSourceIngestResult:
        try:
            filename, media_type, content, document_text, warnings = extract_candidate_document(
                request,
            )
        except CandidateDocumentError as error:
            raise candidate_document_error(error) from error

        connection = open_database(settings.database_path)
        try:
            source, created = create_candidate_source(
                connection, filename, media_type, content, document_text,
            )
        finally:
            connection.close()
        if not created:
            connection = open_database(settings.database_path)
            try:
                return CandidateSourceIngestResult(
                    source=source,
                    conflicts=load_candidate_conflicts(connection),
                    warnings=[*warnings, "duplicate-source"],
                )
            finally:
                connection.close()

        logger.info("Candidate source saved file=%s chars=%s", filename, len(document_text))
        return await understand_candidate_source(source, document_text, warnings)

    @app.get("/v1/candidate-sources/{source_id}/content")
    async def get_candidate_source_content(source_id: str) -> Response:
        connection = open_database(settings.database_path)
        try:
            source = load_candidate_source_content(connection, source_id)
        finally:
            connection.close()
        if not source:
            raise HTTPException(404, {
                "code": "CANDIDATE_SOURCE_NOT_FOUND",
                "message": "This source is no longer available",
            })
        filename, media_type, content, _ = source
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}"},
        )

    @app.patch(
        "/v1/candidate-sources/{source_id}",
        response_model=CandidateSourceSummary,
    )
    async def edit_candidate_source(
        source_id: str,
        request: CandidateSourceMetadataUpdate,
    ) -> CandidateSourceSummary:
        connection = open_database(settings.database_path)
        try:
            source = update_candidate_source_metadata(connection, source_id, request)
        finally:
            connection.close()
        if not source:
            raise HTTPException(404, {
                "code": "CANDIDATE_SOURCE_NOT_FOUND",
                "message": "This source is no longer available",
            })
        return source

    @app.post(
        "/v1/candidate-sources/{source_id}/reprocess",
        response_model=CandidateSourceIngestResult,
    )
    async def reprocess_candidate_source(source_id: str) -> CandidateSourceIngestResult:
        connection = open_database(settings.database_path)
        try:
            content = load_candidate_source_content(connection, source_id)
            source = next(
                (item for item in load_candidate_sources(connection) if item.id == source_id),
                None,
            )
        finally:
            connection.close()
        if not content or not source:
            raise HTTPException(404, {
                "code": "CANDIDATE_SOURCE_NOT_FOUND",
                "message": "This source is no longer available",
            })
        return await understand_candidate_source(source, content[3], [])

    @app.delete("/v1/candidate-sources/{source_id}", response_model=CandidateLibrarySnapshot)
    async def remove_candidate_source(source_id: str) -> CandidateLibrarySnapshot:
        connection = open_database(settings.database_path)
        try:
            if not delete_candidate_source(connection, source_id):
                raise HTTPException(404, {
                    "code": "CANDIDATE_SOURCE_NOT_FOUND",
                    "message": "This source is no longer available",
                })
            return library_snapshot(connection)
        finally:
            connection.close()

    @app.post(
        "/v1/candidate-conflicts/{conflict_id}/resolve",
        response_model=CandidateLibrarySnapshot,
    )
    async def resolve_claim_conflict(
        conflict_id: str,
        request: CandidateConflictResolutionRequest,
    ) -> CandidateLibrarySnapshot:
        connection = open_database(settings.database_path)
        try:
            if not resolve_candidate_conflict(
                connection, conflict_id, request.selected_claim_id,
            ):
                raise HTTPException(404, {
                    "code": "CANDIDATE_CONFLICT_NOT_FOUND",
                    "message": "This conflict is no longer available",
                })
            return library_snapshot(connection)
        finally:
            connection.close()

    async def analyse(
        connection,
        job: JobPosting,
        job_mode: str,
        clarification_answers: tuple[ClarificationAnswer, ...] = (),
        previous_analysis: AnalysisResponse | None = None,
        on_tool_event=None,
    ) -> AnalysisResponse:
        identity = job_identity(job)
        deps: AgentDependencies | None = None
        save_checkpoint = None
        logger.info(
            "Analysis started job=%s mode=%s continuation=%s",
            identity,
            job_mode,
            bool(clarification_answers),
        )
        try:
            if not load_candidate_sources(connection):
                raise HTTPException(409, {
                    "code": "LIBRARY_EMPTY",
                    "message": "Add career material before analysis",
                })
            candidate_fingerprint = candidate_context_fingerprint(connection)
            job_fingerprint = hashlib.sha256(
                job.model_dump_json(
                    by_alias=True,
                    exclude={"extracted_at"},
                ).encode(),
            ).hexdigest()
            resumable = load_resumable_analysis(
                connection,
                identity,
                job_mode,
                job_fingerprint,
                candidate_fingerprint,
                PROMPT_VERSION,
                clarification_answers,
            )
            analysis_id = str(resumable["runId"]) if resumable else str(uuid4())
            started_at = (
                str(resumable.get("createdAt"))
                if resumable and resumable.get("createdAt") else datetime.now(UTC).isoformat()
            )
            previous_usage = Usage.model_validate(
                resumable.get("usage", {}) if resumable else {},
            )
            current_usage = RunUsage()
            deps = AgentDependencies(
                connection=connection,
                job=job,
                job_mode=job_mode,
                now=datetime.now(UTC),
                clarification_answers=list(clarification_answers),
                previous_recommendation=(
                    previous_analysis.recommendation if previous_analysis else None
                ),
            )
            if resumable:
                restore_runtime(deps, resumable)
                logger.info(
                    "Analysis resumed id=%s job=%s observations=%s tools=%s",
                    analysis_id,
                    identity,
                    len(deps.runtime_observations),
                    len(deps.tool_events),
                )
            if (
                previous_analysis
                and load_analysis_candidate_fingerprint(
                    connection, previous_analysis.analysis_id,
                ) == candidate_fingerprint
            ):
                deps.inherit(previous_analysis.tool_events)

            def persist_checkpoint(
                status: str,
                error_code: str | None = None,
            ) -> None:
                updated_at = datetime.now(UTC).isoformat()
                document: dict[str, object] = {
                    "runId": analysis_id,
                    "status": status,
                    "promptVersion": PROMPT_VERSION,
                    "model": str(resumable.get("model", settings.agent_model))
                    if resumable else settings.agent_model,
                    "inputSummary": {
                        "jobIdentity": identity,
                        "title": job.title,
                        "jobMode": job_mode,
                        "jobFingerprint": job_fingerprint,
                        "candidateFingerprint": candidate_fingerprint,
                        "clarificationAnswers": [
                            answer.model_dump(mode="json")
                            for answer in clarification_answers
                        ],
                    },
                    "toolEvents": [
                        event.model_dump(mode="json") for event in deps.tool_events
                    ],
                    "runtime": runtime_checkpoint(deps),
                    "usage": combined_usage(previous_usage, current_usage).model_dump(mode="json"),
                    "createdAt": started_at,
                    "updatedAt": updated_at,
                }
                if error_code:
                    document["error"] = {"code": error_code}
                save_analysis_checkpoint(connection, job, document)

            save_checkpoint = persist_checkpoint
            persist_checkpoint("processing")
            if resumable and on_tool_event:
                for event in deps.tool_events:
                    on_tool_event(event)

            def record_tool_event(event: ToolEvent) -> None:
                persist_checkpoint("processing")
                if on_tool_event:
                    on_tool_event(event)

            deps.on_tool_event = record_tool_event
            result = await run_analysis(career_agent, deps, usage=current_usage)
            model_name = next(
                (
                    message.model_name
                    for message in reversed(result.all_messages())
                    if getattr(message, "model_name", None)
                ),
                settings.agent_model,
            )
            usage = combined_usage(previous_usage, result.usage)
            persist_checkpoint("processing")
            response = AnalysisResponse(
                analysis_id=analysis_id,
                status="completed",
                recommendation=result.output,
                tool_events=deps.tool_events,
                usage=usage,
                created_at=datetime.now(UTC),
                model=model_name,
                prompt_version=PROMPT_VERSION,
            )
            save_analysis(connection, job, job_mode, response, clarification_answers)
            logger.info(
                "Analysis completed id=%s job=%s recommendation=%s requests=%s "
                "tool_calls=%s input_tokens=%s output_tokens=%s repeated_calls=%s "
                "compacted_results=%s finalization=%s",
                response.analysis_id,
                identity,
                response.recommendation.recommendation,
                response.usage.model_calls,
                response.usage.tool_calls,
                response.usage.input_tokens,
                response.usage.output_tokens,
                deps.repeated_tool_calls,
                deps.compacted_tool_returns,
                deps.finalization_reason,
            )
            return response
        except HTTPException:
            raise
        except asyncio.CancelledError:
            if save_checkpoint:
                save_checkpoint("interrupted", "CLIENT_INTERRUPTED")
            raise
        except TimeoutError as error:
            if save_checkpoint:
                save_checkpoint("failed", "AGENT_TIMEOUT")
            logger.warning("Analysis provider connection timed out job=%s", identity)
            raise HTTPException(504, {
                "code": "AGENT_TIMEOUT",
                "message": "The model service stopped responding. Analysis progress was saved; try again to continue.",
            }) from error
        except UsageLimitExceeded as error:
            if save_checkpoint:
                save_checkpoint("failed", "AGENT_STEP_LIMIT")
            logger.warning(
                "Analysis stopped by framework loop protection job=%s reason=%s tools=%s",
                identity,
                error,
                [event.tool_name for event in deps.tool_events] if deps else [],
            )
            raise HTTPException(429, {
                "code": "AGENT_STEP_LIMIT",
                "message": "Kiwi could not safely finish from the available evidence. Analysis progress was saved; try again to continue.",
            }) from error
        except UnexpectedModelBehavior as error:
            if save_checkpoint:
                save_checkpoint("failed", "AGENT_OUTPUT_INVALID")
            logger.exception(
                "Analysis could not validate a final result job=%s tools=%s",
                identity,
                [event.tool_name for event in deps.tool_events] if deps else [],
            )
            raise HTTPException(502, {
                "code": "AGENT_OUTPUT_INVALID",
                "message": "Kiwi could not assemble a valid result from the completed checks. Analysis progress was saved; try again to continue.",
            }) from error
        except Exception as error:
            if save_checkpoint:
                save_checkpoint("failed", "AGENT_MODEL_ERROR")
            logger.exception(
                "Analysis failed job=%s tools=%s",
                identity,
                [event.tool_name for event in deps.tool_events] if deps else [],
            )
            raise HTTPException(502, {
                "code": "AGENT_MODEL_ERROR",
                "message": "The model service could not complete the analysis. Analysis progress was saved; try again to continue.",
            }) from error

    def stream_analysis(
        job: JobPosting,
        job_mode: str,
        clarification_answers: tuple[ClarificationAnswer, ...] = (),
        previous_analysis: AnalysisResponse | None = None,
    ) -> StreamingResponse:
        async def events():
            queue: asyncio.Queue[ToolEvent] = asyncio.Queue()
            connection = open_database(settings.database_path)
            task = asyncio.create_task(analyse(
                connection,
                job,
                job_mode,
                clarification_answers,
                previous_analysis,
                queue.put_nowait,
            ))
            try:
                yield json.dumps({"type": "status", "stage": "planning"}) + "\n"
                while not task.done():
                    try:
                        event = await asyncio.wait_for(queue.get(), 0.25)
                    except TimeoutError:
                        continue
                    yield json.dumps({
                        "type": "tool",
                        "event": event.model_dump(mode="json"),
                    }) + "\n"
                while not queue.empty():
                    event = queue.get_nowait()
                    yield json.dumps({
                        "type": "tool",
                        "event": event.model_dump(mode="json"),
                    }) + "\n"
                response = await task
                yield json.dumps({
                    "type": "result",
                    "analysis": response.model_dump(mode="json"),
                }) + "\n"
            except HTTPException as error:
                detail = error.detail if isinstance(error.detail, dict) else {}
                yield json.dumps({
                    "type": "error",
                    "error": {
                        "code": detail.get("code", "HTTP_ERROR"),
                        "message": detail.get("message", "Analysis failed"),
                    },
                }) + "\n"
            finally:
                if not task.done():
                    task.cancel()
                    with suppress(asyncio.CancelledError):
                        await task
                connection.close()

        return StreamingResponse(events(), media_type="application/x-ndjson")

    @app.post("/v1/analyses", response_model=AnalysisResponse)
    async def create_analysis(request: AnalysisRequest, stream: bool = False):
        if stream:
            return stream_analysis(request.job, request.job_mode)
        connection = open_database(settings.database_path)
        try:
            return await analyse(connection, request.job, request.job_mode)
        finally:
            connection.close()

    @app.post(
        "/v1/analyses/{analysis_id}/continue",
        response_model=AnalysisResponse,
    )
    async def continue_analysis(
        analysis_id: str,
        request: ClarificationRequest,
        stream: bool = False,
    ):
        connection = open_database(settings.database_path)
        try:
            previous = load_analysis(connection, analysis_id)
            application = find_application_by_analysis(connection, analysis_id)
            if not previous or not application:
                raise HTTPException(404, {
                    "code": "ANALYSIS_NOT_FOUND",
                    "message": "The analysis is no longer available",
                })
            expected = set(previous.recommendation.clarification_questions)
            provided = [answer.question for answer in request.answers]
            if (
                not expected
                or len(provided) != len(set(provided))
                or set(provided) != expected
            ):
                raise HTTPException(409, {
                    "code": "INVALID_CLARIFICATION",
                    "message": "Answer the current clarification questions before continuing",
                })
            job = load_job(connection, str(application["jobIdentity"]))
            if not job:
                raise HTTPException(409, {
                    "code": "ANALYSIS_INPUTS_MISSING",
                    "message": "The saved job is no longer available",
                })
            args = (
                job,
                str(application["jobMode"]),
                tuple(load_clarification_answers(connection, analysis_id) + request.answers),
                previous,
            )
            return stream_analysis(*args) if stream else await analyse(connection, *args)
        finally:
            connection.close()

    @app.get("/v1/analyses/{analysis_id}", response_model=AnalysisResponse)
    async def get_analysis(analysis_id: str) -> AnalysisResponse:
        connection = open_database(settings.database_path)
        try:
            analysis = load_analysis(connection, analysis_id)
            if not analysis:
                raise HTTPException(404, "Analysis not found")
            return analysis
        finally:
            connection.close()

    @app.post(
        "/v1/analyses/{analysis_id}/materials",
        response_model=MaterialBundle,
    )
    async def create_materials(analysis_id: str) -> MaterialBundle:
        connection = open_database(settings.database_path)
        try:
            analysis = load_analysis(connection, analysis_id)
            application = find_application_by_analysis(connection, analysis_id)
            if not analysis or not application:
                raise HTTPException(404, "Analysis not found")
            job = load_job(connection, str(application["jobIdentity"]))
            if not job:
                raise HTTPException(409, "Analysis inputs are unavailable")
            recommendation = analysis.recommendation
            if (
                recommendation.hard_blockers
                or (
                    recommendation.cv_action == "DO_NOT_GENERATE"
                    and recommendation.cover_letter_action == "DO_NOT_GENERATE"
                )
            ):
                raise HTTPException(409, "This analysis does not allow material generation")
            try:
                sources = load_candidate_sources(connection)
                base_source = select_base_cv(sources, str(application["jobMode"]))
                if base_source:
                    source = load_candidate_source_content(connection, base_source.id)
                    allowed_source_ids = {
                        base_source.id,
                        *(
                            item.id for item in sources
                            if item.kind in {"project", "certificate", "portfolio"}
                            and item.status == "ready"
                            and item.sensitivity != "highly-sensitive"
                        ),
                    }
                    conflicted = {
                        claim.id
                        for conflict in load_candidate_conflicts(connection)
                        for claim in conflict.claims
                    }
                    resolutions = load_candidate_claim_resolutions(connection)
                    all_claims = load_candidate_claims(connection)
                    claims = [
                        claim for claim in all_claims
                        if claim.source_id in allowed_source_ids
                        and claim.confidence != "low"
                        and (
                            claim.id not in conflicted
                            or resolutions.get(claim.key) == claim.id
                        )
                    ]
                    logger.info(
                        "Application material planning started analysis=%s base=%s records=%s",
                        analysis_id,
                        base_source.id,
                        len(claims),
                    )
                    try:
                        draft = await run_material_plan(
                            material_agent,
                            job,
                            str(application["jobMode"]),
                            analysis,
                            claims,
                            load_clarification_answers(connection, analysis_id),
                        )
                    except Exception as error:
                        logger.exception(
                            "Application material planning failed analysis=%s",
                            analysis_id,
                        )
                        raise HTTPException(502, {
                            "code": "MATERIAL_GENERATION_FAILED",
                            "message": "Kiwi could not prepare the application draft. Try again from the saved analysis.",
                        }) from error
                    bundle = build_source_materials(
                        base_source,
                        source[3] if source else "",
                        all_claims,
                        job,
                        analysis,
                        draft,
                        str(uuid4()),
                        datetime.now(UTC),
                    )
                else:
                    raise ValueError("Add a CV source before preparing application materials")
            except ValueError as error:
                raise HTTPException(409, str(error)) from error
            save_materials(connection, bundle)
            source_refs = (
                bundle.cv_change_plan.selected_source_refs
                if bundle.cv_change_plan else
                bundle.cover_letter.source_refs
                if bundle.cover_letter else []
            )
            logger.info(
                "Application materials created analysis=%s source_refs=%s",
                analysis_id,
                len(source_refs),
            )
            return bundle
        finally:
            connection.close()

    @app.get(
        "/v1/analyses/{analysis_id}/materials",
        response_model=MaterialBundle,
    )
    async def get_materials(analysis_id: str) -> MaterialBundle:
        connection = open_database(settings.database_path)
        try:
            bundle = load_latest_materials(connection, analysis_id)
            if not bundle:
                raise HTTPException(404, "Application materials not found")
            return bundle
        finally:
            connection.close()

    @app.get("/v1/applications", response_model=list[ApplicationSummary])
    async def get_applications() -> list[ApplicationSummary]:
        connection = open_database(settings.database_path)
        try:
            return list_applications(connection)
        finally:
            connection.close()

    @app.patch("/v1/applications/{application_id}", response_model=ApplicationSummary)
    async def patch_application(
        application_id: str,
        request: ApplicationUpdate,
    ) -> ApplicationSummary:
        connection = open_database(settings.database_path)
        try:
            updated = update_application_status(
                connection,
                application_id,
                request.status,
                datetime.now(UTC).isoformat(),
            )
            if not updated:
                raise HTTPException(404, "Application not found")
            return updated
        finally:
            connection.close()

    return app
