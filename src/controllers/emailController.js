const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const paths = require('../config/paths');
const engageOne = require('../config/engageone.config');
const templateConfig = require('../config/templates');
const {
  normalizeRow,
  formatDijDateTime,
  buildSourceOffsets,
  createIds,
  buildJobHeader,
  buildDocument,
  getTemplateFileName,
  validateConfiguration
} = require('../models/emailModel');
const { renderHtml, writeHtmlFile, writeDijFile } = require('../views/emailView');

function runBatchProcessing() {
  if (!fs.existsSync(paths.inputFile)) {
    throw new Error(`Excel file not found: ${paths.inputFile}`);
  }

  validateConfiguration(engageOne);

  const workbook = XLSX.readFile(paths.inputFile);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRecords = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  const dijDateTime = formatDijDateTime(new Date());
  const sourceOffsets = buildSourceOffsets(rawRecords);
  const jobGuid = engageOne.idStrategy === 'node'
    ? require('../models/emailModel').createGuid()
    : require('../models/emailModel').hash32([dijDateTime]);

  let dij = buildJobHeader(jobGuid, dijDateTime, engageOne);
  let successCount = 0;

  rawRecords.forEach((rawRow, index) => {
    const row = normalizeRow(rawRow);
    const sourceRecordNumber = index + 1;

    try {
      const templatePath = path.join(paths.templatesDir, getTemplateFileName(row.Template, templateConfig));
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template missing: ${templatePath}`);
      }

      const documentNumber = successCount + 1;
      const ids = createIds(row, sourceOffsets[index], engageOne);
      const docMasterId = ids.docMasterId;
      const docInstanceId = ids.docInstanceId;
      const outputHtmlName = `${docInstanceId}_${row.Template}.html`;

      const templateContent = fs.readFileSync(templatePath, 'utf8');
      const htmlOutput = renderHtml(templateContent, row, docInstanceId);
      writeHtmlFile(paths.outputHtmlDir, outputHtmlName, htmlOutput);

      dij += buildDocument(row, documentNumber, docMasterId, docInstanceId, engageOne);
      successCount += 1;
      console.log(`[SUCCESS] Source record ${sourceRecordNumber}, DIJ document ${documentNumber}: ${outputHtmlName}`);
    } catch (error) {
      console.error(`[SKIP] Source record ${sourceRecordNumber}: ${error.message}`);
    }
  });

  dij += '</eGAD>\n';
  writeDijFile(paths.outputDijFile, dij);

  return {
    totalRecords: rawRecords.length,
    successCount,
    dijPath: paths.outputDijFile
  };
}

module.exports = {
  runBatchProcessing
};
