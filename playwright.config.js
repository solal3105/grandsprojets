// @ts-check
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    locale: 'fr-FR',
  },

  projects: [
    // --- Auth setup (runs first, produces storageState files) ---
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    // --- Admin tests (excl. z-logout qui révoque le token) ---
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/admin.json',
      },
      dependencies: ['setup'],
      testMatch: /admin\.(?!z-logout).*\.spec\.js/,
    },

    // --- Admin logout (DOIT tourner après tous les tests admin/invited)
    // signOut() côté serveur révoque le token — ce projet en dépend ---
    {
      name: 'admin-logout',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/admin.json',
      },
      dependencies: ['admin', 'invited'],
      testMatch: /admin\.z-logout\.spec\.js/,
    },

    // --- Invited tests ---
    {
      name: 'invited',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/invited.json',
      },
      dependencies: ['setup'],
      testMatch: /invited\..*\.spec\.js/,
    },

    // --- Unauthenticated tests ---
    {
      name: 'unauth',
      timeout: 60000,
      retries: 1,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-webgl', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
      testMatch: /unauth\..*\.spec\.js/,
    },
  ],

  // Démarre le serveur netlify dev automatiquement si pas déjà lancé
  webServer: {
    command: 'netlify dev --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
