import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Charger les variables d'environnement depuis .env
dotenv.config();

/**
 * Configuration Playwright pour GrandsProjets
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Dossier contenant les tests
  testDir: './tests',
  
  // Timeout pour chaque test
  timeout: 60 * 1000,
  
  // Timeout pour les assertions expect()
  expect: {
    timeout: 10 * 1000
  },
  
  // Lancer les tests en parallèle dans chaque fichier
  fullyParallel: true,
  
  // Interdire les tests .only en CI
  forbidOnly: !!process.env.CI,
  
  // Nombre de tentatives en cas d'échec
  retries: process.env.CI ? 2 : 0,
  
  // Nombre de workers (processus parallèles)
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter pour afficher les résultats
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  // Options partagées pour tous les tests
  use: {
    // URL de base pour les tests
    baseURL: 'http://localhost:3000',
    
    // Capturer une trace en cas d'échec (pour debug)
    trace: 'on-first-retry',
    
    // Capturer des screenshots en cas d'échec
    screenshot: 'only-on-failure',
    
    // Capturer des vidéos en cas d'échec
    video: 'retain-on-failure',
    
    // Timeout pour les actions (click, fill, etc.)
    actionTimeout: 15 * 1000,
    
    // Timeout pour la navigation
    navigationTimeout: 30 * 1000,
  },

  // Projets de test (navigateurs)
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Viewport par défaut
        viewport: { width: 1920, height: 1080 }
      },
    },

    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 }
      },
    },

    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 }
      },
    },

    // Tests mobile
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Serveur de développement - Playwright le démarre automatiquement
  webServer: {
    command: 'python -m http.server 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
