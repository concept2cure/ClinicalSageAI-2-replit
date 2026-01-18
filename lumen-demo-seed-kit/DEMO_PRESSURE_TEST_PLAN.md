# Lumen Bioscience demo pressure-test plan (public data only)

This plan outlines additional ways to use the Lumen Bioscience demo tenant to **pressure test workflows, analytics, and data quality** using only public sources. It is designed to complement the seed kit payload and can be adapted to your platform.

## Goals

- Stress-test ingestion, enrichment, and search quality with real-world public data.
- Validate onboarding, permissions, and analytics workflows end-to-end.
- Surface UX gaps in pipeline management, trial tracking, and document linkage.

## Data expansion ideas (public only)

### 1) Expand the public document library

Add more linked sources as documents to test:

- **Press releases** (milestones, partnerships, fundraising).
- **Regulatory filings** (if any public SEC filings exist).
- **Patent references** (public patent databases, if relevant to your use case).
- **Conference posters/presentations** (if publicly available).

Suggested metadata to capture per document:

- `type` (press_release, patent, slide_deck, regulatory, news)
- `title`
- `source_url`
- `published_at`
- `source` (e.g., PRNewswire, company site)

### 2) Competitive landscape (public peer set)

Create a small competitor dataset to test comparisons. Each competitor can be stored as:

- `name`
- `website`
- `modality`
- `program_focus`
- `notes`

Suggested competitors for **spirulina-based or oral biologics** can be determined from public sources and industry articles.

### 3) Funding and milestones timeline

Add a timeline feed (public milestones) to validate event views:

- Funding rounds (if public)
- Key trial milestones (start, enrollment, completion)
- Press mentions of trial results

### 4) Trial updates and recruitment status checks

Add a weekly or monthly scheduled check to compare:

- Trial status (active, recruiting, completed)
- Estimated completion dates
- Enrollment targets

The schedule can be automated and compared to existing data for drift detection.

## Workflow pressure tests

### 1) Onboarding workflows

- Invite multiple roles (admin, analyst, viewer).
- Validate that access controls prevent non-admin updates.

### 2) Pipeline management

- Add 10–20 additional mock programs to test list scalability.
- Attach 5–10 documents per program.

### 3) Search and knowledge retrieval

- Run keyword queries across documents:
  - “spirulina”, “bacteriophage lysin”, “toxin B”, “ileostomy”, “intranasal”
- Validate ranking and highlights.

### 4) Analytics dashboards

- Ensure metrics update when studies are marked completed.
- Track “pipeline stage distribution” and “trial status distribution.”

## Quality and compliance checks

- Confirm **no PII** beyond public demo-safe data.
- Ensure all external documents link to public sources.
- Verify seed is idempotent (safe to re-run).

## Suggested follow-on tasks for the seed kit

- Extend `seed-data/lumen_bioscience.seed.json` with:
  - Additional `documents` using verified public sources.
  - A `milestones` top-level array for press milestones.
  - Optional `competitors` list for comparison views.
- Add an optional `scripts/seed_documents_from_csv.py` to bulk add public documents from a curated CSV list.

