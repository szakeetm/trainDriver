const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  reporter: [['list']],
});