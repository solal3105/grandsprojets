/**
 * Reporter JSON qui fonctionne AUSSI en mode UI
 * Ce reporter s'exécute même quand on lance les tests via `playwright test --ui`
 */

import fs from 'fs';
import path from 'path';

class UIJsonReporter {
  constructor(options = {}) {
    this.outputFile = options.outputFile || 'test-results/results.json';
    this.results = {
      config: {},
      suites: [],
      errors: [],
      stats: {
        startTime: null,
        duration: 0,
        expected: 0,
        unexpected: 0,
        flaky: 0,
        skipped: 0
      }
    };
  }

  onBegin(config, suite) {
    this.results.config = {
      configFile: config.configFile,
      rootDir: config.rootDir,
      version: config.version
    };
    this.results.stats.startTime = new Date().toISOString();
    this.suite = suite;
  }

  onTestEnd(test, result) {
    // Extraire les infos du test
    const suite = this.findOrCreateSuite(test);
    
    const testResult = {
      title: test.title,
      file: test.location.file,
      line: test.location.line,
      column: test.location.column,
      status: result.status,
      duration: result.duration,
      errors: result.errors.map(err => ({
        message: err.message,
        stack: err.stack,
        location: err.location
      })),
      attachments: result.attachments.map(att => ({
        name: att.name,
        contentType: att.contentType,
        path: att.path
      }))
    };

    suite.tests.push(testResult);

    // Mettre à jour les stats
    if (result.status === 'passed') {
      this.results.stats.expected++;
    } else if (result.status === 'failed') {
      this.results.stats.unexpected++;
    } else if (result.status === 'skipped') {
      this.results.stats.skipped++;
    } else if (result.status === 'timedOut') {
      this.results.stats.unexpected++;
    }
  }

  findOrCreateSuite(test) {
    const suitePath = test.parent.title || test.titlePath()[0] || 'default';
    let suite = this.results.suites.find(s => s.title === suitePath);
    
    if (!suite) {
      suite = {
        title: suitePath,
        file: test.location.file,
        tests: []
      };
      this.results.suites.push(suite);
    }
    
    return suite;
  }

  onEnd(result) {
    this.results.stats.duration = result.duration;
    
    // Créer le dossier de sortie
    const outputDir = path.dirname(this.outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Écrire le fichier JSON
    fs.writeFileSync(
      this.outputFile,
      JSON.stringify(this.results, null, 2),
      'utf-8'
    );
    
    console.log(`\n✅ Rapport JSON généré : ${this.outputFile}`);
    console.log(`📊 Stats : ${this.results.stats.expected} passed, ${this.results.stats.unexpected} failed, ${this.results.stats.skipped} skipped`);
  }

  onError(error) {
    this.results.errors.push({
      message: error.message,
      stack: error.stack
    });
  }
}

export default UIJsonReporter;
