const targetedGlobs = ['src/**/*.{js,jsx,ts,tsx}'];

module.exports = {
  ignorePatterns: ['src/app/api/_examples/**'],
  extends: ['next'],
  overrides: [
    {
      files: targetedGlobs,
      rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-console': 'off',
        'no-empty': 'off',
        'react-hooks/set-state-in-effect': 'off',
        'react-hooks/preserve-manual-memoization': 'off',
        'import/no-anonymous-default-export': 'off',
      },
    },
  ],
};
