# AI-Grain

npm-workspaces monorepo, TypeScript (ESM). Node 22+.

- `packages/core`: pure grading logic shared by API and web. No I/O.
- `apps/api`: Fastify + Drizzle (Postgres, or PGlite when `DATABASE_URL` is empty). One folder per module in `src/modules`; route modules take an `AppContext` so tests can swap the database, storage, mailer and classifier.
- `apps/web`: React + Vite + TanStack Query. Imports `@ai-grain/core` from its built `dist`. The public website lives at `/` (`src/pages/public`); the signed-in app lives under `/app`.

Rules:

- Run `npm run check` before committing. It builds core, typechecks, lints, checks formatting and runs all tests, the same as CI.
- Relative imports in core and api use `.js` extensions.
- Every query on org data filters by `orgId` from the authenticated user. Write routes use `requireRole(...WRITE_ROLES)` or `requireRole("admin")`.
- After changing `apps/api/src/db/schema.ts`, run `npm run db:generate -- --name <change>` and commit the migration. Never edit a migration that has been released; add a new one.
- The API must keep working on Cloud Run (see `deploy/cloud-run.md`): no state on local disk (use `ctx.storage`), no state in memory that other instances need, and background jobs must survive being cut off.
- Grade limits are configuration supplied by the user. Don't hard-code official grade standards.
- Kernel counting stays in classic image processing (`apps/api/src/imaging`); Claude only classifies crops. Final percentages come from the scale.
- Public endpoints (`/api/public/...`) only expose data of the site-owner organisation that it chose to publish (demo samples, published articles, certificates).
- User-facing text (UI, PDF, API messages, seeded content) calls the AI "Model Orchestration" and model choices Standard / Economy / Advanced (`i18n/models.ts`, `MODEL_TIERS` in `config.ts`). Never show Claude or other model names to users; code identifiers and env vars may keep them.
- UI text goes in a sibling `<Module>.i18n.ts` (`defineMessages`, English and Hindi) read with `useT`; show class, group and crop names with `useGrainLabels()`.
- The service worker (`apps/web/sw/service-worker.js`, filled in at build by `vite.config.ts`) caches only the app shell and static assets. Never cache `/api` responses: they hold org data behind sign-in.
- Tests never call the real Claude API: use `FakeClassifier` from `apps/api/test/helpers.ts`, or inject `fetch` into `ClaudeClassifier`.
