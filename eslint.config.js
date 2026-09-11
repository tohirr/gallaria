// src/ runs in the browser; the Vite config, scripts/ and the Vercel
// functions in api/ run under Node.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([
  globalIgnores(["dist/"]),
  js.configs.recommended,
  { files: ["src/**"], languageOptions: { globals: globals.browser } },
  {
    files: ["vite.config.js", "eslint.config.js", "scripts/**", "api/**"],
    languageOptions: { globals: globals.node },
  },
]);
