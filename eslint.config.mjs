import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // One-off Node seed/utility scripts, not part of the app bundle.
    "scripts/**",
  ]),
  {
    rules: {
      // React Compiler strict rules — downgraded from error to warn.
      // These flag valid pre-Compiler patterns (setState in effects, ref reads
      // during render, component creation in render body, etc.). The patterns
      // work correctly at runtime; the Compiler just can't optimise them.
      // Keeping as warn preserves visibility without failing the build.
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      // German UI strings naturally contain " characters — entity escaping
      // (`&quot;`) is unnecessary noise in JSX text.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
