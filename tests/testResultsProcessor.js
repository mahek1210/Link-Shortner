// tests/testResultsProcessor.js - Custom test results processor
const fs = require('fs');
const path = require('path');

module.exports = (results) => {
  // Generate test summary
  const summary = {
    timestamp: new Date().toISOString(),
    totalTests: results.numTotalTests,
    passedTests: results.numPassedTests,
    failedTests: results.numFailedTests,
    pendingTests: results.numPendingTests,
    testSuites: results.numTotalTestSuites,
    passedTestSuites: results.numPassedTestSuites,
    failedTestSuites: results.numFailedTestSuites,
    coverage: results.coverageMap ? {
      statements: results.coverageMap.getCoverageSummary().statements.pct,
      branches: results.coverageMap.getCoverageSummary().branches.pct,
      functions: results.coverageMap.getCoverageSummary().functions.pct,
      lines: results.coverageMap.getCoverageSummary().lines.pct
    } : null,
    testResults: results.testResults.map(testResult => ({
      testFilePath: path.relative(process.cwd(), testResult.testFilePath),
      numPassingTests: testResult.numPassingTests,
      numFailingTests: testResult.numFailingTests,
      numPendingTests: testResult.numPendingTests,
      duration: testResult.perfStats.end - testResult.perfStats.start,
      failureMessage: testResult.failureMessage
    }))
  };

  // Write summary to file
  const summaryPath = path.join(process.cwd(), 'test-results-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  // Generate HTML report if tests failed
  if (results.numFailedTests > 0) {
    generateHtmlReport(summary);
  }

  // Log summary to console
  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Passed: ${results.numPassedTests}`);
  console.log(`❌ Failed: ${results.numFailedTests}`);
  console.log(`⏳ Pending: ${results.numPendingTests}`);
  console.log(`📁 Test Suites: ${results.numPassedTestSuites}/${results.numTotalTestSuites}`);
  
  if (summary.coverage) {
    console.log('\n📈 Coverage Summary:');
    console.log(`Statements: ${summary.coverage.statements.toFixed(2)}%`);
    console.log(`Branches: ${summary.coverage.branches.toFixed(2)}%`);
    console.log(`Functions: ${summary.coverage.functions.toFixed(2)}%`);
    console.log(`Lines: ${summary.coverage.lines.toFixed(2)}%`);
  }

  return results;
};

function generateHtmlReport(summary) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Results Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat-card { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; flex: 1; }
        .passed { border-left: 4px solid #28a745; }
        .failed { border-left: 4px solid #dc3545; }
        .pending { border-left: 4px solid #ffc107; }
        .coverage { border-left: 4px solid #17a2b8; }
        .test-file { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 3px; }
        .failure { color: #dc3545; font-family: monospace; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Results Report</h1>
        <p>Generated: ${summary.timestamp}</p>
    </div>

    <div class="stats">
        <div class="stat-card passed">
            <h3>Passed Tests</h3>
            <div style="font-size: 2em; font-weight: bold;">${summary.passedTests}</div>
        </div>
        <div class="stat-card failed">
            <h3>Failed Tests</h3>
            <div style="font-size: 2em; font-weight: bold;">${summary.failedTests}</div>
        </div>
        <div class="stat-card pending">
            <h3>Pending Tests</h3>
            <div style="font-size: 2em; font-weight: bold;">${summary.pendingTests}</div>
        </div>
        ${summary.coverage ? `
        <div class="stat-card coverage">
            <h3>Coverage</h3>
            <div>Lines: ${summary.coverage.lines.toFixed(1)}%</div>
            <div>Functions: ${summary.coverage.functions.toFixed(1)}%</div>
            <div>Branches: ${summary.coverage.branches.toFixed(1)}%</div>
        </div>
        ` : ''}
    </div>

    <h2>Test Files</h2>
    ${summary.testResults.map(testResult => `
        <div class="test-file">
            <h4>${testResult.testFilePath}</h4>
            <p>
                ✅ ${testResult.numPassingTests} passed, 
                ❌ ${testResult.numFailingTests} failed, 
                ⏳ ${testResult.numPendingTests} pending
                (${testResult.duration}ms)
            </p>
            ${testResult.failureMessage ? `
                <div class="failure">${testResult.failureMessage}</div>
            ` : ''}
        </div>
    `).join('')}
</body>
</html>
  `;

  const reportPath = path.join(process.cwd(), 'test-results-report.html');
  fs.writeFileSync(reportPath, html);
  console.log(`\n📄 HTML report generated: ${reportPath}`);
}
