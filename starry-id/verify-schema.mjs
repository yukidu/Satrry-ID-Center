import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('Missing JSON file path');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const parts = Array.isArray(raw) ? raw : (raw.result || []);
const rows = parts.flatMap(item => item?.results || []);
const names = new Set(rows.map(row => row.name));
const required = [
  'users', 'identities', 'profiles', 'member_relationships', 'app_memberships',
  'auth_sessions', 'public_cards', 'profile_field_visibility', 'profile_option_values', 'legacy_links',
  'profile_audit_logs', 'migration_batches', 'migration_issues',
  'profile_field_schema', 'profile_extension_values', 'profile_schema_meta'
];
const missing = required.filter(name => !names.has(name));
if (missing.length) throw new Error(`Central schema missing tables: ${missing.join(', ')}`);
console.log(`Central schema verified (${required.length} required tables).`);
