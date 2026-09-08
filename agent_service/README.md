# Local Agent service

The V2 service is local-only and refuses requests without a shared token and the configured extension identity. Chrome omits `Origin` on extension fetches covered by host permissions, so those requests carry the extension ID in a separate header; requests that do include a non-extension Origin are rejected.

```bash
python3 -m venv .venv
.venv/bin/pip install -r agent_service/requirements.txt
.venv/bin/python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copy the unpacked extension ID from `chrome://extensions`, then start the service with the generated token:

```bash
export JOBFILTER_AGENT_TOKEN='replace-with-generated-token'
export JOBFILTER_EXTENSION_ORIGIN='chrome-extension://replace-with-extension-id'
export ALIBABA_API_KEY='replace-with-your-model-studio-api-key'
.venv/bin/python -m agent_service
```

The service binds only to `127.0.0.1:8765` and uses `alibaba:qwen3.7-plus` through Model Studio's international endpoint by default. `DASHSCOPE_API_KEY` is also accepted. Paste the shared token into **Settings → Local Agent server** in the extension and select **Save and test connection**.

Run the service contract tests with:

```bash
.venv/bin/pytest agent_service -q
```

Career material is added only through the extension's **Career Library**. The extension's **Import settings** action imports filter settings, not career material. Private runtime data is written under ignored `agent-data/`.

The Career Library accepts PDF, DOCX, Markdown, and text sources up to 2 MB. The original and extracted text are saved locally before the extracted text is sent to the configured model for classification and source-bound Claim extraction. Claims are retrieval indexes, not a checklist for the user. Only conflicts or failed indexing appear for review. During job analysis, the Agent decides whether to query Claims, search chunks, open a specific original, or stop. Generic search omits highly sensitive raw text; the Agent can deliberately select a known sensitive source when the job requires it. Image-only PDFs require OCR first and legacy `.doc` files are unsupported.

The tests use PydanticAI's local `FunctionModel`: they verify Agent tool-choice freedom, Source retrieval, provenance, privacy and API contracts without sending candidate data or spending API credit. Full product evaluation remains a final-stage activity; see [`docs/v2/quality.md`](../docs/v2/quality.md).
