# Central private Auth｜2026-10-24 隔離 E2E 驗收證據

> 本文件只記錄非機密資訊。正式 Central D1、OAuth／Token issuer、Battery Gateway/Engine/DB 與 Production 未受本次測試更動。

## GitHub 實作
- 中央專屬 Draft PR #40： https://github.com/yukidu/Satrry-ID-Center/pull/40
- 候選原始碼：`central-id-v2/src/private-introspection.mjs`
- 唯讀私有 API：`POST /v1/introspect`，不是公開網站 Endpoint
- 中央 Schema：`migrations/0006_private_cross_app_tokens.sql`
- 真實 Cloudflare E2E Runner：`test/central-private-auth-e2e-runner.mjs`
- 單元／Schema CI：`test/portal-private-introspection.test.mjs`、`test/private_introspection_schema_test.py`

## Cloudflare 隔離資源
- Auth Worker: `hglobal-central-auth-private-pr40-20261024`
  - Workers.dev / Preview URL：均 Disabled
  - 只有 `CENTRAL_DB` 指向隔離中央 D1，另設不會顯示明文值的 `CENTRAL_AUTH_CALLER_SECRET`
- Runner Worker: `hglobal-central-auth-e2e-private-pr40-20261024`
  - Workers.dev / Preview URL：均 Disabled
  - `CENTRAL_AUTH_VERIFY` Service Binding → 上述私有中央 Auth Worker
  - `CENTRAL_SANDBOX` 指向同一個隔離中央 D1；不接 Battery D1
- 獨立中央 D1: `central-private-auth-pr40-sandbox-20261024`，UUID `3c6cec66-836c-49cb-8faf-5a8844816d41`。
- 已成功執行 0004 基礎 Schema（14 statements）及 0006 私有 Token schema（5 statements）。

## 已實際通過
1. 真實 D1 原生 SQL 約束：6/6 PASS（SHA-256 Token、auth_version、Starry grant、TTL<=15min、foreign key、清理）。
2. 真實 Cloudflare Service Binding 私有 E2E：`central_auth_e2e_results` 中 `run_id=central-auth-pr40-20261024-e2e-1`、`passed=11`、`total=11`。
   - unknown token → deny
   - 缺 Caller Secret → deny
   - 中央 Starry 有效 Token → 回中央不可變 `user_id`
   - 偽造 `user_id` → deny
   - 偽造 Caller Secret → deny
   - 偽造 H-Global Caller → deny
   - 撤銷 Starry 授權 → deny
   - `auth_version` 改變 → 舊 Token deny
   - 會員暫時停權 → deny
   - 帳號刪除 → deny
   - 假會員資料清除 → PASS
3. 全部 `__central_auth_pr40_%` 的 identity_users、central_brand_authorizations、central_service_access_tokens 皆清零，`PRAGMA foreign_key_check` 無違規。
4. Runner Cron 已經 Cloudflare PUT 停用，GET 確認 `schedules: []`，避免不必要測試費用。

## 未過的 Production Gate
- 當前 PR #40 仍 Draft、沒有合併 main；正式 `central_id_v2` 尚未執行 0006。
- 真正中央 OAuth 身分驗證後的短期 Token issuer 尚未實作；目前只有受保護的驗證端，不會憑空產生會員可用 Token。
- 是否 `membership_status='approved'` 才開放 Starry Battery，仍是待確認的保守安全 Gate。
- Battery PR #37 專責 Gateway 尚未兼容新提議的 `X-Central-Service-Auth` Header；**必須由 Battery AI 自己實作並雙方共同驗收**。
- 本次不涵蓋真實 App→Battery Gateway→中央 Auth 的整條 E2E、Secret 輪換、正式 Session 發行及 rollback。
- GitHub Environment／Secrets 最小權限及兩服務生產環境實際發布隔離，仍需單獨驗收。

**狀態：中央私有隔離 Service Binding 11/11 E2E 通過；整體跨服務與正式 Production 未完成。**
