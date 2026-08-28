// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.statewave-guide/**',
      '**/test/fixtures/**',
      // Throwaway worktrees: whole copies of this repository, already linted
      // where they actually live.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `any` erases the guarantees the whole architecture rests on.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The CLI and the demo app are allowed to talk to humans.
    files: ['packages/indexer/src/cli.ts', 'packages/indexer/src/reporter.ts', 'examples/**/*'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.config.{ts,js}', '**/test/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // Repo-level Node CLI programs: they talk to a terminal by design.
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        globalThis: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        // The end-to-end suite runs `page.evaluate` callbacks, whose bodies are
        // serialised and executed inside the browser. They are lexically in this
        // file and never run in Node, which is why `document` is legitimate here
        // and would not be anywhere else.
        document: 'readonly',
        FocusEvent: 'readonly',
        getComputedStyle: 'readonly',
        // Closed Loop #17 reads geometry and the route from inside the page.
        window: 'readonly',
        // Closed Loop #18 paints over a region of a screenshot inside a canvas.
        Image: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  prettier,
);
