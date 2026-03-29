const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'src', 'data', 'helpChangelog.ts');

if (!fs.existsSync(pkgPath) || !fs.existsSync(changelogPath)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = String(pkg.version || '').trim();
if (!version) process.exit(0);

let content = fs.readFileSync(changelogPath, 'utf8');
if (content.includes(`version: '${version}'`)) {
  console.log(`[help:sync] version ${version} ya existe`);
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const entry = `  {\n    version: '${version}',\n    date: '${today}',\n    changes: [\n      'Resumen breve de cambios de la version ${version}.',\n    ],\n  },\n`;

const markerRegex = /export const HELP_CHANGELOG: HelpChangelogItem\[] = \[(\r?\n)/;
const markerMatch = content.match(markerRegex);
if (!markerMatch) {
  console.log('[help:sync] estructura no reconocida');
  process.exit(0);
}

const eol = markerMatch[1] || '\n';
const entryWithEol = entry.replace(/\n/g, eol);
content = content.replace(markerRegex, `export const HELP_CHANGELOG: HelpChangelogItem[] = [${eol}${entryWithEol}`);
fs.writeFileSync(changelogPath, content, 'utf8');
console.log(`[help:sync] entrada creada para v${version}`);
