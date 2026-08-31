const fs = require('fs');
const path = require('path');

function renderHtml(templateContent, row, docInstanceId) {
  const Handlebars = require('handlebars');
  const template = Handlebars.compile(templateContent);
  return template({ ...row, docInstanceId });
}

function writeHtmlFile(outputDir, fileName, content) {
  fs.mkdirSync(outputDir, { recursive: true });
  const targetPath = path.join(outputDir, fileName);
  fs.writeFileSync(targetPath, content, 'utf8');
  return targetPath;
}

function writeDijFile(outputPath, content) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
  return outputPath;
}

module.exports = {
  renderHtml,
  writeHtmlFile,
  writeDijFile
};
