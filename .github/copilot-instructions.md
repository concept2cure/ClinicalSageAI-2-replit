# Clinical Sage AI - Copilot Instructions

## Project Overview
This is a hybrid full-stack application for clinical regulatory automation, combining a Node.js/Express backend, React/Vite frontend, and Python-based analysis tools. The system is designed to generate regulatory documents (CER, eCTD, IND) using AI.

## Architecture & Codebase Structure

### Top-Level Organization
- **`/server`**: Node.js/Express backend. Entry point: `server/index.ts`.
- **`/client`**: React frontend built with Vite. Entry point: `client/src/main.tsx`.
- **`/shared`**: Shared code (types, schemas) between client and server. **CRITICAL**: Database schema is here.
- **`/analysis` & `/regulatory`**: Python scripts for data validation, metrics computing, and document generation logic.
- **`/data`**: Static data assets and sample studies.

### Key Technologies
- **Backend**: Node.js, Express, TSX (TypeScript Execute).
- **Frontend**: React, Tailwind CSS, Shadcn UI, Vite.
- **Database**: PostgreSQL (Neon), Drizzle ORM.
- **Languages**: TypeScript (preferred for app logic), JavaScript (legacy/scripts), Python (Data Science/ML).

## Critical Developer Workflows

### Development
- **Start Full Stack**: `npm run dev`
  - Runs `server/index.ts` with `tsx --inspect`.
  - Sets up Vite middleware for frontend serving (see `server/vite.ts`).
  - *Note*: Python backend startup is currently commented out in `server/index.ts` for optimization.

### Database Management
- **Schema Reference**: `shared/schema.ts` is the Source of Truth.
- **Migrations**: `npm run db:push` uses Drizzle Kit to push schema changes.
- **ORM**: Use `drizzle-orm` for all DB interactions.

### Python Analysis & Validation
- Validation workflows are script-based (e.g., `analysis/analysis.py`).
- Run validation: `npm run validate` (wraps python commands).
- Dependencies: `analysis/requirements.txt`.

## Conventions & Patterns

### Database Access
- **Always** import schema definitions from `@shared/schema`.
- Use Drizzle's query builder style (e.g., `db.select().from(...)`).
- Do not write raw SQL unless absolutely necessary.

### Frontend/Backend Communication
- **API Routes**: Defined in `server/routes.ts` or `server/routes/*.ts`.
- **Client API**: `client/src/api/*.js` contains wrapper functions for fetch calls.
- **Routing**: Client-side routing in `client/src/App.jsx` (or `SimpleApp.tsx`).

### Feature Implementation Guide
1.  **Database**: Define new tables in `shared/schema.ts`.
2.  **API**: Add Express routes in `server/routes.ts` or new file in `server/routes/`.
3.  **Frontend**: Create components in `client/src/components` and pages in `client/src/pages`.
4.  **Integration**: Access data via `client/src/api` modifications.

### Python Integration
- Python scripts are often invoked as child processes or separate tasks.
- See `server/index.ts` for the pattern of spawning Python processes (e.g., `startPythonBackend`, `spawn`).
- If working on CER/Analysis features, check `*.py` files in root and `server/` for core logic (e.g., `cer_generator.py`).

## Specific File References
- **`ACTIVE_FILE_STRUCTURE.md`**: Up-to-date map of file organization and feature locations.
- **`manifesto.md`**: (If available) Project philosophy.
- **`shared/schema.ts`**: **READ THIS FIRST** when working with data.
- **`server/index.ts`**: Understanding server bootstrapping and middleware.

## Common Pitfalls
- **Imports**: Use `@shared/*` alias for shared code.
- **Environment**: Backend runs on port 5000 by default.
- **Mixed file types**: Be aware of `.js`, `.jsx`, `.ts`, `.tsx` coexistence. Prefer TS/TSX for new files.
