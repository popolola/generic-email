const { runBatchProcessing } = require('./src/controllers/emailController');

try {
  const result = runBatchProcessing();
  console.log(`\nComplete: ${result.successCount}/${result.totalRecords} HTML documents generated.`);
  console.log(`DIJ: ${result.dijPath}`);
} catch (error) {
  console.error(`\n[CRITICAL FAILURE] ${error.message}`);
  process.exitCode = 1;
}
