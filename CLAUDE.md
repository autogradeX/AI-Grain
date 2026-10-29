# AI-Grain

npm-workspaces monorepo, TypeScript (ESM). Node 22+.

- `packages/core`: pure grading logic shared by API and web. No I/O.
- `apps/api`: Fastify + Drizzle (Postgres, or PGlite when `DATABASE_URL` is empty). One folder per module in `src/modules`; route modules take an `AppContext` so tests can swap the database, storage, mailer and classifier.
- `apps/web`: React + Vite + TanStack Query. Imports `@ai-grain/core` from its built `dist`.

Rules:

- Run `npm run check` before committing. It builds core, typechecks, lints, checks formatting and runs all tests, the same as CI.
- Relative imports in core and api use `.js` extensions.
- Every query on org data filters by `orgId` from the authenticated user. Write routes use `requireRole(...WRITE_ROLES)` or `requireRole("admin")`.
- After changing `apps/api/src/db/schema.ts`, run `npm run db:generate -- --name <change>` and commit the migration. Never edit a migration that has been released; add a new one.
- The API must keep working on Cloud Run (see `deploy/cloud-run.md`): no state on local disk (use `ctx.storage`), no state in memory that other instances need, and background jobs must survive being cut off.
- Grade limits are configuration supplied by the user. Don't hard-code official grade standards.
- Kernel counting stays in classic image processing (`apps/api/src/imaging`); Claude only classifies crops. Final percentages come from the scale.
- Tests never call the real Claude API: use `FakeClassifier` from `apps/api/test/helpers.ts`, or inject `fetch` into `ClaudeClassifier`.
