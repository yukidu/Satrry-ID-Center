# Central ID private Auth introspection｜中央專責，未正式啟用

## 所有權及目的
此模組 **只屬中央會員 ID 身分及中央 D1**。繁星 Battery Gateway、Engine、D1、R2、透支、額度規則皆由 Battery 專責 AI 管理，中央 AI 不得修改 Battery PR #37。

提供未來受保護 Cloudflare Service Binding `CENTRAL_AUTH_VERIFY` → `POST /v1/introspect` 的中央端候選實作。

中央端參考 Battery PR #37 的唯讀契約：
`central-id-v2/battery/CENTRAL_AUTH_BINDING_CONTRACT.md`。
跨服務正式綁定**需要另外取得 Battery AI 相容確認**；此候選加強要求 `X-Central-Service-Auth`（預先共用的私有 Caller Secret），原契約尚未把它列為必填欄位，因此不能未協調就開通。

## D1 資料模型
`migrations/0006_private_cross_app_tokens.sql` 建兩個只屬中央 D1 的表：
- `central_brand_authorizations`：中央可核對之 Starry 範圍授權（無自動預設核准）。舊 H-Global Session／Google ID Token 不會自行變成 Starry 授權。
- `central_service_access_tokens`：只存 256-bit opaque token 的 SHA-256，不保存明文。固定 Starry 及 `starry-battery` audience，最多 15 分鐘，當 auth_version 改變、停權、刪帳、到期、個別 token revoked 或 brand grant revoked 便不能通過。

**此移轉不會發放授權、建立真實會員 Token、部署或修改正式中央 D1。** 合法中央 token issuer、App 端安全拿取 access token、更新授權時 auth_version / epoch、撤銷、稽核及回滾是後續獨立的 P0 工程關卡，不能用臨時測試 Token 混充會員 Token。

## Introspection 入口（預設全封閉）
- Worker 程式 `src/private-introspection.mjs`，預定私有 Cloudflare Worker，必須 `workers_dev=false`、`preview_urls=false`、不得綁自訂網域路由。
- `POST /v1/introspect`，JSON 僅允許 `{"required_brand":"starry"}`。
- 標頭：`Authorization: Bearer <中央短期 opaque token>`、`X-Battery-Caller: starry`、`X-Central-Service-Auth: <由雙方在保密管道協調之私有 Caller Secret>`。
- 必須綁中央 `CENTRAL_DB`、`CENTRAL_AUTH_CALLER_SECRET`。少任何一項回 503（fail closed）。
- 僅查中央用戶、scope、授權版本、撤銷、停權、刪帳、效期及會員核准狀態，**不相信呼叫者聲稱的 user_id、Email、App ID**。
- 成功回應固定 `{active:true,brand_allowed:true,user_id,suspended:false}`；錯誤 401/403/503，禁止 CORS 及 Cache。
- 不提供公開 token issuer、沒有寫入 API、不對會員名單查詢開口。

## 重要尚待雙方正式決議
- 本候選在中央 membership_status != `approved` 時拒絕 Battery 授權。此為**保守安全 Gate（AI 建議）**，是否要求正式中央會員審核通過，需對照 M01、M03、M04、M06 與 Battery AI 聯合確認；不可擅稱使用者已定案。
- Caller Secret header 為額外防護；Battery Gateway 必須經專責 AI 自行開發支援，不可中央 AI 去修改 Gateway。
- Cloudflare 實際 Service Binding 名稱、中央 Worker 名稱、兩方 Secret 發放與更新、短期 Token issuer 的供給管道尚未驗收。
- 線上正式中央 D1 `central_id_v2` **尚未執行此 migration**，沒有 token issuer，所以不可直接啟用 Gateway 正式扣款。

## 開發／測試狀態
- GitHub Node 專用測試：`test/portal-private-introspection.test.mjs`。
- SQLite 中央資料庫約束測試：`test/private_introspection_schema_test.py`。
- 新增 CI 專用測試，僅中央分支與中央 workflow，不執行 Battery 測試。
- 狀態應區分：`規格候選`、`本地 CI 通過`、`Cloudflare 私有 Preview`、`Battery 綁定驗收`、`Production`，不可跨階段宣稱完成。

## 安全發布步驟
1. GitHub CI/CodeQL 全綠；對照最新版 main 與 PR #37 契約。
2. 先建立新的 Central-only D1 Sandbox，套用 0004 和 0006（不需 Battery D1）。
3. Preview Worker 只綁該中央 D1，預設無 Caller Secret 時拒絕，真私有 E2E 使用測試身分驗證成功/撤銷/失效。
4. 由中央與 Battery AI 共同批准私有額外 header、Starry 核准策略與 token issuer 授權流程。
5. 再加入專用 CI 合約驗收及 D1 回復計畫，合併 main，**另行核准實際 Production 部署**。

最後更新：2026-10-24。此文件為工程候選，不代表 Production。
