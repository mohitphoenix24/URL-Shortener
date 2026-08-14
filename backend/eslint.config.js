/**
 * @fileoverview ESLint flat config. Kept intentionally small — a few rules
 * that catch real bugs (unused vars, no-undef under ESM) rather than a large
 * style ruleset that just creates noise to silence.
 * @author Mohit Sharma
 */

import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["error", "warn"] }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    ignores: ["node_modules/**", "coverage/**", "dist/**"],
  },
];
