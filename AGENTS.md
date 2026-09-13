# Repository instructions

## Scope and sources of truth

- V2 is the current development line. Read V1, `store/`, `site/` and any `archive/` directory only when a task explicitly concerns a released snapshot or historical decision.
- Do not use Git history or commits to infer the original design or current intent. This repository was only put under reliable version control recently; use current documentation, code, tests and configuration.
- Preserve unrelated local changes.

## Start every task

1. Read `docs/README.md` for the document map.
2. Read `docs/v2/README.md` and `docs/v2/current-state.md`.
3. Read only the task-relevant living document: `product.md`, `roadmap.md`, `architecture.md`, `experience.md` or `quality.md`; when working in the active stage, also read the implementation plan linked by the roadmap.
4. Inspect the affected code, tests and configuration before deciding whether documentation or implementation is wrong.

`docs/v2/roadmap.md` identifies the current stage. Only its linked active implementation plan is current; archived plans and the Stage 2 Showcase are not development instructions.

## Engineering boundaries

- Keep one Source-first candidate-data path: Sources → Claims/chunks/originals → Agent observations → analysis/materials.
- The Agent owns job semantics, retrieval planning, clarification and recommendations. Deterministic code owns authentication, schemas, provenance, privacy, persistence, recovery and other enforceable trust boundaries.
- Do not add job-specific `if/else`, mandatory tool sequences or speculative abstractions to satisfy one example.
- Reuse existing code and dependencies before adding helpers or packages.

## Verification

- Documentation only: check links, paths and statements against current code and living docs.
- TypeScript/extension logic: run the smallest relevant subset of `corepack pnpm typecheck`, `corepack pnpm lint` and `corepack pnpm test`.
- Python API/repository/Agent logic: run `.venv/bin/pytest agent_service -q` or the smallest relevant test target.
- Browser lifecycle or release-level changes: run the relevant Playwright test; full build/E2E is reserved for release or broad integration changes.

Follow `docs/ai-development.md` when updating product state, architecture, roadmap, decisions or temporary plans. Keep one fact in one authoritative living document and link to it instead of copying it.
