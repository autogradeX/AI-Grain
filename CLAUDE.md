# AI-Grain

TypeScript (ESM, NodeNext) library for grain quality analysis. Node 22+.

- Run `npm run check` before committing. It runs typecheck, lint, the Prettier check and the tests, the same checks as CI.
- Source is in `src/`. Export the public API from `src/index.ts`. Relative imports use `.js` extensions.
- Tests are in `test/*.test.ts` and use Vitest.
- The tsconfig is strict and includes `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Grade limits are configuration supplied by the caller. Don't hard-code official grade standards in library code.
