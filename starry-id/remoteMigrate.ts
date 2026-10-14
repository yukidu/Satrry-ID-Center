import { mapEchoStarsMember } from './migrateFromEchoStars';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const sourceDbId = String(process.env.ECHOSTARS_D1_ID || 'e0a696a9-0233-4186-be4d-229435b19a27').trim();
const targetDbId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();

if (!accountId || !apiToken) throw new Error('Cloudflare credentials are required');

type Statement = { sql: string; params?: string[] };

type ApiResult = { success?: boolean; results?: any[] };

async function requestD1(databaseId: string, body: { sql: string; params?: string[] } | { batch: Statement[] }): Promise<ApiResult[]> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result)) {
    throw new Error(`D1 API request failed (${response.status})`);
  }
  if (payload.result.some((item: ApiResult) => item?.success === false)) {
    throw new Error('D1 statement failed');
  }
  return payload.result as ApiResult[];
}

async function query(databaseId: string, sql: string, params: string[] = []) {
  const result = await requestD1(databaseId, { sql, params });
  return result[0]?.results || [];
}

async function batch(databaseId: string, statements: Statement[]) {
  await requestD1(databaseId, { batch: statements });
}

const text = (value: unknown) => value == null ? '' : String(value).trim();
const lower = (value: unknown) => text(value).toLowerCase();
const int = (value: unknown) => value ? '1' : '0';
const num = (value: unknown) => value == null || value === '' ? '' : String(Number(value));
const str = (value: unknown) => value == null ? '' : String(value);

function memberStatements(row: any, batchId: string, now: number): Statement[] {
  const mapped = mapEchoStarsMember(row, now);
  const p = mapped.profile;
  const a = mapped.appMembership;
  const statements: Statement[] = [
    {
      sql: `INSERT INTO users (id, primaryEmail, status, createdAt, updatedAt)
        VALUES (?, ?, 'active', ?, ?)
        ON CONFLICT(id) DO UPDATE SET primaryEmail=excluded.primaryEmail, updatedAt=excluded.updatedAt`,
      params: [mapped.id, mapped.email, String(p.createdAt), String(now)]
    },
    {
      sql: `INSERT INTO profiles (
        userId, name, avatar, googleAvatar, amwayId, phone, residence, center,
        rank, approvedRank, rankApproved, rankAuditStatus, rankAuditType, rankUpdatedAt,
        joinReason, stayReason, birthday, motto, zodiac, talentNumber, lifeNumber,
        registerDate, auditedBy, auditedAt, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULLIF(?,''),NULLIF(?,''),?,?,?,?,?)
      ON CONFLICT(userId) DO UPDATE SET
        name=excluded.name, avatar=excluded.avatar, googleAvatar=excluded.googleAvatar,
        amwayId=excluded.amwayId, phone=excluded.phone, residence=excluded.residence,
        center=excluded.center, rank=excluded.rank, approvedRank=excluded.approvedRank,
        rankApproved=excluded.rankApproved, rankAuditStatus=excluded.rankAuditStatus,
        rankAuditType=excluded.rankAuditType, rankUpdatedAt=excluded.rankUpdatedAt,
        joinReason=excluded.joinReason, stayReason=excluded.stayReason, birthday=excluded.birthday,
        motto=excluded.motto, zodiac=excluded.zodiac, talentNumber=excluded.talentNumber,
        lifeNumber=excluded.lifeNumber, registerDate=excluded.registerDate,
        auditedBy=excluded.auditedBy, auditedAt=excluded.auditedAt, updatedAt=excluded.updatedAt`,
      params: [
        mapped.id, p.name, p.avatar, p.googleAvatar, p.amwayId, p.phone, p.residence, p.center,
        p.rank, p.approvedRank, String(p.rankApproved), p.rankAuditStatus, p.rankAuditType, p.rankUpdatedAt,
        p.joinReason, p.stayReason, p.birthday, p.motto, p.zodiac, num(p.talentNumber), num(p.lifeNumber),
        p.registerDate, p.auditedBy, p.auditedAt, String(p.createdAt), String(now)
      ]
    },
    {
      sql: `INSERT INTO app_memberships (
        userId, appId, status, role, isAdminUser, isContributor, canUpload, joinedAt, updatedAt
      ) VALUES (?, 'echostars', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId, appId) DO UPDATE SET
        status=excluded.status, role=excluded.role, isAdminUser=excluded.isAdminUser,
        isContributor=excluded.isContributor, canUpload=excluded.canUpload, updatedAt=excluded.updatedAt`,
      params: [mapped.id, a.status, a.role, String(a.isAdminUser), String(a.isContributor), String(a.canUpload), String(a.joinedAt), String(now)]
    },
    {
      sql: `INSERT INTO legacy_links (sourceApp, sourceUserId, userId, sourceEmail, importedAt)
        VALUES ('echostars', ?, ?, ?, ?)
        ON CONFLICT(sourceApp, sourceUserId) DO UPDATE SET
          userId=excluded.userId, sourceEmail=excluded.sourceEmail, importedAt=excluded.importedAt`,
      params: [mapped.id, mapped.id, mapped.email, String(now)]
    }
  ];

  if (mapped.googleSubject) {
    statements.splice(1, 0, {
      sql: `INSERT INTO identities (provider, providerSubject, userId, providerEmail, emailVerified, createdAt, lastSeenAt)
        VALUES ('google', ?, ?, ?, 1, ?, ?)
        ON CONFLICT(provider, providerSubject) DO UPDATE SET
          userId=excluded.userId, providerEmail=excluded.providerEmail, emailVerified=1, lastSeenAt=excluded.lastSeenAt`,
      params: [mapped.googleSubject, mapped.id, mapped.email, String(p.createdAt), String(now)]
    });
  }

  for (const [relationType, legacyLabel] of mapped.relationships) {
    statements.push({
      sql: `INSERT INTO member_relationships (userId, relationType, relatedUserId, legacyLabel, resolutionStatus, updatedAt)
        VALUES (?, ?, NULL, ?, 'unresolved', ?)
        ON CONFLICT(userId, relationType) DO UPDATE SET
          legacyLabel=excluded.legacyLabel, updatedAt=excluded.updatedAt`,
      params: [mapped.id, relationType, legacyLabel, String(now)]
    });
  }

  statements.push({
    sql: `UPDATE migration_batches SET migratedCount = migratedCount + 1 WHERE id = ?`,
    params: [batchId]
  });
  return statements;
}

function sourceDuplicateCount(rows: any[], selector: (row: any) => string) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const value = selector(row);
    if (value) seen.set(value, (seen.get(value) || 0) + 1);
  }
  return [...seen.values()].filter(count => count > 1).length;
}

async function main() {
  const startedAt = Date.now();
  const migrationBatchId = crypto.randomUUID();
  const source = await query(sourceDbId, 'SELECT * FROM users ORDER BY id');
  if (!source.length) throw new Error('Source member table is empty');

  const missingId = source.filter(row => !text(row.id)).length;
  const missingEmail = source.filter(row => !lower(row.email)).length;
  const duplicateEmails = sourceDuplicateCount(source, row => lower(row.email));
  const duplicateSubjects = sourceDuplicateCount(source, row => text(row.googleSubject));
  if (missingId || missingEmail || duplicateEmails || duplicateSubjects) {
    throw new Error('Source identity preflight failed');
  }

  const [targetUsers, targetIdentities] = await Promise.all([
    query(targetDbId, 'SELECT id, primaryEmail FROM users'),
    query(targetDbId, "SELECT userId, providerSubject FROM identities WHERE provider='google'")
  ]);
  const targetByEmail = new Map(targetUsers.map((row: any) => [lower(row.primaryEmail), text(row.id)]));
  const targetBySubject = new Map(targetIdentities.map((row: any) => [text(row.providerSubject), text(row.userId)]));

  await query(targetDbId, `INSERT INTO migration_batches
    (id, sourceApp, status, startedAt, scannedCount, migratedCount, skippedCount, issueCount)
    VALUES (?, 'echostars', 'running', ?, ?, 0, 0, 0)`,
    [migrationBatchId, String(startedAt), String(source.length)]);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of source) {
    const mapped = mapEchoStarsMember(row);
    const emailOwner = targetByEmail.get(mapped.email);
    const subjectOwner = mapped.googleSubject ? targetBySubject.get(mapped.googleSubject) : '';
    if ((emailOwner && emailOwner !== mapped.id) || (subjectOwner && subjectOwner !== mapped.id)) {
      skipped += 1;
      await query(targetDbId, `UPDATE migration_batches SET skippedCount=skippedCount+1, issueCount=issueCount+1 WHERE id=?`, [migrationBatchId]);
      await query(targetDbId, `INSERT INTO migration_issues
        (id, batchId, sourceApp, sourceUserId, issueType, details, createdAt)
        VALUES (?, ?, 'echostars', ?, 'identity_conflict', 'Existing central identity belongs to another user', ?)`,
        [crypto.randomUUID(), migrationBatchId, mapped.id, String(Date.now())]);
      continue;
    }
    try {
      await batch(targetDbId, memberStatements(row, migrationBatchId, Date.now()));
      migrated += 1;
      targetByEmail.set(mapped.email, mapped.id);
      if (mapped.googleSubject) targetBySubject.set(mapped.googleSubject, mapped.id);
    } catch {
      failed += 1;
      await query(targetDbId, `UPDATE migration_batches SET skippedCount=skippedCount+1, issueCount=issueCount+1 WHERE id=?`, [migrationBatchId]);
      await query(targetDbId, `INSERT INTO migration_issues
        (id, batchId, sourceApp, sourceUserId, issueType, details, createdAt)
        VALUES (?, ?, 'echostars', ?, 'row_error', 'Member transaction failed; no PII logged', ?)`,
        [crypto.randomUUID(), migrationBatchId, mapped.id, String(Date.now())]);
    }
  }

  const finishedAt = Date.now();
  await query(targetDbId, `UPDATE migration_batches SET status=?, completedAt=?, scannedCount=?, migratedCount=?, skippedCount=?, issueCount=? WHERE id=?`, [
    failed ? 'completed_with_issues' : 'completed', String(finishedAt), String(source.length), String(migrated), String(skipped + failed), String(skipped + failed), migrationBatchId
  ]);

  const target = await query(targetDbId, `SELECT
      u.id, u.primaryEmail, i.providerSubject,
      p.name, p.avatar, p.googleAvatar, p.amwayId, p.phone, p.residence, p.center,
      p.rank, p.approvedRank, p.rankApproved, p.rankAuditStatus, p.rankAuditType, p.rankUpdatedAt,
      p.joinReason, p.stayReason, p.birthday, p.motto, p.zodiac, p.talentNumber, p.lifeNumber,
      p.registerDate, p.auditedBy, p.auditedAt,
      a.status AS appStatus, a.role, a.isAdminUser, a.isContributor, a.canUpload
    FROM users u
    LEFT JOIN identities i ON i.userId=u.id AND i.provider='google'
    JOIN profiles p ON p.userId=u.id
    JOIN app_memberships a ON a.userId=u.id AND a.appId='echostars'`);
  const targetMap = new Map(target.map((row: any) => [text(row.id), row]));

  let mismatches = 0;
  for (const row of source) {
    const mapped = mapEchoStarsMember(row);
    const saved: any = targetMap.get(mapped.id);
    if (!saved) { mismatches += 1; continue; }
    const expected: Record<string, string> = {
      primaryEmail: mapped.email,
      providerSubject: mapped.googleSubject,
      name: mapped.profile.name,
      avatar: mapped.profile.avatar,
      googleAvatar: mapped.profile.googleAvatar,
      amwayId: mapped.profile.amwayId,
      phone: mapped.profile.phone,
      residence: mapped.profile.residence,
      center: mapped.profile.center,
      rank: mapped.profile.rank,
      approvedRank: mapped.profile.approvedRank,
      rankApproved: String(mapped.profile.rankApproved),
      rankAuditStatus: mapped.profile.rankAuditStatus,
      rankAuditType: mapped.profile.rankAuditType,
      rankUpdatedAt: mapped.profile.rankUpdatedAt,
      joinReason: mapped.profile.joinReason,
      stayReason: mapped.profile.stayReason,
      birthday: mapped.profile.birthday,
      motto: mapped.profile.motto,
      zodiac: mapped.profile.zodiac,
      talentNumber: num(mapped.profile.talentNumber),
      lifeNumber: num(mapped.profile.lifeNumber),
      registerDate: mapped.profile.registerDate,
      auditedBy: mapped.profile.auditedBy,
      auditedAt: mapped.profile.auditedAt,
      appStatus: mapped.appMembership.status,
      role: mapped.appMembership.role,
      isAdminUser: String(mapped.appMembership.isAdminUser),
      isContributor: String(mapped.appMembership.isContributor),
      canUpload: String(mapped.appMembership.canUpload)
    };
    if (Object.entries(expected).some(([key, value]) => str(saved[key]) !== value)) mismatches += 1;
  }

  const counts = (await query(targetDbId, `SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM identities WHERE provider='google') AS googleIdentities,
    (SELECT COUNT(*) FROM profiles) AS profiles,
    (SELECT COUNT(*) FROM app_memberships WHERE appId='echostars') AS echostarsMemberships,
    (SELECT COUNT(*) FROM legacy_links WHERE sourceApp='echostars') AS legacyLinks`))[0] || {};

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'echoes_db.users',
    target: 'starry_id_db',
    containsPII: false,
    sourcePreserved: true,
    migrationExecuted: true,
    batchId: migrationBatchId,
    sourceTotal: source.length,
    migratedThisRun: migrated,
    skippedConflicts: skipped,
    failedRows: failed,
    pendingGoogleIdentity: source.filter(row => !text(row.googleSubject)).length,
    verificationMismatches: mismatches,
    targetCounts: {
      users: Number(counts.users || 0),
      googleIdentities: Number(counts.googleIdentities || 0),
      profiles: Number(counts.profiles || 0),
      echostarsMemberships: Number(counts.echostarsMemberships || 0),
      legacyLinks: Number(counts.legacyLinks || 0)
    }
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed || skipped || mismatches) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Starry ID migration failed: ${String((error as Error)?.message || error)}`);
  process.exit(1);
});
