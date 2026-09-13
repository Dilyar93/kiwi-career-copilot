import hashlib
import json
import re
import sqlite3
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from .models import (
    AnalysisResponse,
    ApplicationStatus,
    ApplicationSummary,
    CandidateClaimConflict,
    CandidateSourceClaim,
    CandidateSourceClaimInput,
    CandidateSourceClassification,
    CandidateSourceMetadataUpdate,
    CandidateSourceSummary,
    ClarificationAnswer,
    JobPosting,
    MaterialBundle,
)


SOURCE_SCHEMA = """
CREATE TABLE candidate_sources (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  original_content BLOB NOT NULL,
  extracted_text TEXT NOT NULL,
  kind TEXT NOT NULL,
  purpose_tags_json TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE TABLE source_chunks (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES candidate_sources(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  UNIQUE(source_id, ordinal)
);
CREATE VIRTUAL TABLE source_chunks_fts USING fts5(
  content,
  chunk_id UNINDEXED,
  source_id UNINDEXED
);
"""

CLAIM_SCHEMA = """
CREATE TABLE source_claims (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES candidate_sources(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  attributes_json TEXT NOT NULL,
  source_text TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  confidence TEXT NOT NULL,
  exclusive INTEGER NOT NULL,
  extracted_at TEXT NOT NULL
);
CREATE INDEX source_claims_source_id ON source_claims(source_id);
CREATE INDEX source_claims_key ON source_claims(claim_key);
CREATE TABLE claim_resolutions (
  conflict_id TEXT PRIMARY KEY,
  claim_key TEXT NOT NULL,
  claim_ids_json TEXT NOT NULL,
  selected_claim_id TEXT,
  resolved_at TEXT NOT NULL
);
"""


def _purge_disallowed_sensitive_claims(
    connection: sqlite3.Connection,
    source_id: str | None = None,
) -> None:
    parameters: tuple[str, ...] = (source_id,) if source_id else ()
    source_filter = "AND claims.source_id = ?" if source_id else ""
    claim_ids = tuple(
        row["id"]
        for row in connection.execute(
            f"""SELECT claims.id FROM source_claims AS claims
            JOIN candidate_sources AS sources ON sources.id = claims.source_id
            WHERE sources.sensitivity = 'highly-sensitive'
              AND claims.category IN ('identity', 'contact')
              {source_filter}""",
            parameters,
        ).fetchall()
    )
    if not claim_ids:
        return
    stale_resolutions = [
        row["conflict_id"]
        for row in connection.execute(
            "SELECT conflict_id, claim_ids_json FROM claim_resolutions",
        ).fetchall()
        if set(claim_ids).intersection(json.loads(row["claim_ids_json"]))
    ]
    connection.executemany(
        "DELETE FROM claim_resolutions WHERE conflict_id = ?",
        [(conflict_id,) for conflict_id in stale_resolutions],
    )
    connection.execute(
        f"DELETE FROM source_claims WHERE id IN ({','.join('?' for _ in claim_ids)})",
        claim_ids,
    )


def _source_chunks(text: str, max_chars: int = 1_200) -> list[tuple[int, int, str]]:
    chunks: list[tuple[int, int, str]] = []
    lines = text.splitlines()
    start = 1
    current: list[str] = []
    for line_number, line in enumerate(lines, 1):
        if current and sum(map(len, current)) + len(current) + len(line) > max_chars:
            chunks.append((start, line_number - 1, "\n".join(current)))
            current = []
            start = line_number
        current.append(line)
    if current:
        chunks.append((start, len(lines), "\n".join(current)))
    return chunks


def _store_source_chunks(connection: sqlite3.Connection, source_id: str, text: str) -> None:
    for ordinal, (start_line, end_line, content) in enumerate(_source_chunks(text), 1):
        cursor = connection.execute(
            """INSERT INTO source_chunks(source_id, ordinal, start_line, end_line, content)
            VALUES (?, ?, ?, ?, ?)""",
            (source_id, ordinal, start_line, end_line, content),
        )
        connection.execute(
            """INSERT INTO source_chunks_fts(rowid, content, chunk_id, source_id)
            VALUES (?, ?, ?, ?)""",
            (cursor.lastrowid, content, str(cursor.lastrowid), source_id),
        )


def open_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if version > 8:
        connection.close()
        raise RuntimeError(f"Database version {version} is newer than this service supports")
    if version == 0:
        connection.executescript(
            """
            CREATE TABLE jobs (
              id TEXT PRIMARY KEY,
              document_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE applications (
              id TEXT PRIMARY KEY,
              document_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE agent_runs (
              id TEXT PRIMARY KEY,
              document_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """ + SOURCE_SCHEMA + CLAIM_SCHEMA + """
            PRAGMA user_version = 8;
            """,
        )
    elif version == 1:
        connection.executescript(
            SOURCE_SCHEMA + CLAIM_SCHEMA + "PRAGMA user_version = 5;",
        )
    elif version == 2:
        connection.executescript(SOURCE_SCHEMA)
        rows = connection.execute("SELECT * FROM candidate_documents").fetchall()
        with connection:
            for row in rows:
                digest = hashlib.sha256(row["original_content"]).hexdigest()
                connection.execute(
                    """INSERT INTO candidate_sources(
                    id, file_name, media_type, content_sha256, original_content,
                    extracted_text, kind, purpose_tags_json, sensitivity, summary,
                    status, imported_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'cv', '[]', 'personal', ?, 'ready', ?)""",
                    (
                        row["id"], row["file_name"], "application/octet-stream", digest,
                        row["original_content"], row["extracted_text"],
                        f"Imported CV: {row['file_name']}", row["imported_at"],
                    ),
                )
                if connection.execute(
                    "SELECT 1 FROM source_chunks WHERE source_id = ?", (row["id"],),
                ).fetchone() is None:
                    _store_source_chunks(connection, row["id"], row["extracted_text"])
            connection.execute("DROP TABLE candidate_documents")
            connection.executescript(CLAIM_SCHEMA)
            connection.execute("PRAGMA user_version = 5")
    elif version == 3:
        connection.executescript(CLAIM_SCHEMA + "PRAGMA user_version = 5;")
    elif version == 4:
        connection.executescript(
            """
            DELETE FROM claim_resolutions;
            DELETE FROM source_claims;
            ALTER TABLE source_claims ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '{}';
            UPDATE candidate_sources SET status = 'needs-attention';
            PRAGMA user_version = 5;
            """,
        )
    if 1 <= version <= 5:
        connection.executescript(
            """
            DELETE FROM applications;
            DELETE FROM agent_runs;
            DELETE FROM jobs;
            DROP TABLE IF EXISTS evidence;
            DROP TABLE IF EXISTS candidate_profile;
            PRAGMA user_version = 6;
            """,
        )
    if 1 <= version <= 7:
        with connection:
            _purge_disallowed_sensitive_claims(connection)
            connection.execute("PRAGMA user_version = 8")
    return connection


def _source_summary(row: sqlite3.Row) -> CandidateSourceSummary:
    return CandidateSourceSummary.model_validate({
        "id": row["id"],
        "fileName": row["file_name"],
        "mediaType": row["media_type"],
        "sizeBytes": row["size_bytes"],
        "contentSha256": row["content_sha256"],
        "kind": row["kind"],
        "purposeTags": json.loads(row["purpose_tags_json"]),
        "sensitivity": row["sensitivity"],
        "summary": row["summary"],
        "status": row["status"],
        "importedAt": row["imported_at"],
    })


def load_candidate_sources(connection: sqlite3.Connection) -> list[CandidateSourceSummary]:
    rows = connection.execute(
        """SELECT id, file_name, media_type, length(original_content) AS size_bytes,
        content_sha256, kind, purpose_tags_json, sensitivity, summary, status, imported_at
        FROM candidate_sources ORDER BY imported_at DESC""",
    ).fetchall()
    return [_source_summary(row) for row in rows]


def load_candidate_source_content(
    connection: sqlite3.Connection,
    source_id: str,
) -> tuple[str, str, bytes, str] | None:
    row = connection.execute(
        """SELECT file_name, media_type, original_content, extracted_text
        FROM candidate_sources WHERE id = ?""",
        (source_id,),
    ).fetchone()
    return (
        row["file_name"], row["media_type"], row["original_content"], row["extracted_text"],
    ) if row else None


def create_candidate_source(
    connection: sqlite3.Connection,
    filename: str,
    media_type: str,
    content: bytes,
    extracted_text: str,
) -> tuple[CandidateSourceSummary, bool]:
    digest = hashlib.sha256(content).hexdigest()
    existing = connection.execute(
        """SELECT id, file_name, media_type, length(original_content) AS size_bytes,
        content_sha256, kind, purpose_tags_json, sensitivity, summary, status, imported_at
        FROM candidate_sources WHERE content_sha256 = ?""",
        (digest,),
    ).fetchone()
    if existing:
        return _source_summary(existing), False

    source_id = f"source.{uuid4()}"
    imported_at = datetime.now(UTC).isoformat()
    with connection:
        connection.execute(
            """INSERT INTO candidate_sources(
            id, file_name, media_type, content_sha256, original_content, extracted_text,
            kind, purpose_tags_json, sensitivity, summary, status, imported_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'other', '[]', 'personal', ?, 'processing', ?)""",
            (
                source_id, filename, media_type, digest, content, extracted_text,
                filename, imported_at,
            ),
        )
        _store_source_chunks(connection, source_id, extracted_text)
    return next(source for source in load_candidate_sources(connection) if source.id == source_id), True


def update_candidate_source(
    connection: sqlite3.Connection,
    source_id: str,
    classification: CandidateSourceClassification | None,
) -> CandidateSourceSummary:
    with connection:
        if classification:
            connection.execute(
                """UPDATE candidate_sources SET kind = ?, purpose_tags_json = ?,
                sensitivity = ?, summary = ?, status = 'ready' WHERE id = ?""",
                (
                    classification.kind,
                    json.dumps(classification.purpose_tags),
                    classification.sensitivity,
                    classification.summary,
                    source_id,
                ),
            )
            _purge_disallowed_sensitive_claims(connection, source_id)
        else:
            connection.execute(
                "UPDATE candidate_sources SET status = 'needs-attention' WHERE id = ?",
                (source_id,),
            )
    return next(source for source in load_candidate_sources(connection) if source.id == source_id)


def update_candidate_source_metadata(
    connection: sqlite3.Connection,
    source_id: str,
    update: CandidateSourceMetadataUpdate,
) -> CandidateSourceSummary | None:
    with connection:
        changed = connection.execute(
            """UPDATE candidate_sources SET kind = ?, purpose_tags_json = ?, sensitivity = ?
            WHERE id = ?""",
            (update.kind, json.dumps(update.purpose_tags), update.sensitivity, source_id),
        ).rowcount
        _purge_disallowed_sensitive_claims(connection, source_id)
    if not changed:
        return None
    return next(source for source in load_candidate_sources(connection) if source.id == source_id)


def delete_candidate_source(connection: sqlite3.Connection, source_id: str) -> bool:
    claim_ids = {
        row["id"]
        for row in connection.execute(
            "SELECT id FROM source_claims WHERE source_id = ?", (source_id,),
        ).fetchall()
    }
    stale_resolutions = [
        row["conflict_id"]
        for row in connection.execute(
            "SELECT conflict_id, claim_ids_json FROM claim_resolutions",
        ).fetchall()
        if claim_ids.intersection(json.loads(row["claim_ids_json"]))
    ]
    with connection:
        connection.executemany(
            "DELETE FROM claim_resolutions WHERE conflict_id = ?",
            [(conflict_id,) for conflict_id in stale_resolutions],
        )
        connection.execute(
            """DELETE FROM source_chunks_fts WHERE rowid IN (
            SELECT id FROM source_chunks WHERE source_id = ?
            )""",
            (source_id,),
        )
        deleted = connection.execute(
            "DELETE FROM candidate_sources WHERE id = ?", (source_id,),
        ).rowcount
    return bool(deleted)


def save_candidate_source_claims(
    connection: sqlite3.Connection,
    source_id: str,
    document_text: str,
    claims: Sequence[CandidateSourceClaimInput],
) -> list[CandidateSourceClaim]:
    extracted_at = datetime.now(UTC).isoformat()
    source = connection.execute(
        "SELECT sensitivity FROM candidate_sources WHERE id = ?", (source_id,),
    ).fetchone()
    if source is None:
        return []
    saved: list[tuple[CandidateSourceClaimInput, re.Match[str]]] = []
    for claim in claims:
        if source["sensitivity"] == "highly-sensitive" and claim.category in {
            "identity", "contact",
        }:
            continue
        parts = claim.source_text.split()
        match = re.search(
            r"\s+".join(re.escape(part) for part in parts),
            document_text,
            flags=re.IGNORECASE,
        )
        if match:
            saved.append((claim, match))

    with connection:
        connection.execute("DELETE FROM source_claims WHERE source_id = ?", (source_id,))
        for claim, match in saved:
            start_line = document_text.count("\n", 0, match.start()) + 1
            end_line = document_text.count("\n", 0, match.end()) + 1
            connection.execute(
                """INSERT INTO source_claims(
                id, source_id, category, claim_key, label, value, source_text,
                attributes_json, start_line, end_line, confidence, exclusive, extracted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    f"claim.{uuid4()}", source_id, claim.category, claim.key,
                    claim.title, claim.statement, match.group(),
                    json.dumps(claim.attributes), start_line, end_line,
                    claim.confidence, claim.exclusive, extracted_at,
                ),
            )
    return load_candidate_claims(connection, source_id)


def _claim_from_row(row: sqlite3.Row) -> CandidateSourceClaim:
    return CandidateSourceClaim.model_validate({
        "id": row["id"],
        "sourceId": row["source_id"],
        "fileName": row["file_name"],
        "category": row["category"],
        "key": row["claim_key"],
        "title": row["label"],
        "statement": row["value"],
        "attributes": json.loads(row["attributes_json"]),
        "sourceText": row["source_text"],
        "sourceRef": f"{row['source_id']}.lines-{row['start_line']}-{row['end_line']}",
        "startLine": row["start_line"],
        "endLine": row["end_line"],
        "confidence": row["confidence"],
        "exclusive": bool(row["exclusive"]),
        "extractedAt": row["extracted_at"],
    })


def load_candidate_claims(
    connection: sqlite3.Connection,
    source_id: str | None = None,
    *,
    ready_only: bool = False,
) -> list[CandidateSourceClaim]:
    conditions = [
        """NOT (
        sources.sensitivity = 'highly-sensitive'
        AND claims.category IN ('identity', 'contact')
        )""",
    ]
    parameters: list[str] = []
    if source_id:
        conditions.append("claims.source_id = ?")
        parameters.append(source_id)
    if ready_only:
        conditions.append("sources.status = 'ready'")
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    rows = connection.execute(
        f"""SELECT claims.*, sources.file_name FROM source_claims AS claims
        JOIN candidate_sources AS sources ON sources.id = claims.source_id
        {where} ORDER BY claims.extracted_at, claims.id""",
        parameters,
    ).fetchall()
    return [_claim_from_row(row) for row in rows]


def load_candidate_conflicts(connection: sqlite3.Connection) -> list[CandidateClaimConflict]:
    groups: dict[str, list[CandidateSourceClaim]] = {}
    for claim in load_candidate_claims(connection, ready_only=True):
        if claim.exclusive:
            groups.setdefault(claim.key, []).append(claim)
    resolved = {
        row["conflict_id"]
        for row in connection.execute("SELECT conflict_id FROM claim_resolutions").fetchall()
    }
    conflicts = []
    for key, claims in groups.items():
        if len({claim.source_id for claim in claims}) < 2:
            continue
        if not any(
            any(
                " ".join(left.attributes[name].casefold().split())
                != " ".join(right.attributes[name].casefold().split())
                for name in left.attributes.keys() & right.attributes.keys()
            )
            for index, left in enumerate(claims)
            for right in claims[index + 1:]
        ):
            continue
        claim_ids = sorted(claim.id for claim in claims)
        digest = hashlib.sha256("\0".join([key, *claim_ids]).encode()).hexdigest()[:24]
        conflict_id = f"conflict.{digest}"
        if conflict_id not in resolved:
            conflicts.append(CandidateClaimConflict(
                id=conflict_id,
                key=key,
                title=claims[0].title,
                claims=claims,
            ))
    return conflicts


def load_candidate_claim_resolutions(
    connection: sqlite3.Connection,
) -> dict[str, str | None]:
    claims_by_key: dict[str, list[str]] = {}
    for claim in load_candidate_claims(connection, ready_only=True):
        if claim.exclusive:
            claims_by_key.setdefault(claim.key, []).append(claim.id)
    resolutions: dict[str, str | None] = {}
    for row in connection.execute(
        "SELECT claim_key, claim_ids_json, selected_claim_id FROM claim_resolutions",
    ).fetchall():
        if sorted(json.loads(row["claim_ids_json"])) == sorted(
            claims_by_key.get(row["claim_key"], []),
        ):
            resolutions[row["claim_key"]] = row["selected_claim_id"]
    return resolutions


def resolve_candidate_conflict(
    connection: sqlite3.Connection,
    conflict_id: str,
    selected_claim_id: str | None,
) -> bool:
    conflict = next(
        (item for item in load_candidate_conflicts(connection) if item.id == conflict_id),
        None,
    )
    if not conflict or (
        selected_claim_id is not None
        and selected_claim_id not in {claim.id for claim in conflict.claims}
    ):
        return False
    with connection:
        connection.execute(
            """INSERT INTO claim_resolutions(
            conflict_id, claim_key, claim_ids_json, selected_claim_id, resolved_at
            ) VALUES (?, ?, ?, ?, ?)""",
            (
                conflict.id,
                conflict.key,
                json.dumps(sorted(claim.id for claim in conflict.claims)),
                selected_claim_id,
                datetime.now(UTC).isoformat(),
            ),
        )
    return True


def search_candidate_sources(
    connection: sqlite3.Connection,
    query: str,
    limit: int | None = None,
    source_ids: Sequence[str] = (),
) -> list[dict[str, object]]:
    tokens = search_tokens(query)
    if not tokens:
        return []
    match = " OR ".join(f'"{token}"' for token in tokens)
    conditions = ["source_chunks_fts MATCH ?", "sources.status = 'ready'"]
    parameters: list[object] = [match]
    if source_ids:
        conditions.append(f"sources.id IN ({','.join('?' for _ in source_ids)})")
        parameters.extend(source_ids)
    else:
        conditions.append("sources.sensitivity != 'highly-sensitive'")
    limit_clause = " LIMIT ?" if limit is not None else ""
    if limit is not None:
        parameters.append(limit)
    rows = connection.execute(
        """SELECT sources.id, sources.file_name, sources.kind, sources.sensitivity, chunks.ordinal,
        chunks.content, bm25(source_chunks_fts) AS rank
        FROM source_chunks_fts
        JOIN source_chunks AS chunks ON chunks.id = source_chunks_fts.rowid
        JOIN candidate_sources AS sources ON sources.id = chunks.source_id
        WHERE """ + " AND ".join(conditions) + """
        ORDER BY rank""" + limit_clause,
        parameters,
    ).fetchall()
    return [
        {
            "sourceRef": f"{row['id']}.chunk-{row['ordinal']}",
            "fileName": row["file_name"],
            "kind": row["kind"],
            "sensitivity": row["sensitivity"],
            "excerpt": row["content"][:1_200],
        }
        for row in rows
    ]


SEARCH_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
    "it", "of", "on", "or", "per", "the", "to", "with",
}


def search_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9+#.]*", value.casefold().replace("-", " "))
        if len(token) >= 2 and token not in SEARCH_STOP_WORDS
    }


def clear_candidate_workspace(connection: sqlite3.Connection) -> None:
    with connection:
        connection.execute("DELETE FROM applications")
        connection.execute("DELETE FROM agent_runs")
        connection.execute("DELETE FROM claim_resolutions")
        connection.execute("DELETE FROM source_chunks_fts")
        connection.execute("DELETE FROM candidate_sources")


def job_identity(job: JobPosting) -> str:
    if job.external_id:
        return f"{job.source}:{job.external_id}"
    digest = hashlib.sha256(str(job.canonical_url).encode()).hexdigest()
    return f"{job.source}:url:{digest}"


def load_application_summary(
    connection: sqlite3.Connection,
    identity: str,
) -> dict[str, object] | None:
    row = connection.execute(
        "SELECT document_json FROM applications WHERE id = ?",
        (identity,),
    ).fetchone()
    return json.loads(row["document_json"]) if row else None


def load_analysis(
    connection: sqlite3.Connection,
    analysis_id: str,
) -> AnalysisResponse | None:
    row = connection.execute(
        "SELECT document_json FROM agent_runs WHERE id = ?",
        (analysis_id,),
    ).fetchone()
    if not row:
        return None
    response = json.loads(row["document_json"]).get("response")
    return AnalysisResponse.model_validate(response) if response else None


def load_analysis_candidate_fingerprint(
    connection: sqlite3.Connection,
    analysis_id: str,
) -> str | None:
    row = connection.execute(
        "SELECT document_json FROM agent_runs WHERE id = ?",
        (analysis_id,),
    ).fetchone()
    if not row:
        return None
    value = json.loads(row["document_json"]).get("inputSummary", {}).get(
        "candidateFingerprint",
    )
    return value if isinstance(value, str) else None


def save_analysis_checkpoint(
    connection: sqlite3.Connection,
    job: JobPosting,
    run: dict[str, object],
) -> None:
    identity = job_identity(job)
    updated_at = str(run["updatedAt"])
    run_id = str(run["runId"])
    with connection:
        connection.execute(
            """INSERT INTO jobs(id, document_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json,
            updated_at=excluded.updated_at""",
            (identity, job.model_dump_json(by_alias=True), updated_at),
        )
        connection.execute(
            """INSERT INTO agent_runs(id, document_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json,
            updated_at=excluded.updated_at""",
            (run_id, json.dumps(run), updated_at),
        )


def load_resumable_analysis(
    connection: sqlite3.Connection,
    identity: str,
    job_mode: str,
    job_fingerprint: str,
    candidate_fingerprint: str,
    prompt_version: str,
    clarification_answers: Sequence[ClarificationAnswer] = (),
) -> dict[str, object] | None:
    expected_answers = [answer.model_dump(mode="json") for answer in clarification_answers]
    rows = connection.execute(
        "SELECT document_json FROM agent_runs ORDER BY updated_at DESC",
    ).fetchall()
    for row in rows:
        run = json.loads(row["document_json"])
        summary = run.get("inputSummary", {})
        if (
            run.get("status") in {"processing", "failed", "interrupted"}
            and summary.get("jobIdentity") == identity
            and summary.get("jobMode") == job_mode
            and summary.get("jobFingerprint") == job_fingerprint
            and summary.get("candidateFingerprint") == candidate_fingerprint
            and summary.get("clarificationAnswers", []) == expected_answers
            and run.get("promptVersion") == prompt_version
        ):
            return run
    return None


def candidate_context_fingerprint(connection: sqlite3.Connection) -> str:
    state: list[object] = []
    for query in (
        """SELECT id, content_sha256, kind, purpose_tags_json, sensitivity, summary, status
        FROM candidate_sources ORDER BY id""",
        """SELECT id, source_id, category, claim_key, label, value, attributes_json,
        start_line, end_line, confidence, exclusive, extracted_at
        FROM source_claims ORDER BY id""",
        """SELECT conflict_id, claim_key, claim_ids_json, selected_claim_id, resolved_at
        FROM claim_resolutions ORDER BY conflict_id""",
    ):
        state.extend(tuple(row) for row in connection.execute(query).fetchall())
    return hashlib.sha256(
        json.dumps(state, sort_keys=True, default=str, separators=(",", ":")).encode(),
    ).hexdigest()


def load_clarification_answers(
    connection: sqlite3.Connection,
    analysis_id: str,
) -> list[ClarificationAnswer]:
    row = connection.execute(
        "SELECT document_json FROM agent_runs WHERE id = ?",
        (analysis_id,),
    ).fetchone()
    if not row:
        return []
    raw = json.loads(row["document_json"]).get("inputSummary", {}).get(
        "clarificationAnswers", [],
    )
    return [ClarificationAnswer.model_validate(answer) for answer in raw]


def load_job(connection: sqlite3.Connection, identity: str) -> JobPosting | None:
    row = connection.execute(
        "SELECT document_json FROM jobs WHERE id = ?",
        (identity,),
    ).fetchone()
    return JobPosting.model_validate_json(row["document_json"]) if row else None


def find_application_by_analysis(
    connection: sqlite3.Connection,
    analysis_id: str,
) -> dict[str, object] | None:
    rows = connection.execute("SELECT document_json FROM applications").fetchall()
    # ponytail: a linear scan is enough for a personal database; add a join table if volume proves otherwise.
    for row in rows:
        document = json.loads(row["document_json"])
        if analysis_id in document.get("analysisIds", []):
            return document
    return None


def application_summary(document: dict[str, object]) -> ApplicationSummary:
    return ApplicationSummary.model_validate({
        "job_identity": document["jobIdentity"],
        "status": document["status"],
        "job_mode": document["jobMode"],
        "latest_analysis_id": document["latestAnalysisId"],
        "updated_at": document["updatedAt"],
    })


def list_applications(connection: sqlite3.Connection) -> list[ApplicationSummary]:
    rows = connection.execute(
        "SELECT document_json FROM applications ORDER BY updated_at DESC",
    ).fetchall()
    return [application_summary(json.loads(row["document_json"])) for row in rows]


def update_application_status(
    connection: sqlite3.Connection,
    identity: str,
    status: ApplicationStatus,
    updated_at: str,
) -> ApplicationSummary | None:
    existing = load_application_summary(connection, identity)
    if not existing:
        return None
    existing["status"] = status
    existing["updatedAt"] = updated_at
    with connection:
        connection.execute(
            "UPDATE applications SET document_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(existing), updated_at, identity),
        )
    return application_summary(existing)


def save_materials(
    connection: sqlite3.Connection,
    bundle: MaterialBundle,
) -> None:
    application = load_application_summary(connection, bundle.job_identity)
    if not application:
        raise ValueError("Application not found")
    materials = list(application.get("materials", []))
    materials.append(bundle.model_dump(mode="json"))
    application["materials"] = materials
    application["status"] = "preparing"
    application["updatedAt"] = bundle.generated_at.isoformat()
    with connection:
        connection.execute(
            "UPDATE applications SET document_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(application), bundle.generated_at.isoformat(), bundle.job_identity),
        )


def load_latest_materials(
    connection: sqlite3.Connection,
    analysis_id: str,
) -> MaterialBundle | None:
    application = find_application_by_analysis(connection, analysis_id)
    if not application:
        return None
    for document in reversed(application.get("materials", [])):
        bundle = MaterialBundle.model_validate(document)
        if bundle.analysis_id == analysis_id:
            return bundle
    return None


def save_analysis(
    connection: sqlite3.Connection,
    job: JobPosting,
    job_mode: str,
    response: AnalysisResponse,
    clarification_answers: Sequence[ClarificationAnswer] = (),
) -> None:
    identity = job_identity(job)
    existing = load_application_summary(connection, identity) or {}
    analysis_ids = list(existing.get("analysisIds", []))
    if response.analysis_id not in analysis_ids:
        analysis_ids.append(response.analysis_id)
    application = {
        "jobIdentity": identity,
        "status": existing.get("status", "analysed"),
        "jobMode": job_mode,
        "latestAnalysisId": response.analysis_id,
        "analysisIds": analysis_ids,
        "materials": list(existing.get("materials", [])),
        "updatedAt": response.created_at.isoformat(),
    }
    existing_run_row = connection.execute(
        "SELECT document_json FROM agent_runs WHERE id = ?", (response.analysis_id,),
    ).fetchone()
    existing_run = json.loads(existing_run_row["document_json"]) if existing_run_row else {}
    existing_run.pop("error", None)
    existing_summary = existing_run.get("inputSummary", {})
    run = {
        **existing_run,
        "runId": response.analysis_id,
        "status": "completed",
        "promptVersion": response.prompt_version,
        "model": response.model,
        "inputSummary": {
            **(existing_summary if isinstance(existing_summary, dict) else {}),
            "jobIdentity": identity,
            "title": job.title,
            "jobMode": job_mode,
            "clarificationAnswers": [
                answer.model_dump(mode="json") for answer in clarification_answers
            ],
        },
        "toolEvents": [event.model_dump(mode="json") for event in response.tool_events],
        "output": response.recommendation.model_dump(mode="json"),
        "usage": response.usage.model_dump(mode="json"),
        "createdAt": existing_run.get("createdAt", response.created_at.isoformat()),
        "completedAt": response.created_at.isoformat(),
        "updatedAt": response.created_at.isoformat(),
        "response": response.model_dump(mode="json"),
    }
    with connection:
        connection.execute(
            """INSERT INTO jobs(id, document_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json, updated_at=excluded.updated_at""",
            (identity, job.model_dump_json(by_alias=True), response.created_at.isoformat()),
        )
        connection.execute(
            """INSERT INTO agent_runs(id, document_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json,
            updated_at=excluded.updated_at""",
            (response.analysis_id, json.dumps(run), response.created_at.isoformat()),
        )
        connection.execute(
            """INSERT INTO applications(id, document_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json, updated_at=excluded.updated_at""",
            (
                identity,
                json.dumps(application),
                response.created_at.isoformat(),
            ),
        )
