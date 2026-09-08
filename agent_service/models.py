from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=False)


ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200_000)]
Identifier = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200, pattern=r"^[a-z0-9][a-z0-9._-]*$"),
]
ToolName = Literal[
    "get_candidate_claims",
    "check_application_history",
    "search_candidate_documents",
    "open_candidate_source",
]
FindingCategory = Literal[
    "work_rights",
    "availability",
    "history",
    "skills",
    "experience",
    "education",
    "other",
]


class JobPosting(StrictModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    source: Literal["seek-nz"]
    external_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = Field(alias="externalId")
    canonical_url: AnyHttpUrl = Field(alias="canonicalUrl")
    application_url: AnyHttpUrl | None = Field(alias="applicationUrl")
    title: ShortText
    company: ShortText | None
    location: ShortText | None
    employment_type: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = Field(alias="employmentType")
    salary_text: ShortText | None = Field(alias="salaryText")
    description: LongText
    posted_at: date | None = Field(alias="postedAt")
    posted_at_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = Field(alias="postedAtText")
    closes_at: date | None = Field(alias="closesAt")
    closes_at_text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = Field(alias="closesAtText")
    extracted_at: datetime = Field(alias="extractedAt")
    extraction_warnings: Annotated[list[ShortText], Field(max_length=50)] = Field(alias="extractionWarnings")

    @field_validator("canonical_url", "application_url")
    @classmethod
    def reject_credentials(cls, value: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if value and (value.username or value.password):
            raise ValueError("URLs must not contain credentials")
        return value

    @field_validator("extracted_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("extractedAt must include a timezone")
        return value

    @field_validator("extraction_warnings")
    @classmethod
    def unique_warnings(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("extractionWarnings must be unique")
        return value


class AnalysisRequest(StrictModel):
    job: JobPosting
    job_mode: Literal["internship", "graduate", "part-time", "full-time", "summer"] = Field(alias="jobMode")


class ClarificationAnswer(StrictModel):
    question: ShortText
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]


class ClarificationRequest(StrictModel):
    answers: Annotated[list[ClarificationAnswer], Field(min_length=1, max_length=20)]


class Finding(StrictModel):
    category: FindingCategory
    summary: ShortText
    source_refs: Annotated[list[Identifier], Field(min_length=1, max_length=50)]


class Recommendation(StrictModel):
    recommendation: Literal["APPLY", "MAYBE", "SKIP"]
    fit: Literal["HIGH", "MEDIUM", "LOW"]
    readiness: Literal["HIGH", "MEDIUM", "LOW"]
    hard_blockers: list[Finding]
    strong_matches: list[Finding]
    partial_matches: list[Finding]
    gaps: list[Finding]
    unknowns: list[Finding]
    clarification_questions: Annotated[list[ShortText], Field(max_length=20)]
    cv_action: Literal["KEEP", "TAILOR", "DO_NOT_GENERATE"]
    cover_letter_action: Literal["GENERATE", "OPTIONAL", "DO_NOT_GENERATE"]
    next_actions: list[str]
    termination_reason: Literal["completed", "hard_blocker", "needs_clarification", "duplicate"]

    @model_validator(mode="after")
    def enforce_safe_terminal_state(self) -> "Recommendation":
        if self.hard_blockers and (
            self.recommendation != "SKIP"
            or self.cv_action != "DO_NOT_GENERATE"
            or self.cover_letter_action != "DO_NOT_GENERATE"
        ):
            raise ValueError("Hard blockers must stop material generation")
        if len(self.clarification_questions) != len(set(self.clarification_questions)):
            raise ValueError("clarification_questions must be unique")
        return self


class ToolEvent(StrictModel):
    sequence: int
    tool_name: ToolName
    arguments: dict[str, object]
    result: dict[str, object]


class Usage(StrictModel):
    model_calls: int = 0
    tool_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: str | None = None


class AnalysisResponse(StrictModel):
    analysis_id: str
    status: Literal["completed"]
    recommendation: Recommendation
    tool_events: list[ToolEvent]
    usage: Usage
    created_at: datetime
    model: str
    prompt_version: Literal["career-analysis-v3"]


ApplicationStatus = Literal["analysed", "preparing", "maybe", "skipped", "applied", "archived"]


class ApplicationUpdate(StrictModel):
    status: ApplicationStatus


class ApplicationSummary(StrictModel):
    job_identity: str
    status: ApplicationStatus
    job_mode: Literal["internship", "graduate", "part-time", "full-time", "summer"]
    latest_analysis_id: str
    updated_at: datetime


MaterialSection = Literal[
    "experience", "project", "skills", "education", "achievement", "certification",
]


class MaterialGenerationPlan(StrictModel):
    professional_summary: ShortText
    selected_source_refs: Annotated[list[Identifier], Field(min_length=1, max_length=50)]
    emphasized_skills: Annotated[list[ShortText], Field(max_length=30)]
    section_order: Annotated[list[MaterialSection], Field(min_length=1, max_length=6)]
    changes: Annotated[list[ShortText], Field(min_length=1, max_length=20)]
    cover_letter: LongText

    @field_validator("selected_source_refs", "emphasized_skills", "section_order")
    @classmethod
    def unique_material_values(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Material plan values must be unique")
        return value


class CVChangePlan(StrictModel):
    analysis_id: str
    selected_source_refs: list[Identifier]
    base_source_id: Identifier | None
    emphasized_skills: list[ShortText]
    changes: list[ShortText]


class CoverLetter(StrictModel):
    text: LongText
    source_refs: list[Identifier]


class MaterialBundle(StrictModel):
    material_id: str
    analysis_id: str
    job_identity: str
    cv_change_plan: CVChangePlan | None
    cv_html: LongText | None
    cover_letter: CoverLetter | None
    generated_at: datetime

    @model_validator(mode="after")
    def contains_requested_material(self) -> "MaterialBundle":
        if not self.cv_html and not self.cover_letter:
            raise ValueError("A material bundle must contain a CV or cover letter")
        if (self.cv_change_plan is None) != (self.cv_html is None):
            raise ValueError("CV HTML and its change plan must be present together")
        return self


class HealthResponse(StrictModel):
    status: Literal["ok"]
    service: Literal["jobfilter-agent"]
    api_version: Literal[1]


CandidateSourceKind = Literal[
    "cv", "visa", "project", "certificate", "education", "portfolio", "other",
]
CandidateSourceSensitivity = Literal["standard", "personal", "highly-sensitive"]
CandidateSourceStatus = Literal["processing", "ready", "needs-attention"]
CandidateSourceClaimCategory = Literal[
    "identity",
    "contact",
    "skill",
    "experience",
    "project",
    "education",
    "work-rights",
    "availability",
    "certification",
    "achievement",
    "preference",
    "other",
]


class CandidateSourceSummary(StrictModel):
    id: Identifier
    file_name: ShortText = Field(alias="fileName")
    media_type: ShortText = Field(alias="mediaType")
    size_bytes: Annotated[int, Field(ge=1, le=2 * 1024 * 1024)] = Field(alias="sizeBytes")
    content_sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")] = Field(
        alias="contentSha256",
    )
    kind: CandidateSourceKind
    purpose_tags: Annotated[list[Identifier], Field(max_length=20)] = Field(alias="purposeTags")
    sensitivity: CandidateSourceSensitivity
    summary: ShortText
    status: CandidateSourceStatus
    imported_at: datetime = Field(alias="importedAt")

    @field_validator("imported_at")
    @classmethod
    def imported_at_has_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("importedAt must include a timezone")
        return value


class CandidateLibrarySnapshot(StrictModel):
    sources: Annotated[list[CandidateSourceSummary], Field(max_length=100)] = Field(
        default_factory=list,
    )
    conflicts: Annotated[list["CandidateClaimConflict"], Field(max_length=100)] = Field(
        default_factory=list,
    )


class CandidateImportRequest(StrictModel):
    file_name: ShortText = Field(alias="fileName")
    content_base64: Annotated[str, StringConstraints(min_length=1, max_length=3_000_000)] = Field(
        alias="contentBase64",
    )


class CandidateSourceClassification(StrictModel):
    kind: CandidateSourceKind
    purpose_tags: Annotated[list[Identifier], Field(max_length=20)] = Field(alias="purposeTags")
    sensitivity: CandidateSourceSensitivity
    summary: ShortText


class CandidateSourceMetadataUpdate(StrictModel):
    kind: CandidateSourceKind
    purpose_tags: Annotated[list[Identifier], Field(max_length=20)] = Field(alias="purposeTags")
    sensitivity: CandidateSourceSensitivity


class CandidateSourceClaimInput(StrictModel):
    category: CandidateSourceClaimCategory
    key: Identifier
    title: ShortText
    statement: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000),
    ]
    attributes: Annotated[dict[Identifier, ShortText], Field(min_length=1, max_length=30)]
    source_text: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000),
    ] = Field(alias="sourceText")
    confidence: Literal["high", "medium", "low"]
    exclusive: bool


class CandidateSourceClaim(CandidateSourceClaimInput):
    id: Identifier
    source_id: Identifier = Field(alias="sourceId")
    file_name: ShortText = Field(alias="fileName")
    source_ref: Identifier = Field(alias="sourceRef")
    start_line: Annotated[int, Field(ge=1)] = Field(alias="startLine")
    end_line: Annotated[int, Field(ge=1)] = Field(alias="endLine")
    extracted_at: datetime = Field(alias="extractedAt")

    @field_validator("extracted_at")
    @classmethod
    def extracted_at_has_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("extractedAt must include a timezone")
        return value


class CandidateClaimConflict(StrictModel):
    id: Identifier
    key: Identifier
    title: ShortText
    claims: Annotated[list[CandidateSourceClaim], Field(min_length=2, max_length=20)]


class CandidateConflictResolutionRequest(StrictModel):
    selected_claim_id: Identifier | None = Field(alias="selectedClaimId")


class CandidateImportExtraction(StrictModel):
    classification: CandidateSourceClassification
    claims: list[CandidateSourceClaimInput]


class CandidateSourceIngestResult(StrictModel):
    source: CandidateSourceSummary
    conflicts: Annotated[list[CandidateClaimConflict], Field(max_length=100)]
    warnings: Annotated[
        list[Literal[
            "pdf-pages-without-text",
            "source-understanding-failed",
            "duplicate-source",
        ]],
        Field(max_length=3),
    ]
