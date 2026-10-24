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


## 最新補充：Session 綁定版本 v3（2026-10-24，取代上述舊 11/11 基準）

- 採 `0006_private_cross_app_tokens.sql` 原本的 `source_session_hash NOT NULL` 欄位，不新增重複 0007。中央 Token 必須外鍵綁定真實 `auth_sessions.session_id_hash`。
- `src/private-token-issuer.mjs` 為中央內部候選，預設停用，只能由可信任中央 Controller 在防 CSRF 等條件已驗證後呼叫；原子 `INSERT SELECT` 從仍有效的中央 Session、會員與 Starry brand grant 發出 5 分鐘內的 opaque bearer，不允許自報 user_id。
- `src/private-introspection.mjs` 每次對照中央原 Session 的撤銷、到期、品牌、原版本、正式審核/停權/刪帳和品牌授權；登出後衍生 Token 不能繼續使用。
- 新建全新中央 D1 `central-auth-session-pr40-isolated-20261024` UUID `43787073-ec7b-4391-ac71-94e3b0890dd4`；0004 共 14 個 SQL statements、最新 0006 共 6 個 statements 全部成功。此為隔離環境、沒有正式會員。
- 新版中央 Auth Worker `hglobal-central-auth-private-session-pr40-20261024` 及 E2E Runner `hglobal-central-auth-e2e-session-pr40-20261024` 只使用此中央 D1 與受保護 Service Binding，公開 Workers.dev 及 Preview URL 均已關閉。秘密值僅存 Cloudflare Secrets，未寫入 GitHub。
- Cloudflare 真實執行 E2E Runner，結果已存入隔離中央 D1 `central_auth_e2e_results`：`run_id=central-auth-pr40-20261024-e2e-3`，**passed=13,total=13**，全部通過。
  1. 未知 Token 拒絕；2. 缺少 private Caller Secret 拒絕；3. 中央 Session 有效且通過資格才能發放 Token；4. 合法 Token 驗證取得中央 user_id；5. 呼叫者偽造 user_id 拒絕；6. 錯誤 Caller Secret 拒絕；7. 假冒其他品牌拒絕；8. 撤銷 Starry 授權拒絕；9. 中央 auth_version 改變拒絕；10. **原中央 Session 登出，衍生 Token 立即失效**；11. 暫停會員拒絕；12. 已刪帳會員拒絕；13. 測試假會員資料清理成功。
- 已再次核對 identity_users/auth_sessions/central_brand_authorizations/central_service_access_tokens 四類假會員資料全為 0、PRAGMA foreign_key_check 無違規；一次性 Runner Cron 已 PUT 停用並以 GET 讀回 `schedules: []`，避免持續計費。
- 此結果取代之前「新 E2E pending」的暫時狀態；**舊版 11/11 成績不能拿來當新版驗收，本次 13/13 是新版本的獨立證據**。
- **仍未正式上線**：中央 OAuth 真實 token issuance HTTP 流程/會員授權與 CSRF、Starry 批核策略、Battery Gateway Caller Secret header 協議、跨 App 真實 E2E、Production DB migration、Cloudflare 正式部署與 rollback。PR #40 仍 Draft。
