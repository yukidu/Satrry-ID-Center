export type D1Like = {
  prepare(sql: string): {
    bind(...values: any[]): any;
    all(): Promise<{ results?: any[] }>;
    first(): Promise<any>;
    run(): Promise<any>;
  };
};

export type MigrationStats = {
  batchId: string;
  scannedCount: number;
  migratedCount: number;
  skippedCount: number;
  issueCount: number;
};

const SOURCE_APP = 'echostars';

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function normalizeEmail(value: unknown) {
  return text(value).toLowerCase();
}

function boolInt(value: unknown) {
  return value ? 1 : 0;
}

function millis(value: unknown, fallback: number) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function birthday(row: any) {
  return text(row.birthday) || text(row.birthDate);
}

export function mapEchoStarsMember(row: any, now = Date.now()) {
  const id = text(row.id);
  const email = normalizeEmail(row.email);
  return {
    id,
    email,
    googleSubject: text(row.googleSubject),
    profile: {
      name: text(row.name),
      avatar: text(row.avatar),
      googleAvatar: text(row.googleAvatar),
      amwayId: text(row.amwayId),
      phone: text(row.phone),
      residence: text(row.residence),
      center: text(row.center),
      rank: text(row.rank),
      approvedRank: text(row.approvedRank),
      rankApproved: boolInt(row.rankApproved),
      rankAuditStatus: text(row.rankAuditStatus),
      rankAuditType: text(row.rankAuditType),
      rankUpdatedAt: text(row.rankUpdatedAt),
      joinReason: text(row.joinReason),
      stayReason: text(row.stayReason),
      birthday: birthday(row),
      motto: text(row.motto),
      zodiac: text(row.zodiac),
      talentNumber: row.talentNumber == null || row.talentNumber === '' ? null : Number(row.talentNumber),
      lifeNumber: row.lifeNumber == null || row.lifeNumber === '' ? null : Number(row.lifeNumber),
      registerDate: text(row.registerDate),
      auditedBy: text(row.auditedBy),
      auditedAt: text(row.auditedAt),
      createdAt: millis(row.registerDate, now),
      updatedAt: now
    },
    appMembership: {
      status: row.isBlocked ? 'blocked' : 'active',
      role: text(row.role),
      isAdminUser: boolInt(row.isAdminUser),
      isContributor: boolInt(row.isContributor),
      canUpload: boolInt(row.canUpload || row.isContributor),
      joinedAt: millis(row.registerDate, now),
      updatedAt: now
    },
    relationships: [
      ['sponsor', text(row.sponsor)],
      ['platinum_upline', text(row.platinumUpline)],
      ['diamond_upline', text(row.diamondUpline)]
    ].filter(([, label]) => Boolean(label)) as Array<[string, string]>
  };
}

async function recordIssue(targetDb: D1Like, batchId: string, sourceUserId: string, issueType: string, details: string) {
  await targetDb.prepare(`
    INSERT INTO migration_issues (id, batchId, sourceApp, sourceUserId, issueType, details, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), batchId, SOURCE_APP, sourceUserId || null, issueType, details, Date.now()).run();
}

export async function auditEchoStarsMembers(sourceDb: D1Like) {
  const { results = [] } = await sourceDb.prepare('SELECT * FROM users ORDER BY id').all();
  const emailOwners = new Map<string, string[]>();
  const subjectOwners = new Map<string, string[]>();
  const nameOwners = new Map<string, string[]>();
  const missingId: string[] = [];
  const missingEmail: string[] = [];
  const missingGoogleSubject: string[] = [];

  for (const row of results) {
    const id = text(row.id);
    const email = normalizeEmail(row.email);
    const subject = text(row.googleSubject);
    const name = text(row.name);
    if (!id) missingId.push(email || '(unknown)');
    if (!email) missingEmail.push(id || '(unknown)');
    if (!subject) missingGoogleSubject.push(id || email || '(unknown)');
    if (email) emailOwners.set(email, [...(emailOwners.get(email) || []), id]);
    if (subject) subjectOwners.set(subject, [...(subjectOwners.get(subject) || []), id]);
    if (name) nameOwners.set(name, [...(nameOwners.get(name) || []), id]);
  }

  const duplicates = (map: Map<string, string[]>) =>
    [...map.entries()].filter(([, ids]) => ids.length > 1).map(([value, ids]) => ({ value, ids }));

  return {
    total: results.length,
    missingId,
    missingEmail,
    missingGoogleSubject,
    duplicateEmails: duplicates(emailOwners),
    duplicateGoogleSubjects: duplicates(subjectOwners),
    duplicateNames: duplicates(nameOwners)
  };
}

export async function migrateEchoStarsMembers(sourceDb: D1Like, targetDb: D1Like): Promise<MigrationStats> {
  const batchId = crypto.randomUUID();
  const startedAt = Date.now();
  const { results = [] } = await sourceDb.prepare('SELECT * FROM users ORDER BY id').all();
  const stats: MigrationStats = {
    batchId,
    scannedCount: results.length,
    migratedCount: 0,
    skippedCount: 0,
    issueCount: 0
  };

  await targetDb.prepare(`
    INSERT INTO migration_batches (id, sourceApp, status, startedAt, scannedCount)
    VALUES (?, ?, 'running', ?, ?)
  `).bind(batchId, SOURCE_APP, startedAt, results.length).run();

  for (const row of results) {
    const mapped = mapEchoStarsMember(row);
    try {
      if (!mapped.id || !mapped.email) {
        stats.skippedCount += 1;
        stats.issueCount += 1;
        await recordIssue(targetDb, batchId, mapped.id, 'missing_identity',
          `id=${mapped.id || '(empty)'} email=${mapped.email || '(empty)'}`);
        continue;
      }

      const emailOwner = await targetDb.prepare(
        'SELECT id FROM users WHERE LOWER(TRIM(primaryEmail)) = ? LIMIT 1'
      ).bind(mapped.email).first();
      if (emailOwner && text(emailOwner.id) !== mapped.id) {
        stats.skippedCount += 1;
        stats.issueCount += 1;
        await recordIssue(targetDb, batchId, mapped.id, 'email_conflict', `email=${mapped.email}`);
        continue;
      }

      if (mapped.googleSubject) {
        const subjectOwner = await targetDb.prepare(
          "SELECT userId FROM identities WHERE provider = 'google' AND providerSubject = ? LIMIT 1"
        ).bind(mapped.googleSubject).first();
        if (subjectOwner && text(subjectOwner.userId) !== mapped.id) {
          stats.skippedCount += 1;
          stats.issueCount += 1;
          await recordIssue(targetDb, batchId, mapped.id, 'google_subject_conflict', 'Google subject already belongs to another Starry user');
          continue;
        }
      }

      const now = Date.now();
      await targetDb.prepare(`
        INSERT INTO users (id, primaryEmail, status, createdAt, updatedAt)
        VALUES (?, ?, 'active', ?, ?)
        ON CONFLICT(id) DO UPDATE SET primaryEmail=excluded.primaryEmail, updatedAt=excluded.updatedAt
      `).bind(mapped.id, mapped.email, mapped.profile.createdAt, now).run();

      if (mapped.googleSubject) {
        await targetDb.prepare(`
          INSERT INTO identities (provider, providerSubject, userId, providerEmail, emailVerified, createdAt, lastSeenAt)
          VALUES ('google', ?, ?, ?, 1, ?, ?)
          ON CONFLICT(provider, providerSubject) DO UPDATE SET
            userId=excluded.userId,
            providerEmail=excluded.providerEmail,
            emailVerified=1,
            lastSeenAt=excluded.lastSeenAt
        `).bind(mapped.googleSubject, mapped.id, mapped.email, mapped.profile.createdAt, now).run();
      }

      const p = mapped.profile;
      await targetDb.prepare(`
        INSERT INTO profiles (
          userId, name, avatar, googleAvatar, amwayId, phone, residence, center,
          rank, approvedRank, rankApproved, rankAuditStatus, rankAuditType, rankUpdatedAt,
          joinReason, stayReason, birthday, motto, zodiac, talentNumber, lifeNumber,
          registerDate, auditedBy, auditedAt, createdAt, updatedAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(userId) DO UPDATE SET
          name=excluded.name, avatar=excluded.avatar, googleAvatar=excluded.googleAvatar,
          amwayId=excluded.amwayId, phone=excluded.phone, residence=excluded.residence,
          center=excluded.center, rank=excluded.rank, approvedRank=excluded.approvedRank,
          rankApproved=excluded.rankApproved, rankAuditStatus=excluded.rankAuditStatus,
          rankAuditType=excluded.rankAuditType, rankUpdatedAt=excluded.rankUpdatedAt,
          joinReason=excluded.joinReason, stayReason=excluded.stayReason, birthday=excluded.birthday,
          motto=excluded.motto, zodiac=excluded.zodiac, talentNumber=excluded.talentNumber,
          lifeNumber=excluded.lifeNumber, registerDate=excluded.registerDate,
          auditedBy=excluded.auditedBy, auditedAt=excluded.auditedAt, updatedAt=excluded.updatedAt
      `).bind(
        mapped.id, p.name, p.avatar, p.googleAvatar, p.amwayId, p.phone, p.residence, p.center,
        p.rank, p.approvedRank, p.rankApproved, p.rankAuditStatus, p.rankAuditType, p.rankUpdatedAt,
        p.joinReason, p.stayReason, p.birthday, p.motto, p.zodiac, p.talentNumber, p.lifeNumber,
        p.registerDate, p.auditedBy, p.auditedAt, p.createdAt, now
      ).run();

      const a = mapped.appMembership;
      await targetDb.prepare(`
        INSERT INTO app_memberships (
          userId, appId, status, role, isAdminUser, isContributor, canUpload, joinedAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(userId, appId) DO UPDATE SET
          status=excluded.status, role=excluded.role, isAdminUser=excluded.isAdminUser,
          isContributor=excluded.isContributor, canUpload=excluded.canUpload, updatedAt=excluded.updatedAt
      `).bind(mapped.id, SOURCE_APP, a.status, a.role, a.isAdminUser, a.isContributor, a.canUpload, a.joinedAt, now).run();

      await targetDb.prepare(`
        INSERT INTO legacy_links (sourceApp, sourceUserId, userId, sourceEmail, importedAt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(sourceApp, sourceUserId) DO UPDATE SET
          userId=excluded.userId, sourceEmail=excluded.sourceEmail, importedAt=excluded.importedAt
      `).bind(SOURCE_APP, mapped.id, mapped.id, mapped.email, now).run();

      for (const [relationType, legacyLabel] of mapped.relationships) {
        await targetDb.prepare(`
          INSERT INTO member_relationships (userId, relationType, relatedUserId, legacyLabel, resolutionStatus, updatedAt)
          VALUES (?, ?, NULL, ?, 'unresolved', ?)
          ON CONFLICT(userId, relationType) DO UPDATE SET
            legacyLabel=excluded.legacyLabel,
            updatedAt=excluded.updatedAt
        `).bind(mapped.id, relationType, legacyLabel, now).run();
      }

      stats.migratedCount += 1;
    } catch (error) {
      stats.skippedCount += 1;
      stats.issueCount += 1;
      await recordIssue(targetDb, batchId, mapped.id, 'row_error', String((error as Error)?.message || error));
    }
  }

  await targetDb.prepare(`
    UPDATE migration_batches
    SET status='completed', completedAt=?, scannedCount=?, migratedCount=?, skippedCount=?, issueCount=?
    WHERE id=?
  `).bind(Date.now(), stats.scannedCount, stats.migratedCount, stats.skippedCount, stats.issueCount, batchId).run();

  return stats;
}
