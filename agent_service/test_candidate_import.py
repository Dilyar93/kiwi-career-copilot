from base64 import b64encode
from io import BytesIO
from zipfile import ZipFile

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from .candidate_import import CandidateDocumentError, extract_candidate_document
from .models import CandidateImportRequest


def request(filename: str, content: bytes) -> CandidateImportRequest:
    return CandidateImportRequest.model_validate({
        "fileName": filename,
        "contentBase64": b64encode(content).decode(),
    })


def test_extracts_text_and_docx_without_trusting_the_filename_path() -> None:
    filename, media_type, _, text, warnings = extract_candidate_document(request(
        "../private/cv.txt",
        b"Aroha Example\nGraduate developer with TypeScript project experience.",
    ))
    assert filename == "cv.txt"
    assert media_type == "text/plain"
    assert "TypeScript project experience" in text
    assert warnings == []

    content = BytesIO()
    with ZipFile(content, "w") as archive:
        archive.writestr("word/document.xml", """
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body><w:p><w:r><w:t>Aroha Example</w:t></w:r></w:p>
          <w:p><w:r><w:t>Built a tested web application.</w:t></w:r></w:p></w:body>
        </w:document>
        """)
    _, _, _, docx_text, _ = extract_candidate_document(request("cv.docx", content.getvalue()))
    assert docx_text == "Aroha Example\nBuilt a tested web application."


def test_rejects_unsupported_or_disguised_documents() -> None:
    with pytest.raises(CandidateDocumentError, match="unsupported"):
        extract_candidate_document(request("cv.doc", b"legacy document content"))
    with pytest.raises(CandidateDocumentError, match="unreadable"):
        extract_candidate_document(request("cv.pdf", b"not really a pdf"))


def test_extracts_selectable_pdf_text() -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
    })
    stream = DecodedStreamObject()
    stream.set_data(
        b"BT /F1 12 Tf 72 720 Td (Aroha Example - TypeScript project experience) Tj ET",
    )
    page[NameObject("/Contents")] = stream
    content = BytesIO()
    writer.write(content)

    _, _, _, text, warnings = extract_candidate_document(request("cv.pdf", content.getvalue()))
    assert "TypeScript project experience" in text
    assert warnings == []


def test_extracts_markdown_as_a_career_source() -> None:
    _, media_type, _, text, _ = extract_candidate_document(request(
        "project.md",
        b"# Kiwi\n\nA local-first career agent with source-backed analysis.",
    ))
    assert media_type == "text/markdown"
    assert "source-backed analysis" in text
