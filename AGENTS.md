# AGENTS.md: rules for coding agents (Codex, Claude)

Project: web12, a Vietnamese website selling digital accounts. Spec: `docs/superpowers/specs/2026-10-16-account-shop-design.md`.
Implementation plans (follow exactly, step by step): `docs/superpowers/plans/2026-10-16-phase1-part{1,2,3,4}-*.md`.
Every plan's "Global Constraints" (in Part 1) apply to all work.

## Work split (two agents in parallel)

| Agent | Branch | Tasks | Owns (only edit these) |
|---|---|---|---|
| Claude | `core` | Part 1–3, Tasks 1–8 | `packages/**`, `apps/worker/**`, `apps/mock-supplier/**` |
| Codex | `web` (branched from `core`) | Part 4, Tasks 9–13 | `apps/web/**`, `scripts/**` |
| Claude | after merge | Task 14 (seed, README, E2E) | `packages/core/scripts/seed.ts`, `README.md` |

Rules:
- **Do not edit files outside your "Owns" column.** The root `package.json` already contains every script the plans mention. Skip any plan step that says "Root package.json scripts: add …"; it is already done. If you truly need a root change, write it in your final report instead of editing.
- Do not edit `docs/**` or `AGENTS.md`.
- Commit after each task with the plan's commit message. Push your branch often.
- Merge the latest `origin/core` into `web` regularly (`git fetch && git merge origin/core`), so web code is checked against the real core API.
- `apps/web` must only call business logic through `@web12/core` (see Part 4 architecture). Never write SQL in `apps/web`.

## Codex: what to do

1. Clone into a **separate folder**, not the folder Claude works in:
   `git clone https://github.com/laqdvfb5-ai/congcure.git web12-codex && cd web12-codex && git checkout core && git checkout -b web`
2. `npm install`, then `cp .env.example .env` and fill `SECRET_KEY` (see `.env.example`).
3. Implement Part 4 (`docs/superpowers/plans/2026-10-16-phase1-part4-web.md`) Tasks 9 → 13 in order.
4. Until Claude finishes core (Tasks 2–8 on `core`), some `@web12/core` exports will not exist yet. Write code against the interfaces listed in the plan anyway. `npm run typecheck -w @web12/web` may fail only with "has no exported member" errors for core symbols that are not merged yet. Any other error is yours to fix.
5. Running the app needs a database. Run `npm run db:start` in its own terminal; it uses port 5433. If Claude's Postgres is already running on the same machine, reuse it and do not start a second one.
6. Push `web` after every task. When done, report which verification steps you could and could not run.

## Commands

- `npm run db:start`: embedded Postgres on port 5433 (leave running)
- `npm run db:migrate`, `npm test` (core tests), `npm run typecheck`
- `npm run dev`: web on http://localhost:3000
