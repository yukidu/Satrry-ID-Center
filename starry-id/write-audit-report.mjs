const values = process.argv.slice(2).map(Number);
const [
  total, missingId, missingName, missingEmail, missingGoogleSubject,
  duplicateEmailGroups, duplicateGoogleSubjectGroups,
  hasSponsor, hasPlatinumUpline, hasDiamondUpline, targetUsers
] = values;

const report = {
  generatedAt: new Date().toISOString(),
  source: 'echoes_db.users',
  target: 'starry_id_db',
  containsPII: false,
  sourceCounts: {
    total,
    missingId,
    missingName,
    missingEmail,
    missingGoogleSubject,
    duplicateEmailGroups,
    duplicateGoogleSubjectGroups,
    hasSponsor,
    hasPlatinumUpline,
    hasDiamondUpline
  },
  targetCounts: { users: targetUsers },
  migrationExecuted: false
};

process.stdout.write(JSON.stringify(report, null, 2));
