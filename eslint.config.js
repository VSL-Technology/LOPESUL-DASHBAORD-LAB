import nextConfig from 'eslint-config-next';

const targetedGlobs = ['src/**/*.{js,jsx,ts,tsx}'];

export default [
  {
    ignores: ['src/app/api/_examples/**'],
  },
  ...nextConfig,
  {
    files: targetedGlobs,
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'no-empty': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
];
