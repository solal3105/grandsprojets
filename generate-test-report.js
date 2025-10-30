#!/usr/bin/env node

/**
 * Génère un rapport JSON exploitable par une IA à partir des résultats Playwright
 * 
 * Usage:
 *   node generate-test-report.js
 * 
 * Génère: test-results/results.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_RESULTS_DIR = path.join(__dirname, 'test-results');
const OUTPUT_FILE = path.join(TEST_RESULTS_DIR, 'results.json');
const LAST_RUN_FILE = path.join(TEST_RESULTS_DIR, '.last-run.json');
const args = process.argv.slice(2);
const FAILED_ONLY = args.includes('--failed-only');
const HTML_REPORT_JSON = path.join(TEST_RESULTS_DIR, 'html', 'data', 'report.json');

function safeRmRf(dir) {
  if (!fs.existsSync(dir)) return;
  // Ne supprime que le dossier test-results sous le projet courant
  const basename = path.basename(dir);
  if (basename !== 'test-results') {
    throw new Error(`Refus de supprimer: ${dir}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

// Mode nettoyage complet
if (args.includes('--clean')) {
  console.log('🧹 Nettoyage complet du dossier test-results/...');
  safeRmRf(TEST_RESULTS_DIR);
  console.log('✅ test-results/ nettoyé et recréé.');
  process.exit(0);
}

/**
 * Lit le fichier .last-run.json
 */
function readLastRun() {
  if (!fs.existsSync(LAST_RUN_FILE)) {
    console.error('❌ Aucun résultat de test trouvé. Lancez d\'abord les tests.');
    process.exit(1);
  }
  
  const content = fs.readFileSync(LAST_RUN_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Lit les détails d'un test depuis son dossier de résultats
 */
function getTestDetails(testId) {
  const testDirs = fs.readdirSync(TEST_RESULTS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => name.includes(testId.substring(0, 20)));
  
  if (testDirs.length === 0) return null;
  
  const testDir = path.join(TEST_RESULTS_DIR, testDirs[0]);
  const errorContextFile = path.join(testDir, 'error-context.md');
  const screenshotFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.png'));
  
  const details = {
    directory: testDirs[0],
    screenshots: screenshotFiles,
    errorContext: null
  };
  
  if (fs.existsSync(errorContextFile)) {
    details.errorContext = fs.readFileSync(errorContextFile, 'utf-8');
  }
  
  return details;
}

/**
 * Extrait le nom du test depuis le nom du dossier
 */
function extractTestName(dirName) {
  // Format: contribution-01-auth-and-m-b77c1-bution-s-ouvre-correctement-chromium
  const parts = dirName.split('-');
  const browser = parts[parts.length - 1];
  const testName = parts.slice(0, -1).join('-').replace(/^\w+-\d+-/, '');
  
  return {
    testName: testName.replace(/-/g, ' '),
    browser
  };
}

/**
 * Génère le rapport JSON
 */
function generateReport() {
  console.log('📊 Génération du rapport JSON...\n');
  
  const lastRun = readLastRun();
  const report = {
    timestamp: new Date().toISOString(),
    status: lastRun.status,
    stats: {
      total: 0,
      failed: 0,
      passed: 0,
      skipped: 0
    },
    tests: []
  };

  // Mode 1: préférer le rapport HTML Playwright si disponible (permet 'skipped' + raisons)
  if (fs.existsSync(HTML_REPORT_JSON)) {
    try {
      const raw = fs.readFileSync(HTML_REPORT_JSON, 'utf-8');
      const htmlReport = JSON.parse(raw);

      const tests = [];

      // Parcours récursif des suites pour extraire les specs/tests
      function walkSuite(suite) {
        if (!suite) return;
        if (suite.suites) suite.suites.forEach(walkSuite);
        if (suite.specs) {
          suite.specs.forEach(spec => {
            // Chaque spec a potentiellement plusieurs tests (projets navigateurs)
            (spec.tests || []).forEach(t => {
              const projectName = t.projectName || 'unknown';
              const result = (t.results && t.results[0]) || {};
              const status = normalizeStatus(result.status || t.status);
              const annotations = t.annotations || result.annotations || [];
              const skipAnno = annotations.find(a => a.type === 'skip');
              const skipReason = skipAnno?.description || result.skipReason || null;
              const errors = (result.errors || []).map(e => e.message).filter(Boolean);

              tests.push({
                name: spec.title || t.title,
                browser: projectName,
                status: status,
                directory: deriveDirName(spec.title, projectName),
                screenshots: [],
                error: errors.length ? errors.join('\n') : null,
                skipReason: status === 'skipped' ? (skipReason || null) : null
              });
            });
          });
        }
      }

      function normalizeStatus(s) {
        // Playwright utilise 'expected'/'unexpected' au niveau agrégé parfois
        if (s === 'expected') return 'passed';
        if (s === 'unexpected') return 'failed';
        return s || 'unknown';
      }

      function deriveDirName(title, project) {
        // Meilleur effort: ce champ n'est pas vital pour l'IA
        if (!title) return '';
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        return `${slug}-${project}`;
      }

      // Lancer le parcours
      (htmlReport.suites || []).forEach(walkSuite);

      // Agréger stats
      report.tests = tests;
      report.stats.total = tests.length;
      report.stats.failed = tests.filter(t => t.status === 'failed').length;
      report.stats.passed = tests.filter(t => t.status === 'passed').length;
      report.stats.skipped = tests.filter(t => t.status === 'skipped').length;
      report.status = report.stats.failed > 0 ? 'failed' : 'passed';

      console.log(`📁 Rapport HTML détecté. Tests: ${report.stats.total} (passed=${report.stats.passed}, failed=${report.stats.failed}, skipped=${report.stats.skipped})\n`);
    } catch (e) {
      console.warn('⚠️ Échec lecture du rapport HTML, fallback dossier. Raison:', e.message);
      buildFromDirectories(report);
    }
  } else {
    // Mode 2: fallback basé sur les dossiers
    buildFromDirectories(report);
  }
  
  // Mettre à jour le total et le statut
  if (FAILED_ONLY) {
    // Ne garder que les tests en échec
    report.tests = report.tests.filter(t => t.status === 'failed');
    // Recalculer les stats pour ne compter que ces tests
    report.stats.failed = report.tests.length;
    report.stats.passed = 0;
    report.stats.skipped = 0;
    report.stats.total = report.tests.length;
    report.status = report.stats.failed > 0 ? 'failed' : 'passed';
  } else {
    report.stats.total = report.tests.length;
    report.status = report.stats.failed > 0 ? 'failed' : 'passed';
  }
  
  // Écrire le rapport
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf-8');
  
  console.log('✅ Rapport généré avec succès !\n');
  console.log(`📄 Fichier : ${OUTPUT_FILE}`);
  console.log(`\n📊 Statistiques :`);
  console.log(`   - Total : ${report.stats.total} tests`);
  console.log(`   - ✅ Réussis : ${report.stats.passed}`);
  console.log(`   - ❌ Échoués : ${report.stats.failed}`);
  if (report.stats.skipped !== undefined) {
    console.log(`   - ⏭️ Skipped : ${report.stats.skipped}`);
  }
  console.log(`\n💡 Vous pouvez maintenant copier le contenu de results.json et le donner à une IA.\n`);
}

// Fallback legacy: lecture basée sur les dossiers de test-results/
function buildFromDirectories(report) {
  // Lire tous les dossiers de résultats
  const testDirs = fs.readdirSync(TEST_RESULTS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .filter(dirent => !dirent.name.startsWith('.'))
    .map(dirent => dirent.name);

  console.log(`📁 ${testDirs.length} dossiers de résultats trouvés\n`);

  testDirs.forEach(dirName => {
    const { testName, browser } = extractTestName(dirName);
    const testDir = path.join(TEST_RESULTS_DIR, dirName);
    const errorContextFile = path.join(testDir, 'error-context.md');
    const screenshotFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.png'));

    const hasError = fs.existsSync(errorContextFile);

    const testResult = {
      name: testName,
      browser,
      status: hasError ? 'failed' : 'passed',
      directory: dirName,
      screenshots: screenshotFiles.map(f => path.join(dirName, f)),
      error: hasError ? fs.readFileSync(errorContextFile, 'utf-8') : null,
      skipReason: null
    };

    report.tests.push(testResult);
    if (hasError) report.stats.failed++; else report.stats.passed++;
  });

  report.stats.total = report.tests.length;
  report.status = report.stats.failed > 0 ? 'failed' : 'passed';
}

// Exécuter
try {
  generateReport();
} catch (error) {
  console.error('❌ Erreur lors de la génération du rapport :', error.message);
  process.exit(1);
}
