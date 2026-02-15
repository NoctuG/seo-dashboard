import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('src/i18n.ts');
const source = fs.readFileSync(filePath, 'utf8');
const match = source.match(/const resources = (\{[\s\S]*?\n\});\n\ni18n\.use/);
if (!match) {
  console.error('Unable to locate i18n resources object.');
  process.exit(1);
}

const resources = Function(`"use strict"; return (${match[1]});`)();

const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => {
  const key = prefix ? `${prefix}.${k}` : k;
  return v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, key) : [key];
});

const enKeys = new Set(flatten(resources['en-US'].translation));
const zhKeys = new Set(flatten(resources['zh-CN'].translation));

const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key));
const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key));

if (missingInZh.length || missingInEn.length) {
  console.error('i18n key mismatch detected.');
  if (missingInZh.length) {
    console.error('Missing in zh-CN:');
    missingInZh.forEach((key) => console.error(`  - ${key}`));
  }
  if (missingInEn.length) {
    console.error('Missing in en-US:');
    missingInEn.forEach((key) => console.error(`  - ${key}`));
  }
  process.exit(1);
}

console.log(`i18n keys aligned: ${enKeys.size} keys.`);
