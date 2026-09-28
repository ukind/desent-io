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
  ]),
  // Slice 7: one-way import direction (research Q1). Blocks any three-family
  // import outside src/components/scene/ — drei's useGLTF statically pulls the
  // whole three.js tree, so an accidental import elsewhere leaks the 3D payload
  // into the initial bundle. Append this object to the scaffold's flat-config
  // array (the array exported from eslint.config.mjs).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/scene/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'three', message: 'three imports live in src/components/scene/ only.' },
          { name: 'three-stdlib', message: 'three-stdlib imports live in src/components/scene/ only.' },
          { name: '@react-three/fiber', message: 'r3f imports live in src/components/scene/ only.' },
          { name: '@react-three/drei', message: 'drei imports live in src/components/scene/ only.' },
        ],
        patterns: [
          {
            group: ['three/**', 'three-stdlib/**', '@react-three/**'],
            message: 'three-family imports live in src/components/scene/ only.',
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
