module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'api'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
};
