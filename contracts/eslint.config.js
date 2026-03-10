// @ts-check
// ESLint flat config for OPNet AssemblyScript smart contracts (btc-runtime)
// Matches the conventions used by @btc-vision/btc-runtime
//
// Required devDependencies:
//   eslint @eslint/js typescript-eslint
//
// IMPORTANT: AssemblyScript uses .ts files but is NOT standard TypeScript.
// This config enables experimentalDecorators for @final, @method, @emit, etc.

import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigDirName: import.meta.dirname,
                ecmaFeatures: {
                    experimentalDecorators: true,
                },
            },
        },
        rules: {
            // --- Core rules (matching btc-runtime repo) ---
            'no-undef': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'no-empty': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/only-throw-error': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/unbound-method': 'warn',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/no-extraneous-class': 'off',
            '@typescript-eslint/restrict-plus-operands': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/no-unnecessary-type-parameters': 'off',
            '@typescript-eslint/related-getter-setter-pairs': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            'no-loss-of-precision': 'off',

            // AssemblyScript types (u256, etc.) cannot be resolved by TypeScript ESLint
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',

            // --- OPNet contract-specific safety rules ---
            'no-restricted-syntax': [
                'error',
                {
                    selector: "TSTypeReference[typeName.name=/^(f32|f64|Float32Array|Float64Array)$/]",
                    message: 'Floating-point types are prohibited in OPNet contracts. Use u128/u256 for all arithmetic.',
                },
            ],
            'no-bitwise': 'off',
        },
    },
    {
        files: ['**/*.js'],
        ...tseslint.configs.disableTypeChecked,
    },
);
