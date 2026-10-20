# AGENTS.md: rules for coding agents

Project: web12, a Vietnamese website selling digital accounts. Spec: `docs/superpowers/specs/2026-10-16-account-shop-design.md`.
Phase 1 plans (done): `docs/superpowers/plans/2026-10-16-phase1-part{1,2,3,4}-*.md`. Their "Global Constraints" (Part 1) still apply.

## Layout

- `packages/db`: pg pool + `withTx` (`@web12/db`, safe to bundle). Node-only helpers `loadEnv`, `migrate`, `ALL_TABLES` live in `@web12/db/node`; never import that from `apps/web`, because Turbopack would try to bundle the filesystem paths it uses.
- `packages/core`: all business logic and its tests. Money and stock writes happen only here.
- `apps/web`: Next.js 16. Pages, server actions and route handlers only validate input, call `@web12/core` and format output. No SQL here.
- `apps/worker`: pg-boss consumer for API-supplier orders and the stale-order sweeper.
- `apps/mock-supplier`: fake upstream supplier for dev and tests.

## Rules

- Postgres must be UTF8 (`migrate()` refuses otherwise).
- Every balance change goes through `applyBalanceChange` and writes exactly one ledger row.
- Add a migration file (`packages/db/migrations/NNN_name.sql`) for schema changes; never edit applied ones.
- Run `npm test` and `npm run typecheck` before committing.

## Commands

- `npm run db:start` (embedded Postgres, port 5433), `npm run db:migrate`, `npm run db:seed`
- `npm run dev` (web :3000), `npm run worker`, `npm run mock:supplier` (:4100)
- `npm run fake:topup -- NAP2 100000`, `npm run api:smoke -- <API_KEY>`
