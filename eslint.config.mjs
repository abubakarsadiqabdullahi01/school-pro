import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Build output, not source. deploy/ holds the minified standalone bundle
      // and the compiled seed; linting it drowns real findings in thousands of
      // errors from generated code.
      "deploy/**",
      "outputs/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "tsconfig.tsbuildinfo",
    ],
  },
  js.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    settings: {
      react: { version: '19.2.3' },
    },
  },
];
