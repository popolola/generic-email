const crypto = require('crypto');

function normalizeRow(rawRow = {}) {
  return Object.fromEntries(
    Object.entries(rawRow).map(([key, value]) => [key.replace(/[{}\s]/g, ''), value])
  );
}

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlTag(name, value) {
  return `    <${name}>${xml(value)}</${name}>\n`;
}

function dijValue(name, value) {
  const stringValue = String(value ?? '');
  return `    <DDSDocValue name="${xml(name)}" type="text" len="${stringValue.length}">${xml(stringValue)}</DDSDocValue>\n`;
}

function createGuid() {
  return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

function hash32(parts) {
  return crypto.createHash('md5').update(parts.join('\u001F'), 'utf8').digest('hex').toUpperCase();
}

function formatDijDateTime(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function buildSourceOffsets(rawRecords) {
  let offset = 0;
  return rawRecords.map((rawRow) => {
    const sourceRecord = JSON.stringify(normalizeRow(rawRow));
    const byteLength = Buffer.byteLength(`${sourceRecord}\n`, 'utf8');
    const result = { start: offset, end: offset + byteLength - 1 };
    offset += byteLength;
    return result;
  });
}

function buildJobHeader(jobGuid, createdAt, engageOne) {
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

function buildDocument(row, documentNumber, docMasterId, docInstanceId, engageOne) {
  const attachmentNames = [row.Attachment1, row.Attachment2, row.Attachment3];
  return [
    `  <document docID="${documentNumber}" docMasterID="${xml(docMasterId)}" docInstanceID="${xml(docInstanceId)}">\n`,
    xmlTag('VendorId', engageOne.vendorId),
    xmlTag('DocTypeId', engageOne.docTypeId),
    xmlTag('AccNo', row.ClientNo),
    xmlTag('StmtDate', row.StmtDate || ''),
    dijValue('Email', row.Email),
    dijValue('Subject', row.Subject),
    dijValue('From', row.Sender),
    dijValue('Reply to', row['Reply-To']),
    dijValue('AttachName1', attachmentNames[0]),
    dijValue('AttachName2', attachmentNames[1]),
    dijValue('AttachName3', attachmentNames[2]),
    dijValue('SenderName', row.SenderName || row.Sender),
    '    <CustData>\n',
    xmlTag('Name', row.Param1 || ''),
    '    </CustData>\n',
    '    <NumberOfPages value="1"/>\n',
    '    <Skipped><SPages></SPages></Skipped>\n',
    '  </document>\n'
  ].join('');
}

function getTemplateFileName(templateId, templateConfig) {
  const fileName = `${templateId}.html`;
  if (!templateConfig.templates.includes(fileName)) {
    throw new Error(`Unknown template: "${templateId}"`);
  }
  return fileName;
}

function isConfigured(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function validateConfiguration(engageOne) {
  const required = [
    engageOne.package,
    engageOne.jobName,
    engageOne.jobShortName,
    engageOne.nativeFormat,
    engageOne.resourceGuid,
    engageOne.vendorId,
    engageOne.docTypeId
  ];

  if (!required.every(isConfigured)) {
    throw new Error('EngageOne fixed values are not configured. Edit src/config/engageone.config.js.');
  }
}

function createIds(row, offsets, engageOne) {
  if (engageOne.idStrategy === 'node') {
    return { docMasterId: createGuid(), docInstanceId: createGuid() };
  }

  if (engageOne.idStrategy !== 'precisely-style') {
    throw new Error(`Unknown idStrategy: "${engageOne.idStrategy}"`);
  }

  return {
    docMasterId: hash32([offsets.start, offsets.end, row.ClientNo || '', row.StmtDate || '']),
    docInstanceId: createGuid()
  };
}

module.exports = {
  normalizeRow,
  xml,
  xmlTag,
  dijValue,
  createGuid,
  hash32,
  formatDijDateTime,
  buildSourceOffsets,
  createIds,
  buildJobHeader,
  buildDocument,
  getTemplateFileName,
  validateConfiguration
};
