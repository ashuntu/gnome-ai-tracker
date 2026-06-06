import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: './tsconfig.json',
                ecmaVersion: 2023,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            'no-var': 'error',
            'prefer-const': 'error',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all'],
            'quotes': ['error', 'double'],
            'indent': ['error', 4],
            'semi': ['error', 'always'],
            'brace-style': ['error', 'allman'],
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
];
