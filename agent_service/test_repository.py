import sqlite3
from pathlib import Path

from .models import CandidateSourceClaimInput, CandidateSourceClassification
from .repository import (
    create_candidate_source,
    load_candidate_claims,
    load_candidate_conflicts,
    load_candidate_sources,
    open_database,
    resolve_candidate_conflict,
    save_candidate_source_claims,
    search_candidate_sources,
    update_candidate_source,
)


def ready_source(connection, name: str, text: str, *, sensitive: bool = False):
    source, created = create_candidate_source(
        connection, name, "text/plain", text.encode(), text,
    )
    assert created
    return update_candidate_source(connection, source.id, CandidateSourceClassification(
        kind="visa" if sensitive else "cv",
        purposeTags=["work-rights"] if sensitive else ["professional"],
        sensitivity="highly-sensitive" if sensitive else "personal",
        summary="Imported career source.",
    ))


def claim(**overrides: object) -> CandidateSourceClaimInput:
    values: dict[str, object] = {
        "category": "project",
        "key": "project.kiwi",
        "title": "Kiwi project",
        "statement": "The candidate built Kiwi with Python.",
        "attributes": {"project": "Kiwi", "technology": "Python"},
        "sourceText": "built Kiwi with Python",
        "confidence": "high",
        "exclusive": False,
    }
    values.update(overrides)
    return CandidateSourceClaimInput.model_validate(values)


def test_old_profile_tables_are_removed_while_sources_survive(tmp_path: Path) -> None:
    path = tmp_path / "legacy.sqlite3"
    connection = sqlite3.connect(path)
    connection.executescript("""
        CREATE TABLE jobs (id TEXT PRIMARY KEY, document_json TEXT, updated_at TEXT);
        CREATE TABLE applications (id TEXT PRIMARY KEY, document_json TEXT, updated_at TEXT);
        CREATE TABLE agent_runs (id TEXT PRIMARY KEY, document_json TEXT, updated_at TEXT);
        CREATE TABLE candidate_profile (singleton_id INTEGER PRIMARY KEY, document_json TEXT, updated_at TEXT);
        CREATE TABLE evidence (id TEXT PRIMARY KEY, document_json TEXT, updated_at TEXT);
        PRAGMA user_version = 1;
    """)
    connection.close()

    migrated = open_database(path)
    tables = {
        row[0] for row in migrated.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'",
        ).fetchall()
    }
    assert migrated.execute("PRAGMA user_version").fetchone()[0] == 7
    assert "candidate_profile" not in tables and "evidence" not in tables
    assert "candidate_sources" in tables and "source_claims" in tables


def test_source_search_is_source_only_deduplicated_and_private_by_default(tmp_path: Path) -> None:
    connection = open_database(tmp_path / "library.sqlite3")
    cv = ready_source(connection, "cv.txt", "Built a production service on AWS EC2.")
    visa = ready_source(
        connection, "visa.txt", "Work visa permits employment on AWS projects.", sensitive=True,
    )
    duplicate, created = create_candidate_source(
        connection, "copy.txt", "text/plain", b"Built a production service on AWS EC2.",
        "Built a production service on AWS EC2.",
    )

    assert not created and duplicate.id == cv.id
    assert [item["fileName"] for item in search_candidate_sources(connection, "AWS")] == [
        "cv.txt",
    ]
    assert [item["fileName"] for item in search_candidate_sources(
        connection, "AWS", source_ids=[visa.id],
    )] == ["visa.txt"]


def test_claims_are_source_owned_and_only_real_exclusive_differences_conflict(
    tmp_path: Path,
) -> None:
    connection = open_database(tmp_path / "claims.sqlite3")
    sources = [
        ready_source(connection, f"visa-{year}.txt", f"Visa expires {year}-10-01.")
        for year in (2026, 2027)
    ]
    for source, year in zip(sources, (2026, 2027), strict=True):
        save_candidate_source_claims(connection, source.id, f"Visa expires {year}-10-01.", [
            claim(
                category="work-rights",
                key="work-rights.current-visa",
                title="Current visa",
                statement=f"The visa expires on {year}-10-01.",
                attributes={"expiry-date": f"{year}-10-01"},
                sourceText=f"Visa expires {year}-10-01",
                exclusive=True,
            ),
        ])

    conflicts = load_candidate_conflicts(connection)
    assert len(conflicts) == 1
    assert {item.source_id for item in conflicts[0].claims} == {item.id for item in sources}
    assert resolve_candidate_conflict(connection, conflicts[0].id, conflicts[0].claims[1].id)
    assert load_candidate_conflicts(connection) == []


def test_sensitive_sources_never_index_identity_or_contact_claims(tmp_path: Path) -> None:
    connection = open_database(tmp_path / "privacy.sqlite3")
    text = "Client number AB123. Visa permits twenty hours of work each week."
    source = ready_source(connection, "visa.txt", text, sensitive=True)
    saved = save_candidate_source_claims(connection, source.id, text, [
        claim(
            category="identity", key="identity.client-number", title="Client number",
            statement="The client number is AB123.", attributes={"number": "AB123"},
            sourceText="Client number AB123", exclusive=True,
        ),
        claim(
            category="work-rights", key="work-rights.weekly-hours", title="Work condition",
            statement="The visa permits twenty hours of work each week.",
            attributes={"maximum-hours": "twenty"},
            sourceText="Visa permits twenty hours of work each week", exclusive=True,
        ),
    ])

    assert [item.category for item in saved] == ["work-rights"]
    assert load_candidate_claims(connection, source.id)[0].source_ref.startswith(source.id)
