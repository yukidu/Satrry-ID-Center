# 中央會員 ID｜正式跨 App 身分 API v1（第一方限定）

## 正式功能範圍

GitHub 所有權：`yukidu/hglobal-id`，不得由 Starry Battery Repo 修改中央程式或中央 D1。

本 API 只提供 **已登入的使用者本人** 的中央 `user_id`、顯示姓名與會員資格狀態。不提供會員名錄、Email、手機、安麗會員編號、獎銜、教育中心權限、親屬資訊、任何管理授權或 Starry Battery 帳務。

- API origin：`https://id.hglobal1985.com`
- 正式自測頁：`https://id.hglobal1985.com/apps/api-test`
- 不需直接使用 D1 憑證；所有會員存取必須由中央 Worker 控制。
- 禁止把 Google ID Token、中央 access token 放在網址、log、localStorage 或跨 App 長期保存。

## 第一版註冊 App

| app_id | Google client_id (公開識別，不是秘密) | 允許網頁 Origin |
|---|---|---|
| `hglobal-web` | `791614645185-vbaqqbnr463r1vi4ga41uh73s7eg0gv5.apps.googleusercontent.com` | `https://id.hglobal1985.com`, `https://hglobal1985.com` |
| `starry-web` | `661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com` | `https://starry.phd`, `https://echo.starry.phd` |

其它新 App 必須先登記正式 Google OAuth Client ID、Origin 及 App 權限；不能自行宣稱自己是既有 App。API 的 app_id 標頭不是獨立認證依據，中央必須同時驗證 Google JWT 簽章、audience、issuer、nonce，且讀取正式 D1 的 Google Subject → user_id 映射。

## API 使用流程

1. `GET /api/v1/apps/status`：公開讀取功能狀態與限制，不回傳會員資料。
2. `POST /api/v1/apps/challenge`：JSON `{"app_id":"hglobal-web"}`；只能從白名單網頁 Origin 呼叫，回傳 600 秒有效隨機 `nonce` 及 Google Client ID，中央資料庫只存 SHA-256。
3. App 使用 Google Identity Services，將上述 `nonce` 放入 `google.accounts.id.initialize({client_id,nonce,...})`，取得短期 Google ID Token。
4. `POST /api/v1/apps/token`：JSON `{"app_id":"hglobal-web","nonce":"...","credential":"<Google ID Token>"}`，僅從原 Origin。中央驗證簽章、Google Subject、Google Audience、nonce、一次性 Challenge，並檢查同一中央 user_id 身分有效。成功只回短期 300 秒的中央 opaque Token，中央 D1 只存 SHA-256。
5. `GET /api/v1/apps/me`：Headers `Authorization: Bearer <CENTRAL TOKEN>`、`X-Central-App: hglobal-web`。成功只回 `user_id`、`display_name`、`membership_status`、`scope=central.identity.read`；`management_authorized=false`、`battery_authorized=false`。每次比對即時中央 D1：Token、App scope、撤銷、效期、會員停權/刪除、`auth_version`。
6. `POST /api/v1/apps/revoke`：帶同樣 Bearer Token / X-Central-App，立即撤銷該 Token。

所有認證失敗一律 fail closed（400/401/403/503），禁止會員枚舉。無登入驗證則不能取得任何個資。Google ID Token 不能直接呼叫 `/me`，必須先交換成中央 Token。

## 資料庫與安全

獨立中央新增 Migration `0008_first_party_identity_api.sql`，只增加 `central_app_login_challenges` / `central_app_access_tokens` 兩個表和索引，依賴現存 `0004_central_google_portal_identity.sql`；**不更動既有會員 Profile、user_id、登入/Session、Google Provider 對應，也不搬移正式 D1/R2**。

- 每個 nonce 一次性消耗、10 分鐘過期，並綁定 app_id、Origin。
- 每個 access token 最長 5 分鐘、可撤銷，並綁定發行時的 `auth_version`。中央多裝置登出提升 `auth_version` 後，舊 Token 立即失效。
- 強制 TLS、JSON、白名單 CORS、Cache-Control: no-store。
- 這是中央 first-party 登入身分查詢的過渡 v1，不取代完整跨 App OAuth/PKCE、細粒度使用者同意/Scope 授權、Apple Sign-In 或完整第三方 API。
- **不可藉由此 API 判斷任何 App 的會員職務、Starry Battery 額度或扣款權限。**

## 發行紀錄欄位

填入正式 main Commit SHA、CI/CodeQL、Cloudflare Worker version / deployment ID、schema 結果、真實 URL、回退版本。尚未填的欄位不能視為已驗收通過。
