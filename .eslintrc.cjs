module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  overrides: [
    { files: ['vite.config.js', 'scripts/**', 'api/**'], env: { node: true, browser: false } },
  ],
};
