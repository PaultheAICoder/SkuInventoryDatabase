# trevor-inventory Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-01

## Active Technologies

- TypeScript 5.x (full-stack) + Next.js 14 (App Router), Prisma ORM, TailwindCSS, shadcn/ui (001-inventory-bom-tracker)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (full-stack): Follow standard conventions

## Recent Changes

- 001-inventory-bom-tracker: Added TypeScript 5.x (full-stack) + Next.js 14 (App Router), Prisma ORM, TailwindCSS, shadcn/ui

<!-- MANUAL ADDITIONS START -->

## Port Convention

**IMPORTANT**: All ports for this project MUST use the **45xx** range to avoid conflicts with other projects running on the same machine. When adding new services or endpoints, always choose a port in the 4500-4599 range.

| Service | Port | Description |
|---------|------|-------------|
| **App URL** | **4545** | **HTTP entry point (use this)** |
| App (internal) | 4500 | Next.js internal (not exposed) |
| PostgreSQL | 4546 | Database |

**Access the app at: http://172.16.20.50:4545**

**Do NOT use common ports like 3000, 5432, 80, 443, etc.** Always prefix with 45.

## Code Quality Standards

We do not tolerate errors or warnings in our code, as we have written all of the code from scratch. If at any point there are errors or warnings or typecheck or linter or compiler errors or warnings, they must be fixed before moving on. They should never be ignored or coded around, they should be debugged and fixed, even if they are just warnings.

### Pre-commit Checklist
- `npm run build` must complete without errors
- `npx tsc --noEmit` must complete without errors
- All warnings should be resolved, not suppressed

<!-- MANUAL ADDITIONS END -->
