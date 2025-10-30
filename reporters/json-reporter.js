class JsonReporter {
  constructor(options = {}) {
    this.options = {
      outputFile: 'test-results/results.json',
      ...options
    };
    this.results = [];
  }

  onTestBegin(test) {
    this.currentTest = {
      title: test.title,
      suite: test.parent?.title || 'default',
      file: test.location.file,
      startTime: new Date().toISOString(),
      status: 'running',
      steps: []
    };
  }

  onStepBegin(test, result, step) {
    if (step.category === 'test.step') {
      this.currentTest.steps.push({
        title: step.title,
        startTime: new Date().toISOString(),
        status: 'running'
      });
    }
  }

  onStepEnd(test, result, step) {
    if (step.category === 'test.step') {
      const currentStep = this.currentTest.steps.find(s => s.title === step.title);
      if (currentStep) {
        currentStep.endTime = new Date().toISOString();
        currentStep.duration = new Date(currentStep.endTime) - new Date(currentStep.startTime);
        currentStep.status = step.error ? 'failed' : 'passed';
        if (step.error) {
          currentStep.error = {
            message: step.error.message,
            stack: step.error.stack
          };
        }
      }
    }
  }

  onTestEnd(test, result) {
    this.currentTest.status = result.status;
    this.currentTest.duration = result.duration;
    this.currentTest.endTime = new Date().toISOString();
    
    if (result.error) {
      this.currentTest.error = {
        message: result.error.message,
        stack: result.error.stack
      };
    }

    this.results.push(this.currentTest);
  }

  onEnd(result) {
    const fs = require('fs');
    const path = require('path');
    
    // Créer le dossier de sortie
    const outputDir = path.dirname(this.options.outputFile);
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Calculer les statistiques
    const stats = this.calculateStats();
    
    // Sauvegarder les résultats
    const output = {
      timestamp: new Date().toISOString(),
      stats,
      results: this.results
    };
    
    fs.writeFileSync(
      this.options.outputFile,
      JSON.stringify(output, null, 2)
    );
  }

  calculateStats() {
    const stats = {
      total: this.results.length,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      duration: 0
    };

    this.results.forEach(test => {
      stats.duration += test.duration;
      
      if (test.retry > 0 && test.status === 'passed') {
        stats.flaky++;
      } else if (test.status === 'passed') {
        stats.passed++;
      } else if (test.status === 'failed') {
        stats.failed++;
      } else if (test.status === 'skipped') {
        stats.skipped++;
      }
    });

    return {
      ...stats,
      duration: `${Math.round(stats.duration / 1000)}s`,
      passRate: stats.total > 0 ? `${Math.round((stats.passed / stats.total) * 100)}%` : '0%'
    };
  }
}

module.exports = JsonReporter;
