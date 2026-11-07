# Fiduciary Action Checklist PDF

The Google Doc is the single source. `build.py` styles it into the branded PDF that matches the other Nautilus resources (Fraunces, Inter, JetBrains Mono; navy, teal, gold; resource-library cover and footer).

1. Export the doc as Docs API JSON (documents.get) to `doc.json`.
2. `python3 build.py doc.json fiduciary-action-checklist.pdf --edition 2026.1 --month "November 2026"`
3. Copy the PDF to the `nautilus-health/resources` repo (served at resources.contractxray.com).

Notes:
- The cover block (title, descriptor, audience, purpose) and the "Put the Checklist to Work" ladder live in `build.py`, not the doc.
- The relief-protocol image in the doc is replaced by a drawn four-step flow.
- Needs Python with Playwright and Chromium.
