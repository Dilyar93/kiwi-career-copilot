# Technical Deep Dive

This document explains the implemented Agent and Career Library slice of Kiwi Career Copilot. Planned capabilities are deliberately excluded or identified as future work.

## 1. System boundary

The product has three runtime boundaries:

1. A WXT/React Chrome extension reads the current supported SEEK page and presents the Side Panel.
2. A FastAPI service bound to `127.0.0.1` owns the private career library, SQLite database and agent runtime.
3. Alibaba Qwen3.7-Plus performs document understanding and the semantic parts of job analysis.

The local service is not a hosted operator backend. Each user runs it locally and supplies a model API key through the service environment. The extension and service communicate over loopback using a shared token and an expected extension identity.

The implementation is intentionally one main decision agent with four general-purpose tools. Document import and material drafting use separate constrained model calls, but they do not independently plan the user's job decision.

Relevant code:

- [`agent_service/agent.py`](../../agent_service/agent.py): decision agent, tools, provenance and runtime control
- [`agent_service/candidate_import.py`](../../agent_service/candidate_import.py): deterministic parsing and model-assisted source understanding
- [`agent_service/repository.py`](../../agent_service/repository.py): SQLite, FTS5, Claims, conflicts and checkpoints
- [`agent_service/app.py`](../../agent_service/app.py): authenticated API, ingestion ordering and analysis lifecycle
- [`agent_service/models.py`](../../agent_service/models.py): strict contracts for jobs, sources, tools and results

## 2. Source-first ingestion

### 2.1 Persist before interpretation

An upload crosses a deterministic trust boundary before it reaches a model:

- only PDF, DOCX, Markdown and UTF-8 text are accepted;
- base64, extension, content size and extracted-text size are validated;
- encrypted, unreadable or oversized PDFs are rejected;
- DOCX is read directly from its XML package rather than through an office application;
- a SHA-256 digest identifies duplicate content.

The original bytes and extracted text are saved to SQLite before model understanding begins. If classification or Claim extraction fails, the source remains available with a recoverable status instead of disappearing.

This ordering is a small but important design choice: an unreliable AI step is never allowed to become a data-loss boundary.

### 2.2 The model does not fill a universal CV schema

The import model receives the filename and complete extracted text. It classifies the source's kind, likely purpose, sensitivity and summary, then emits source-owned logical records.

A record is shaped as:

```text
key + title + complete statement + dynamic attributes + verbatim sourceText
```

Education, employment and project relationships remain complete records. For example, institution, qualification and dates belong to one education record rather than becoming unrelated `Institution`, `Degree` and `Duration` rows.

The attributes are selected from the source itself. This supports CVs, visas, project notes and certificates without creating a separate hard-coded schema for each document type.

### 2.3 Claims are indexes, not truth

A Claim belongs permanently to one source. It never overwrites another CV and is not promoted into a global profile merely because the model extracted it.

The service accepts a generated Claim only if its verbatim `sourceText` can be relocated in the deterministic extracted text. The service then calculates the line range itself and creates the source reference. A plausible model statement without a supporting passage is therefore not silently indexed.

This does not prove that every paraphrase is semantically perfect. It provides a concrete provenance floor and keeps the original available for deeper verification.

### 2.4 Chunks and conflicts

The extracted text is split into ordered, line-addressable chunks and indexed using SQLite FTS5. At the present data scale, lexical retrieval is cheaper and easier to inspect than introducing a vector service.

Conflict detection is intentionally conservative. A review item requires:

- Claims from more than one source;
- the same model-produced semantic key;
- a fact marked exclusive; and
- at least one shared attribute with incompatible values.

A resolution is stored separately. It does not rewrite either source. Missing fields, different emphasis and additive experience are not treated as conflicts.

## 3. Progressive disclosure to the agent

The analysis prompt contains the current job and a safe source catalogue:

```json
{
  "sourceId": "source.…",
  "fileName": "…",
  "kind": "cv",
  "purposeTags": ["part-time"],
  "sensitivity": "personal",
  "summary": "…",
  "status": "ready"
}
```

It does not contain every career document. The catalogue gives the agent enough awareness to choose an investigation without paying the cost and quality penalty of placing all sources into every prompt.

The agent then has four optional capabilities:

| Tool | Purpose |
|---|---|
| `get_candidate_claims` | Rank source-bound records against requirements supplied by the agent. |
| `search_candidate_documents` | Search FTS5 chunks using the agent's own queries and optional source selection. |
| `open_candidate_source` | Read the complete extracted text of one deliberately selected ready source. |
| `check_application_history` | Check the exact current job identity for prior analysis or application state. |

There is no mandatory tool order. The model can stop after Claims, move to chunks, inspect a particular original, reformulate a query, ask the user or conclude without a tool if the candidate library is irrelevant.

No result is interpreted by code as proof of absence. A miss is an observation that the agent can respond to by narrowing the query, selecting another source, marking the issue unknown or asking a useful question.

## 4. Retrieval details and small design choices

### Requirement-balanced paging

The agent can submit several decision-critical requirements in one call. Candidates are ranked locally for each requirement and then interleaved by rank position. This prevents a broad requirement with many matches from consuming the entire page before a narrower requirement receives any candidate.

Each response includes per-requirement coverage, candidate counts, truncation state and a continuation cursor. Paging limits what enters the current model context; it does not limit how many local records were eligible for ranking.

### Context-aware page size

When the model exposes its context window, the service derives a character budget from remaining context and reserves most of that context for reasoning and the final answer. Qwen3.7-Plus currently receives its documented context size as fallback metadata because the PydanticAI model profile does not provide it.

This replaced the earlier idea of a global “return at most 40 Claims” limit. A fixed top-N limit can hide relevant evidence with no indication that more exists; a cursor makes truncation explicit and lets the agent decide whether another page is valuable.

### Sensitive-source selection

A generic chunk search excludes highly sensitive sources. The source catalogue still tells the agent that a visa or other sensitive document exists. To inspect it, the agent must name the exact source ID in its search or open that source directly.

For highly sensitive imports, the model contract forbids identity, contact, document-number, nationality and similar Claims, and the service independently drops identity/contact categories. Task-relevant rights, restrictions, conditions and validity can be indexed. Full extracted text is still sent to the configured provider during initial source understanding, which must be disclosed honestly to users.

### Provider argument normalisation

During real use, Qwen sometimes encoded a tool array such as `source_ids` as a JSON string rather than a JSON array. Increasing tool retries only repeated the same failure.

The tool contract now uses a Pydantic `BeforeValidator` that decodes a string only when it is valid JSON containing a list. The fix sits at the provider trust boundary, so business code continues to receive one canonical type without weakening validation for arbitrary values.

## 5. Grounded structured output

The agent returns a strict Pydantic `Recommendation` containing:

- `APPLY`, `MAYBE` or `SKIP`;
- fit and readiness;
- hard blockers, strong matches, partial matches, gaps and unknowns;
- optional clarification questions;
- CV and cover-letter actions;
- next actions and a termination reason.

Every candidate finding must carry a source reference obtained through a retrieval tool or a job-local clarification reference. The output validator compares references with those actually retrieved during the run.

Real models sometimes shorten an opened reference from `source.id.original` to its base source ID. The validator normalises that alias only when the exact original was genuinely retrieved. Invented `source.*` or `document.*` references still trigger a model retry.

There is also a deterministic safety invariant: a result containing a hard blocker cannot simultaneously recommend generating application materials. This validates internal consistency without deciding what counts as a blocker.

Clarification answers become `clarification.N` references for that job continuation. They are treated as untrusted user claims and are not silently promoted into a cross-job profile.

## 6. Runtime reliability without replacing agent judgement

### Observation ledger and exact-call reuse

Each successful tool call is recorded using a canonical signature made from the tool name and normalised JSON arguments. Repeating exactly the same ordinary retrieval call returns a small ledger reference rather than the same large payload.

Different queries, sources or cursors remain new observations—even when they find nothing—because the runtime cannot decide whether the agent's semantic reformulation is useful.

### History compaction

PydanticAI normally carries earlier tool payloads into later model requests. As a run grows, this repeatedly charges for content the model has already processed.

When actual context usage enters the pressure range, a `ProcessHistory` capability replaces older full tool returns with compact references. The latest result remains intact, and a deduplicated runtime ledger is injected into the next request. Full sensitive source text is never written into the checkpoint ledger.

### Result-first finalisation

The first implementation used a cumulative token limit. That limit was checked after a provider response had already been generated and charged, so a slightly over-budget run could cost money and still return no result.

The replacement uses soft runtime signals:

- repeated exact calls with no new observation;
- real context-window pressure after compaction; or
- proximity to the framework's final request fuse.

When a signal fires, the same agent temporarily loses retrieval tools and must produce the best safe structured result from its existing ledger. Unknowns remain unknown, and the runtime does not manufacture questions or change the recommendation. The framework's loop fuse remains a final safety boundary, but there is no custom total-token, tool-call or whole-run timeout that discards a paid response.

### Checkpoint and resume

An analysis ID and checkpoint are saved before the first model call and after every tool event. The checkpoint contains safe observations, tool summaries, usage and runtime state—not hidden reasoning or raw sensitive source text.

A failed run is resumable only when all material inputs still match:

- job identity and job-content fingerprint;
- job mode;
- Career Library fingerprint;
- clarification answers; and
- prompt version.

Changing a source invalidates the old candidate fingerprint, preventing stale evidence from being reused. Otherwise, a retry restores completed observations and cumulative usage rather than repeating the entire investigation.

## 7. Prompt-injection and local security boundaries

The system treats job descriptions, uploaded documents and clarification answers as untrusted data rather than instructions. This rule appears in both import and analysis prompts.

The local API:

- binds only to loopback;
- requires a shared token compared using a constant-time function;
- validates the expected Chrome extension origin or extension ID;
- accepts only declared HTTP methods, JSON content types and bounded request bodies;
- disables public API documentation endpoints; and
- validates all request and response structures with strict Pydantic models.

These measures do not make cloud processing private. They prevent unrelated web pages or local clients from casually using the service and keep the API key outside extension storage.

## 8. Why the architecture stays deliberately small

### No vector database yet

Claims cover common structured evidence, FTS5 handles exact technologies and names, and the agent can open a known original when lexical search is insufficient. Current personal-library scale does not justify embeddings, reranking infrastructure or another data store.

The existing `search_candidate_documents` tool is the replacement boundary if real documents demonstrate repeated synonym misses. Hybrid retrieval can be added behind that tool without changing the product model or adding a second agent.

### No multi-agent orchestration

There is one semantic owner for the job decision. Multiple autonomous agents would introduce hand-off state, duplicated context and harder debugging without a demonstrated user benefit. Import classification and material drafting are constrained structured model tasks, not peers negotiating the recommendation.

### No custom provider framework

PydanticAI already provides model adapters, typed dependencies, tools, retries and structured output. The product currently supports Qwen3.7-Plus rather than maintaining a speculative abstraction for providers that have not been validated.

## 9. Real failures that shaped the design

| Failure observed in real use | Architectural response |
|---|---|
| Multiple CVs were flattened into a fixed Profile and produced incomplete or contradictory context. | The Profile/Evidence runtime, tables and compatibility path were deleted; Sources are now the only candidate-data authority. |
| Claims were emitted as isolated institutions, dates and roles. | Import instructions now require complete logical records with dynamic attributes and a supporting verbatim passage. |
| The agent repeatedly retrieved evidence until a hard token limit discarded an already-paid run. | Added an observation ledger, context compaction, result-first finalisation and checkpoint/resume; removed the custom cumulative token cap. |
| Qwen sent a list-shaped tool argument as a JSON string. | Canonicalise that provider variation at the typed tool boundary. |
| The model cited the base ID of an original it had opened, causing a valid result to fail provenance validation. | Normalise only provable source aliases while continuing to reject references that were never retrieved. |
| System-generated unknown questions duplicated the agent's semantic questions. | Removed specialised business checkers and automatic question synthesis; the agent alone decides whether clarification is useful. |

The common lesson was to fix generic trust or runtime boundaries rather than add a branch for one job, one visa or one model response.

## 10. Validation and honest limits

Automated tests use Vitest, Playwright and Pytest. PydanticAI `FunctionModel` cases verify tool-choice freedom, schema contracts, provenance, retrieval, privacy summaries, checkpoint reuse and API behaviour without spending provider credit. Browser fixtures exercise the extension and real local FastAPI/SQLite boundary without scraping live SEEK during the test suite.

Manual validation uses real SEEK listings and private local sources: multiple CV variants, a visa, timetable, project Markdown, clarification continuation, service restart/resume and material preparation. Private documents and raw runs are not suitable for the public repository; the showcase should use sanitised equivalents.

Current limits are part of the design record:

- initial source understanding sends the complete extracted text to the configured cloud provider;
- FTS5 can miss semantic synonyms;
- model-produced keys can miss deep cross-source conflicts;
- image-only PDFs require OCR before upload;
- the local service still needs manual setup;
- only SEEK and one model provider are currently supported; and
- CV variants and the full application workspace remain incomplete.

These are the next places to invest only when the real product workflow requires them.
