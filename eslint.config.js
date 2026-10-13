import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  {
    ignores: [
      '**/node_modules/',
      '**/build/',
      '**/dist/',
      '**/.svelte-kit/',
      'packages/db/drizzle/',
      '**/test-results/',
      '**/playwright-report/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: {
      // links carry ids in the query string (`${resolve('/drill')}?id=…`), which the rule
      // cannot follow; every link still goes through resolve()
      'svelte/no-navigation-without-resolve': ['error', { ignoreLinks: true }],
    },
  },
  {
    // chessground is GPL: only Board.svelte may import it (see docs/adr/005-licensing.md).
    files: ['**/*.{ts,js,svelte}'],
    ignores: ['apps/web/src/lib/Board.svelte'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['chessground', 'chessground/*'],
              message: 'Only Board.svelte may import chessground.',
            },
          ],
        },
      ],
    },
  },
);
