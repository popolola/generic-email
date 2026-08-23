const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(ROOT_DIR, 'output', 'node-generated');

module.exports = {
  root: ROOT_DIR,
  inputFile: process.env.INPUT_FILE || path.join(ROOT_DIR, 'input', 'data.xlsx'),
  templatesDir: path.join(ROOT_DIR, 'templates'),
  outputDir: OUTPUT_DIR,
  outputHtmlDir: path.join(OUTPUT_DIR, 'html'),
  outputDijFile: path.join(OUTPUT_DIR, 'campaign_journal.dij_1')
};
