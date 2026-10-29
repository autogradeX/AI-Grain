import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "**/coverage",
      "**/node_modules",
      "apps/api/drizzle",
      "data",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "vitest.config.ts",
            "packages/core/vitest.config.ts",
            "apps/api/vitest.config.ts",
            "apps/api/drizzle.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Template literals with numbers are common and clear in UI and log text.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowNullish: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Fastify route handlers are async by convention even when they don't await.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
