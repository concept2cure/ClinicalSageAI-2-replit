# Orthofix demo pressure-test plan (public data only)

This plan outlines ways to use the Orthofix demo tenant to **pressure test workflows, analytics, and data quality** using only public sources. It mirrors the Lumen plan but is tailored to a medical device company.

## Goals

- Stress-test ingestion, enrichment, and search quality with device product data.
- Validate onboarding, permissions, and analytics workflows end-to-end.
- Surface UX gaps in product portfolio and device study tracking.

## Data expansion ideas (public only)

### 1) Expand the public document library

Add more linked sources as documents to test:

- **Press releases** (product launches, acquisitions, milestones).
- **Regulatory notices** (public FDA announcements if applicable).
- **Product brochures and instructions for use** (if publicly posted).
- **Conference posters/presentations** (if publicly available).

Suggested metadata to capture per document:

- `type` (press_release, regulatory, brochure, IFU, news)
- `title`
- `source_url`
- `published_at`
- `source`

### 2) Competitive landscape (public peer set)

Create a small competitor dataset to test comparisons. Each competitor can be stored as:

- `name`
- `website`
- `focus_area`
- `notes`

### 3) Product portfolio timeline

Add a timeline feed (public milestones) to validate event views:

- Product launch announcements
- Acquisition or partnership events
- Notable clinical or post-market study results

### 4) Post-market monitoring checks

Add a scheduled check to compare:

- Product labeling updates
- Public safety notices
- Publicly available recall or advisory announcements

## Workflow pressure tests

### 1) Onboarding workflows

- Invite multiple roles (admin, analyst, viewer).
- Validate that access controls prevent non-admin updates.

### 2) Portfolio management

- Add 10–20 additional mock products to test list scalability.
- Attach 5–10 documents per product.

### 3) Search and knowledge retrieval

- Run keyword queries across documents:
  - “spine fixation”, “orthobiologics”, “bone graft”, “instrumentation”
- Validate ranking and highlights.

### 4) Analytics dashboards

- Ensure metrics update when studies are marked completed.
- Track “portfolio category distribution” and “study status distribution.”

## Quality and compliance checks

- Confirm **no PII** beyond public demo-safe data.
- Ensure all external documents link to public sources.
- Verify seed is idempotent (safe to re-run).

## Suggested follow-on tasks for the seed kit

- Extend `seed-data/orthofix.seed.json` with:
  - Additional `documents` using verified public sources.
  - A `milestones` top-level array for press milestones.
  - Optional `competitors` list for comparison views.
- Add an optional `scripts/seed_documents_from_csv.py` to bulk add public documents from a curated CSV list.
