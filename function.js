const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const Handlebars = require('handlebars');
const paths = require('./config/paths');
const engageOne = require('./config/engageone.config');
const template = require('./config/templates');

function normalizeRow(rawRow) {
  return Object.fromEntries(Object.entries(rawRow).map(([key, value]) => [key.replace(/[{}\s]/g, ''), value]));
}

function xml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlTag(name, value) {
  return `    <${name}>${xml(value)}</${name}>\n`;
}

function dijValue(name, value) {
  const stringValue = String(value ?? '');
  return `    <DDSDocValue name="${xml(name)}" type="text" len="${stringValue.length}">${xml(stringValue)}</DDSDocValue>\n`;
}

function getTemplateFileName(templateId) {
  const fileName = `${templateId}.html`;

  if (!template.templates.includes(fileName)) throw new Error(`Unknown template: "${templateId}"`);
  return fileName;
}

function isConfigured(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function validateConfiguration() {
  const required = [engageOne.package, engageOne.jobName, engageOne.jobShortName, engageOne.nativeFormat, engageOne.resourceGuid, engageOne.vendorId, engageOne.docTypeId];
  if (!required.every(isConfigured)) throw new Error('EngageOne fixed values are not configured. Edit config/engageone.config.js.');
}

function createGuid() {
  return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

function hash32(parts) {
  // The Precisely note says these IDs are generated from a hash but does not
  // publish the digest algorithm or input-byte serialization. MD5 is used here
  // only as a stable 32-hex-character approximation for UAT comparison.
  return crypto.createHash('md5').update(parts.join('\u001F'), 'utf8').digest('hex').toUpperCase();
}

function formatDijDateTime(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function buildSourceOffsets(rawRecords) {
  // DOC1 uses start/end byte offsets of its publication input. Excel does not
  // provide those offsets, so Node creates a stable UTF-8 publication stream
  // from the normalized rows solely for the Node-side comparison.
  let offset = 0;
  return rawRecords.map((rawRow) => {
    const sourceRecord = JSON.stringify(normalizeRow(rawRow));
    const byteLength = Buffer.byteLength(`${sourceRecord}\n`, 'utf8');
    const result = { start: offset, end: offset + byteLength - 1 };
    offset += byteLength;
    return result;
  });
}

function createIds(row, offsets) {
  if (engageOne.idStrategy === 'node') {
    // Previous Node behavior retained for comparison: document IDs are random.
    return { docMasterId: createGuid(), docInstanceId: createGuid() };
  }

  if (engageOne.idStrategy !== 'precisely-style') {
    throw new Error(`Unknown idStrategy: "${engageOne.idStrategy}"`);
  }

  return {
    // Precisely documents DocMasterID as a hash of these four inputs.
    docMasterId: hash32([offsets.start, offsets.end, row.ClientNo || '', row.StmtDate || '']),
    // Node UUID v4 is collision-resistant and fulfils the unique-document role
    // of DOC1's MAC-address-and-time DocInstanceID.
    docInstanceId: createGuid()
  };
}

function buildJobHeader(jobGuid, createdAt) {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n',
    '<!DOCTYPE eGAD SYSTEM "eGAD.Dtd">\n',
    `<eGAD package="${xml(engageOne.package)}">\n`,
    '  <jobdata>\n',
    `    <datetime>${xml(createdAt)}</datetime>\n`,
    `    <platform>${xml(engageOne.platform)}</platform>\n`,
    `    <Version major="${xml(engageOne.version.major)}" minor="${xml(engageOne.version.minor)}"/>\n`,
    `    <JobGUID>${xml(jobGuid)}</JobGUID>\n`,
    `    <JobName>${xml(engageOne.jobName)}</JobName>\n`,
    `    <JobShortName>${xml(engageOne.jobShortName)}</JobShortName>\n`,
    `    <NativeFormat>${xml(engageOne.nativeFormat)}</NativeFormat>\n`,
    `    <ResourceGUID p="1" value="${xml(engageOne.resourceGuid)}"/>\n`,
    '  </jobdata>\n'
  ].join('');
}

function buildDocument(row, documentNumber, docMasterId, docInstanceId) {
  const attachmentNames = [row.Attachment1, row.Attachment2, row.Attachment3];
  return [
    `  <document docID="${documentNumber}" docMasterID="${xml(docMasterId)}" docInstanceID="${xml(docInstanceId)}">\n`,
    xmlTag('VendorId', engageOne.vendorId), xmlTag('DocTypeId', engageOne.docTypeId), xmlTag('AccNo', row.ClientNo), xmlTag('StmtDate', row.StmtDate || ''),
    dijValue('Email', row.Email), dijValue('Subject', row.Subject), dijValue('From', row.Sender), dijValue('Reply to', row['Reply-To']),
    dijValue('AttachName1', attachmentNames[0]), dijValue('AttachName2', attachmentNames[1]), dijValue('AttachName3', attachmentNames[2]), dijValue('SenderName', row.SenderName || row.Sender),
    '    <CustData>\n', xmlTag('Name', row.Param1 || ''), '    </CustData>\n',
    '    <NumberOfPages value="1"/>\n', '    <Skipped><SPages></SPages></Skipped>\n', '  </document>\n'
  ].join('');
}

function runBatchProcessing() {
  if (!fs.existsSync(paths.inputFile)) throw new Error(`Excel file not found: ${paths.inputFile}`);
  validateConfiguration();
  fs.mkdirSync(paths.outputHtmlDir, { recursive: true });

  const workbook = XLSX.readFile(paths.inputFile);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRecords = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  const dijDateTime = formatDijDateTime(new Date());
  const sourceOffsets = buildSourceOffsets(rawRecords);
  // job GUID is batch-level, so take it once from the same batch datetime.
  const jobGuid = engageOne.idStrategy === 'node' ? createGuid() : hash32([dijDateTime]);
  let dij = buildJobHeader(jobGuid, dijDateTime);
  let successCount = 0;

  rawRecords.forEach((rawRow, index) => {
    const row = normalizeRow(rawRow);
    const sourceRecordNumber = index + 1;
    try {
      const templatePath = path.join(paths.templatesDir, getTemplateFileName(row.Template));
      if (!fs.existsSync(templatePath)) throw new Error(`Template missing: ${templatePath}`);
      const documentNumber = successCount + 1;
      const ids = createIds(row, sourceOffsets[index]);
      const docMasterId = ids.docMasterId;
      const docInstanceId = ids.docInstanceId;
      const outputHtmlName = `${docInstanceId}_${row.Template}.html`;
      const template = Handlebars.compile(fs.readFileSync(templatePath, 'utf8'));
      fs.writeFileSync(path.join(paths.outputHtmlDir, outputHtmlName), template({ ...row, docInstanceId }), 'utf8');
      dij += buildDocument(row, documentNumber, docMasterId, docInstanceId);
      successCount += 1;
      console.log(`[SUCCESS] Source record ${sourceRecordNumber}, DIJ document ${documentNumber}: ${outputHtmlName}`);
    } catch (error) {
      console.error(`[SKIP] Source record ${sourceRecordNumber}: ${error.message}`);
    }
  });
  dij += '</eGAD>\n';
  fs.writeFileSync(paths.outputDijFile, dij, 'utf8');
  return { totalRecords: rawRecords.length, successCount, dijPath: paths.outputDijFile };
}

module.exports = {
  runBatchProcessing,
  normalizeRow,
  xml,
  createGuid,
  hash32,
  formatDijDateTime,
  buildSourceOffsets,
  createIds,
  buildDocument
};
