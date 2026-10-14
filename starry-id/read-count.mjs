import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('Missing JSON file path');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const parts = Array.isArray(raw) ? raw : (raw.result || []);
const rows = parts.flatMap(item => item?.results || []);
process.stdout.write(String(rows[0]?.value ?? 0));
