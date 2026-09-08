# Show us what you’ve built — Why this interests me

I built **Kiwi Career Copilot**, a local-first Chrome extension and AI agent for job searching in New Zealand.

I arrived in New Zealand as an international student two months ago and used SEEK for the first time while looking for part-time work. I had not updated my CV for years and had never needed to write a cover letter in my previous job searches in China. Understanding unfamiliar application expectations and adapting several versions of my CV was slow and repetitive, so I started building the tool I wanted to use myself.

The project has grown in two stages. V1 was a lightweight SEEK search enhancer for filtering and managing job results. I shipped it to the Chrome Web Store, where it received 39 downloads in one month. V2 adds a Career Library for multiple CVs, visa information and project documentation, backed by a local FastAPI and SQLite service. A PydanticAI agent analyses the current job and decides which sources to query, whether to inspect an original document, when to ask for clarification and when it has enough information to conclude. Its conclusions retain links to the supporting sources.

This interests me because it is not an AI demo built around a hypothetical problem. I use it in my own job search and improve it from failures with real jobs and documents. The central engineering challenge is finding the boundary between model autonomy and reliable software: the agent makes semantic decisions, while deterministic code enforces privacy and provenance boundaries, saves progress and resumes interrupted analyses. Working through real tool-calling, retrieval and output failures has taught me how an agent behaves outside a controlled prompt—and what it takes to make that behaviour genuinely useful.
