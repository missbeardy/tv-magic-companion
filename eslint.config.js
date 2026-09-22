import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` is build output; `*.d.ts` and the generated Supabase types are
  // generated artifacts, not hand-maintained source, so they aren't linted.
  globalIgnores(['dist', '**/*.d.ts', 'src/types/database.types.ts', 'e2e', 'playwright.config.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // api/_lib/log.ts is the structured logger; a bare console.log elsewhere in api/
    // skips its JSON-per-line shape. console.info/warn/error stay allowed — those
    // already carry meaningful severity and several are called directly (Sentry
    // capture sites, etc.), not just through log.ts.
    files: ['api/**/*.ts'],
    rules: {
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },
])
