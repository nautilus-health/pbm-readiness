# Fiduciary Action Checklist PDF

The Google Doc is the single source. `build.py` styles it into the branded PDF that matches the other Nautilus resources (Fraunces, Inter, JetBrains Mono; navy, teal, gold; resource-library cover and footer).

1. Export the doc as Docs API JSON (documents.get) to `doc.json`.
2. `python3 build.py doc.json fiduciary-action-checklist.pdf --edition 2026.1 --month "November 2026"`
3. Copy the PDF to the `nautilus-health/resources` repo (served at resources.contractxray.com).

Notes:
- The cover block (title, descriptor, audience, purpose) and the "Put the Checklist to Work" ladder live in `build.py`, not the doc.
- The relief-protocol image in the doc is replaced by a drawn four-step flow.
- Needs Python with Playwright and Chromium.

## Editions

- **2026.2 (November 2026, current public edition).** Source Doc: "Fiduciary Action Checklist - Edition 2026.2 (Public, November 2026)" in My Drive > Nautilus > DOL (Doc ID 1m9sXEHSiULOcb3nLNC6dN5yVSztpGNcZLxvi5itkyxs). Snapshot in `edition-2026.2/doc.json`. Build: `python3 build.py edition-2026.2/doc.json fiduciary-action-checklist.pdf --edition 2026.2 --month "November 2026"`. Same regulatory content as 2026.1; links moved to nautilushealth.org/pbm (lowercase, the uppercase path 404s on Squarespace) and Navigator Q&A references added. `edition-2026.2/derive.py` records how this edition was separated from the 2027 review draft.
- **2027 Edition (review draft).** "DOL PBM Fee Disclosure Rule: Fiduciary Action Checklist, 2027 Edition REVIEW DRAFT" is out with reviewers (comments due December 19, 2026). Do not publish from it until the review closes.
