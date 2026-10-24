# Starry Battery API Contract — draft v0.1 (M06 alignment)

Status: **development contract; NOT production-ready**. Authority: M06 latest Google Doc, 2026-10-24. Scope: Starry ecosystem only; H-Global MUST NOT bind, display, or use Battery API.

## Architecture and trust boundaries
Starry App backend → authenticated Battery Gateway → private Battery Engine → dedicated Battery D1; older ledger history archived in Starry R2. A central identity service verifies immutable user_id and Starry access. No App has D1 credentials; no long-lived secret in mobile code. Per-App identity, enabled flag, scopes, quotas, audit logs, separate preview/production credentials and databases. Fail closed if central auth or private engine unavailable.

## Versioned operations (existing Gateway route names must be preserved until verified)
- balance:read — authenticated user's shared available balance.
- ledger:read — authenticated user's paginated cross-App transaction history (including archived history after R2 implementation).
- usage:reserve — atomic FEFO allocation from unexpired lots; app_id + operation_id scoped idempotency; default timeout 180 seconds unless formally configured.
- usage:commit — only a live reservation can become a charge, exactly once. Expired/released reservations never charge even on late success.
- usage:release — failure/cancel/timeout returns **all** reserved units, exactly once. Expired source lots must not be resurrected.
- grant/adjust — privileged, separately approved and audited; never a general App scope.

## Contract invariants
1. User identity and App identity are server-verified; caller-provided user_id/app_id cannot override trusted identity.
2. No partial charge on failed or timed-out AI task; FEFO and atomicity across lot, reservation, wallet and ledger.
3. Normal lot expiry: end of issue month two years later by default. Expiry notices three months before expiry via deduplicated supported channels.
4. Signup X=10 and first central approval Y=20 are **initial planning values**, not enabled policy until checked against current admin settings and 01/02; each eligible new event at most once; no backfill for existing users.
5. Legacy balance claim is one-time, trusted, idempotent; no replay of old transactions. Deleted accounts lose unspent gifted units per formal policy. Purchasing remains disabled.
6. Keep most recent year of detailed ledger in D1; reconcile then archive older history in Starry R2 while preserving queryability. R2 archive is not a new central D1 backup.
7. Preview and Production credentials, D1 and bindings are isolated. Versioning must be additive; breaking changes require opt-in version, App-by-App compatibility tests and rollback.

## Explicitly disabled pending owner clarification
**Negative balance twice, unlimited amount**: M06 documents this as ambiguous. Do not allow negative balances or remove CHECK >= 0 / quantity safety bounds until “two times”, reset period, debt recovery, extreme numeric limits and abuse controls are formally decided. Any eventual allowance must be centralized and concurrency-safe, and only committed usage may count toward it.

## Required release gates (NOT satisfied by this document)
- Compare this contract to actual Gateway routes and JSON payloads before treating it as machine-enforced OpenAPI; publish an explicit OpenAPI schema and conformance tests.
- Validate Engine against real isolated Cloudflare D1 concurrent E2E, timeout races, rollback and idempotency.
- Implement/verify one-time grants and claims, R2 archive/history, expiration reminders, admin audit and revocation.
- Verify real central OAuth/introspection and provision per-App credentials securely; run each Starry App contract test and list upgrades.
- Check CI, sandbox Worker bindings, D1 migrations, health monitoring and rollback. User acceptance before production merge/deploy.

Implementation tracking: PR #34, Issue #35. This file is a safe initial contract baseline only, **not evidence of completed Engine/Schema/API changes or deployment**.
