# AI-Grain

AI-assisted grain quality analysis. AI-Grain takes measurements from grain samples (moisture, test weight, broken kernels, foreign material, damaged kernels), checks that they are valid, and assigns a grade using limits you configure.

## Requirements

- Node.js 22 or newer (see `.nvmrc`)

## Getting started

```sh
npm install
npm run check   # typecheck, lint, format check and tests
npm run build   # compile to dist/
```

## Usage

```ts
import { gradeSample, validateSample } from "ai-grain";

const errors = validateSample(sample);
const result = gradeSample(sample, [
  {
    grade: "A",
    maxMoisturePct: 13,
    minTestWeightKgPerHl: 78,
    maxBrokenKernelsPct: 2,
    maxForeignMaterialPct: 0.5,
    maxDamagedKernelsPct: 1,
  },
  {
    grade: "B",
    maxMoisturePct: 14.5,
    minTestWeightKgPerHl: 74,
    maxBrokenKernelsPct: 5,
    maxForeignMaterialPct: 1,
    maxDamagedKernelsPct: 3,
  },
]);
// result.grade is the first grade whose limits are all met, or null.
// result.failures lists, for each rejected grade, the limits that failed.
```

The limits in this example are placeholders. Use the official standards for your crop and market.

## Scripts

| Script               | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Run `src/index.ts` with reload on change |
| `npm run build`      | Compile to `dist/`                       |
| `npm test`           | Run the tests once with Vitest           |
| `npm run test:watch` | Run the tests in watch mode              |
| `npm run lint`       | Run ESLint with type-aware rules         |
| `npm run format`     | Format the code with Prettier            |
| `npm run check`      | Run every check that CI runs             |

## Project layout

```
src/        library source (index.ts is the public entry point)
test/       Vitest tests (*.test.ts)
.github/    CI workflow
```
