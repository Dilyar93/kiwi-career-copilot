# Interview Q&A

These answers are written in first person as preparation notes. They should be adapted to the actual conversation rather than memorised word for word.

## 1. What did you build?

I built Kiwi Career Copilot, a local-first Chrome extension and AI agent for job searching in New Zealand. It reads the current SEEK role, lets me maintain a library of multiple CVs and other career documents, and uses an agent to investigate relevant evidence before recommending whether and how to proceed.

The first published version was a simpler SEEK search enhancer. The current version adds a PydanticAI agent, a source-first Career Library, layered retrieval, clarification, provenance and failure recovery.

## 2. Why did you choose this project?

I moved to New Zealand as an international student two months ago and was unfamiliar with SEEK, cover letters and local application expectations. I had not updated my CV for years, and I needed different versions for part-time and professional roles. My visa, timetable and project evidence were also stored separately.

The problem was personal, frequent and easy to validate because I was already doing the work manually. I did not need to invent a demonstration scenario; every application gave me another real test.

## 3. What was the progression from V1 to V2?

V1 added negative filters, hidden/viewed state and commute-aware filtering to SEEK. I shipped it to the Chrome Web Store, where it received 39 downloads in one month.

Using it showed that filtering was only the first problem. The harder work started after opening a job: understanding requirements, finding evidence across several documents, asking the right questions and preparing application-specific materials. V2 grew from that real workflow rather than from a plan to add AI for its own sake.

## 4. Why is this an agent rather than a workflow?

A fixed workflow would always run the same checks in the same order. Kiwi gives the model a job, a safe catalogue of available sources and optional tools. The model decides what is decision-critical, which source to investigate, how to reformulate a search, whether to inspect an original, whether clarification could change the result and when to stop.

Different jobs therefore produce different tool paths. The runtime manages resources and trust boundaries, but it does not encode rules such as “if the job says part-time, always ask about work rights”.

## 5. What decisions belong to the model, and what remains deterministic?

The model owns semantic decisions: interpreting the role, planning the investigation, selecting evidence, judging relevance, deciding whether to ask a question and producing the recommendation.

Code owns authentication, file validation, local persistence, search execution, sensitive-source defaults, source-reference validation, structured contracts, duplicate-call reuse and checkpoint recovery. I use deterministic code where an invariant can be checked, but not where the system would need career judgement.

## 6. Why did you use one main agent instead of multiple agents?

There is one decision that needs a clear owner: what this job means for this candidate. Several autonomous agents would repeat context, require hand-off state and make failures harder to understand.

Document classification and material drafting use constrained model calls, but they do not act as independent decision-makers. I would add another agent only if a genuinely separate autonomous responsibility appeared and could be evaluated independently.

## 7. Why PydanticAI?

It provides typed dependencies, tool calling, structured output, retries and model adapters without requiring me to build another agent framework. Its Pydantic integration makes tool and result contracts explicit, while capabilities such as history processing and dynamic tool preparation let me implement context compaction and result-first finalisation within the same agent run.

It is enough infrastructure for the current product without committing to a larger graph or orchestration system.

## 8. Why Qwen3.7-Plus?

I wanted a model that balanced tool use and structured reasoning with a cost I could afford during frequent real testing. Qwen3.7-Plus performed well enough on document understanding and the multi-step retrieval loop to become the first supported provider.

I use PydanticAI's model adapter rather than maintaining my own multi-provider framework. Other providers can be evaluated later, but supporting an option in theory is not the same as validating it as a product.

## 9. Why is model thinking disabled?

The current workload is an iterative, structured tool loop. I disabled extended thinking so the model makes explicit tool calls, receives observations and re-plans without adding that cost and latency to every turn. This is a runtime choice for the current model and task, not a claim that thinking modes are always worse.

I would re-enable it for a specific decision only if real comparisons showed a meaningful quality improvement that justified the cost and latency.

## 10. How does document ingestion work?

The service first validates and parses PDF, DOCX, Markdown or text using deterministic code. It saves the original bytes and extracted text locally before calling the model, so an AI failure cannot lose the upload.

The import model classifies the source and extracts complete source-bound records with dynamic attributes and a short verbatim supporting passage. The service stores a Claim only if that passage can be found again in the extracted text, then calculates its line reference itself. The remaining text is split into ordered FTS5 chunks, and the original stays available for deliberate deeper inspection.

## 11. Why not convert every document into one global profile?

Different CVs are intentionally different views of the same person. A part-time CV may omit professional experience, while a technical CV may omit unrelated service work. Absence from one file is not proof that an experience does not exist.

Kiwi therefore keeps every Claim attached to its source. Cross-source resolutions can identify a preferred or contextual value without erasing either document. This also makes every conclusion easier to audit.

## 12. How do Claims differ from chunks and originals?

Claims are compact, source-linked logical records designed for common retrieval. Chunks preserve broader local wording and can recover details that were not selected during extraction. Opening an original gives the agent the complete extracted text of one deliberately selected source.

The agent chooses the depth. This avoids sending every file on every analysis while preserving a path back to information that extraction may have missed or simplified.

## 13. How do you reduce hallucination?

I do not rely on prompting alone. Imported Claims need a verbatim passage that the server can relocate. Candidate findings in the final recommendation need source references that were actually returned by a retrieval tool or supplied as a current-job clarification. Unknown evidence stays unknown rather than becoming proof of absence.

The user still makes the final decision, especially for sensitive claims and application materials. Provenance reduces risk; it does not make model output infallible.

## 14. What happens when two CVs disagree?

The sources remain separate. A conflict is considered only for Claims that share a semantic key, are marked exclusive and contain incompatible values in shared attributes. Different emphasis, missing fields and additive experience are not conflicts.

If the user resolves a real conflict, the resolution is a separate record. Neither original Claim is rewritten, so the system retains its history and context.

## 15. What happens when the system cannot find evidence?

A retrieval miss is not treated as evidence that I lack a skill or experience. The agent can reformulate the query, search another source, inspect an original, record an unknown or ask me a question.

It should ask only when the answer can materially change the recommendation, application material or immediate next step. Earlier versions automatically generated questions for unknown fields, which created duplicated and irrelevant questions, so that semantic decision now belongs only to the agent.

## 16. How are sensitive sources such as visas handled?

The original remains local in SQLite. The import contract tells the model not to emit identity, contact, document-number, nationality or similar Claims for highly sensitive sources, and the service also drops identity/contact categories. Task-relevant conditions such as work rights, restrictions and validity can still be indexed.

Generic chunk search excludes highly sensitive documents. The agent can see that the source exists and must deliberately name its source ID to search or open it. Tool traces and checkpoints store safe summaries rather than raw sensitive text.

The current import step still sends the complete extracted document to the configured cloud provider for classification and Claim extraction. I treat that as an important disclosure requirement and do not describe the system as fully offline.

## 17. How do you handle prompt injection in job descriptions or uploaded documents?

Both the import and analysis instructions explicitly treat document and job contents as untrusted data, never as commands. Clarification answers are also untrusted and job-scoped.

The model boundary is reinforced by strict tool schemas, limited local tools, source-reference validation and an API that does not expose arbitrary file or command execution. The project does not execute uploaded code.

## 18. Why did you not start with embeddings or a vector database?

My current library is small. Source-bound Claims cover common facts, SQLite FTS5 handles exact technologies and names, and the catalogue lets the agent open a known source when lexical search is insufficient. Adding embeddings would introduce another index, model, migration and privacy decision before I had evidence that it solved a real failure.

If repeated real tests show semantic misses, I can add hybrid retrieval behind the existing document-search tool without changing the agent's product contract.

## 19. How do you prevent one topic from consuming the retrieval context?

The agent submits a list of requirements. The service ranks candidates independently for each requirement and interleaves them by rank, so one common term cannot fill the entire page before a narrow requirement receives a result.

The response reports coverage, candidate counts, truncation and a cursor. The page size adapts to remaining model context; it is not a hidden global limit on the local search space.

## 20. How do you handle repeated tool calls and long runs?

The runtime stores an observation ledger keyed by a canonical tool name and argument signature. An exact repeated ordinary query returns a small cached reference. Different queries or cursors remain available because the runtime should not judge their semantic value.

Under real context pressure, older full tool results are compacted while the latest result and ledger remain available. If the agent is making no progress or nearing the final framework fuse, the same agent enters a no-tools finalisation turn and returns the safest result it can from completed observations.

## 21. Why not just set a token or tool-call limit?

The first version did. A cumulative token limit could trigger only after the model provider had produced and charged for the response, which meant I paid for work and then discarded it.

The current design removes the custom total-token, tool-count and whole-run deadline. It uses exact-call reuse, context-window pressure, compaction, result-first finalisation and the framework's final loop protection instead. Trust-boundary limits such as file size and per-tool timeout remain because they prevent unsafe input or a single stuck local operation rather than making a semantic decision.

## 22. How does resume work?

The service creates an analysis checkpoint before the first model call and updates it after each tool event. On failure, it retains safe observations, usage and runtime state.

A retry resumes only if the job content, job mode, career-library fingerprint, clarification answers and prompt version still match. If a document changes, its fingerprint invalidates the old evidence. This prevents both unnecessary model spending and stale-context reuse.

## 23. How did you validate the project?

I use two kinds of validation. Automated Vitest, Playwright and Pytest tests cover browser extraction, API contracts, typed outputs, retrieval, provenance, privacy summaries and recovery. PydanticAI `FunctionModel` tests exercise agent-tool behaviour without spending cloud-model credit.

I then use real SEEK listings and my own private documents to test product behaviour: multiple CV purposes, visa conditions, a timetable, project Markdown, clarification, continuation, service restart and material preparation. I keep synthetic regression checks separate from product-quality claims because a passing schema test does not prove a good career decision.

## 24. What were the most useful failures?

One failure was architectural: a fixed Profile flattened multiple CVs and created a second source of truth. I removed that entire compatibility path rather than adding more exceptions.

Runtime failures were equally useful. Qwen encoded an array as a JSON string, a valid opened source was cited using a shortened alias, and a hard token cap discarded a paid analysis. Each fix was made at a generic boundary—input normalisation, provenance normalisation or runtime recovery—rather than as a branch for one observed job.

## 25. How did you use AI while building it?

I used coding agents extensively to accelerate implementation, investigation and documentation. My role was to define the real problem, test the product in my own workflow, challenge designs that became workflow-like or overly simplistic, choose the product and trust boundaries, and verify changes against real failures.

I do not present this as hand-written code produced without AI. An important part of the project is learning how to direct, inspect and correct AI-assisted engineering while retaining a coherent product and architecture.

## 26. What would change if this had many users?

The current local-service installation is appropriate for a personal tool and technical showcase, not mass onboarding. I would first package the local service and configuration into a reliable installer. Only if a hosted service became necessary would I add accounts, encrypted server-side storage, tenant isolation, retention controls, provider billing and operational monitoring.

Retrieval would move toward hybrid lexical and semantic search only after measuring misses at larger document scale. I would not begin by replacing the system with distributed queues or multiple agents.

## 27. How would you support another job site?

The browser-specific extraction ends at a structured `JobPosting` boundary. A new supported listing site would need its own tested adapter, while the Agent, Career Library, storage and material logic would continue to consume the same domain object.

For company career pages, I would start with a user-triggered current-page reader and a confirmation preview rather than attempting to recognise and inject controls into every careers website.

## 28. What are the current limitations and next priorities?

Current limits include manual local-service setup, one provider, lexical retrieval, no OCR for scanned PDFs, incomplete multi-CV variant editing, an early materials workspace and SEEK-only browser support.

The next product priority is a persistent Jobs/Application workspace, followed by FlowCV-style CV variants and a proper material editor. For a public GitHub release, I would first add sanitised demo data, a short recording, a licence, an example environment file and accurate privacy documentation.
