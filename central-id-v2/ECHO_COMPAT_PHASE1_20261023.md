# Central ID v2｜Echo-Starry API 相容開發第一階段（2026-10-23）

## Cloudflare 資料庫進度

- 正式新版 D1：`central_id_v2`，其原有 33 表正式候選 Schema 尚未整體遷入。
- 新增的相容表：`compat_legacy_principals`、`compat_google_subjects`、`compat_legacy_app_access`、`compat_auth_sessions`、`compat_auth_tickets`、`compat_migration_audit`。均與正式 v0.2 Schema 使用不同命名，避免把候選欄位誤當正式中央審核資料。
- 僅從隔離副本 `central_id_legacy_snapshot_20261023` 匯入 74 筆 legacy principal、72 筆 **emailVerified 的 Google subject**、108 筆 App 成員紀錄，以及 70 筆 Echo 原本地會員 ID 精準對照。**未匯入舊 Session、舊 Token、舊 App 秘鑰、Starry 電池或舊名片對外可見旗標。**
- `PRAGMA foreign_key_check` 無違規，`PRAGMA quick_check` 回傳 `ok`。
- 本次只匯入截至 2026-10-23 的一次性對照，**不自動同步原站新增／刪除／停權事件**。正式切換前必須增量重核與帳號撤銷事件一致性方案。

## 相容 API

以下 URL 部署到 `https://id.hglobal1985.com` 後仍處於測試／非可切換狀態：

| 方法與路徑 | 實作範圍 |
|---|---|
| GET `/api/v1/compat/readiness` | 資料庫連線與安全開關：`echo_cutover_ready:false` |
| POST `/api/google-sync` | JWT RS256 與 Google JWKS 驗證，issuer、audience、expiration、issued-at、subject、emailVerified 驗證，僅允許已登記的 Google provider subject 認領舊紀錄 |
| GET `/api/session` | 無 Session 時回 `authenticated:false`；有效新版 Session 才可讀自身 id 與姓名 |
| GET `/api/ecosystem/session` | 同上，額外要求允許的 Origin |
| GET `/api/v1/me` | 沒登入 401，登入只回最小身分資訊；不返回獎銜核准 |
| POST `/api/logout` | 撤銷新版專用 Session，並清除新版 Cookie |
| POST `/api/apps/echostars/ticket` | 有效新版 Session 且舊 Echo App 授權 active 時簽發 120 秒一次性 code，其他 app 不開放 |
| POST `/api/v1/compat/tickets/consume` | 對照 appId=echostars，原子消耗單次票據並重新檢查 App 授權與會員可用狀態；回傳 `starryUserId`、`echoLegacyUserId`（若原本有映射），重複／過期拒絕 |

嚴禁以舊 `starry_id_session` 代替新的 `central_id_v2_session`；完整 API 尚未可供其他 AI 切換使用。

### 已實作安全邊界

- Google subject 精準比對，不能靠 Email 合併不同帳號。新站的 Google JWT 必須經 Google RS256 JWKS 驗證，拒絕其他 audience / 偽造簽章 / 過期 token。
- 身分認領不等於中央會員資格正式核准；最低權限 visitor/legacy_unverified，不會沿用舊站的管理員身分。
- 不從 API 傳回 Starry 電池、Token、Session 機密、個人手機或私人名片。
- 白名單 Origin；Cookie HttpOnly、Secure、SameSite=None；不接受未核准的第三方 Origin 發動跨站登入。
- Google 既有 client ID 的新站網域設定 **尚需核實**；SameSite=None 不保證瀏覽器允許第三方 Cookie，跨網域實機驗收為 P0。

### 正式切換前必須通過

1. 新版正式 Worker D1 綁定及實際 HTTP smoke test。
2. 真正 Google 登入（需 Google OAuth Console 新網域授權）的跨瀏覽器測試，與 Apple OAuth。
3. Echo-Starry 票據產生、單次兌換、過期與重放拒絕、目標 App 授權、退出／停權撤銷與回退測試。
4. 原站後續新增會員與變更權限的增量同步／安全切換；不允許切換時舊資料被覆蓋或遺失。
5. Echo Worker 和前端 API 的契約對照、錯誤行為與端到端驗收。
6. 正式中央 33 表 Schema、會員＋43 階獎銜雙案審核、最高兩位管理員權限和依中心審核。
7. 隱私、安全、網域、跨 App Session、手機及公開名錄全部驗收。

目前：**不得通知另一個 AI 更改 Echo-Starry API。**

## 生產安全旗標（2026-10-23 更新）
- `ECHO_TICKETS_ENABLED` 預設關閉。正式 Worker 在未驗證 Echo 端兌換、權限同步、OAuth 網域與瀏覽器 Cookies 前，簽發／兌換票據均回傳 `503 ticket_exchange_not_ready`。
- 獨立 Preview Worker 將此旗標啟用，只使用空白測試 D1，實際測試票據邏輯及匿名拒絕，**絕不把正式會員資料提供給 Preview**。
- `GET /api/v1/compat/readiness` 的 `ticket_exchange_enabled` 表示旗標狀態，而 `echo_cutover_ready:false` 仍不變。嚴禁以單一健康檢查成功代替完整 E2E 切換驗收。

## Echo 跨網域登入橋接（新階段）

因 `id.hglobal1985.com` 和 `echo.starry.phd` 不同站點，瀏覽器第三方 Cookie 不可靠。新增**第一方導轉橋接**，僅在測試旗標 `ECHO_TICKETS_ENABLED=true` 時開啟：

1. Echo 原站已獲 Google GIS ID token 的瀏覽器，以 `Origin: https://echo.starry.phd` 且 `credentials: include` POST `https://id.hglobal1985.com/api/google-sync`，JSON `{"credential":"<Google ID token>","appId":"echostars"}`。
2. 經 Google JWKS 與原有 subject 精準驗證後回 `success:true`、`membership_status:"legacy_unverified"`，以及只在旗標開啟時的 `continueUrl`（2 分鐘內有效的一次性橋接碼，不是永久登入 URL）。
3. 瀏覽器**頂層導轉**至 `continueUrl`，由新 ID 網域的 `GET /auth/echo/continue?code=...` 原子兌換橋接碼，重新查驗會員及 Echo App 使用資格；新建 HttpOnly、Secure、SameSite=Lax 第一方 Cookie 與 120 秒的 Echo ticket。
4. HTTP 303 跳轉 `https://echo.starry.phd/auth/callback?code=...`；**Echo 必須修改其 callback**，改為向新 ID 的 `POST /api/v1/compat/tickets/consume` 提交 `{"appId":"echostars","code":"..."}`，取得 `starryUserId` 與（若存在）`echoLegacyUserId`，再建立 Echo 原業務站本地登入狀態。舊 callback 仍消耗舊 D1 ticket，現在不能完成新流程。

安全限制：bridge 和 Echo ticket 高熵、極短有效期、一次性；不回傳私密手機、獎銜核准、電池；若 Echo app 狀態非 active，應返回 403。Browser redirect 設定 no-referrer、no-store，Bridge 必須做重播／到期／無 app 權限測試。

**目前**：新程式碼與測試並不代表現有 Echo callback 已更新，Production 旗標預設仍關閉。沒有端到端實機驗證前仍不允許正式轉換。

## 2026-10-23 急件追加：Live Legacy Auth 即時授權門檻

靜態複製只保證核對當下，不足以保護「停權／刪除／App 權限撤銷」的即時性。過渡期間新版 Worker 以專用 `LEGACY_AUTH_DB` D1 binding **只讀**現行 `starry_id_db`，並於以下路徑強制重新驗證，不允許只信任一次性快照：

1. `/api/google-sync` 經 Google JWT 正式驗章與新庫 provider-subject 對照後，再查舊正式 `identities(provider,providerSubject,userId,emailVerified)` 是否同一 userId 且 `users.status='active'`。
2. `/api/session`、`/api/ecosystem/session`、`/api/v1/me` 的新版 Session 必須每次查舊正式 `users.status`。正式會員狀態改變，下一次 API 請求即拒絕。
3. `/api/apps/echostars/ticket`、第一方 `/auth/echo/continue`、`/api/v1/compat/tickets/consume` 必須即時查舊 `users.status='active'` 及 `app_memberships.status='active'`；停權／App 取消時票據不可簽發或兌換。
4. `LEGACY_AUTH_DB` 綁定缺失／查詢異常皆 fail closed，不能回退成只相信靜態快照。
5. Preview 中 `LEGACY_AUTH_DB` 只指向**無真實會員資料**的隔離 Preview D1 測試表，正式 Worker 才連到原本舊 D1，且所有來源查詢都為 SELECT。

**此為切換過渡期的暫時唯讀依賴，不是最終 Cloudflare 帳號分家架構**；未來新版中央身分及審核流程成為權威來源後才安全移除。

**仍待**：Echo client callback 對新版 consume API 的實作、真正 Google OAuth Browser/Apple 規格、Echo 本地資料與權限停權端到端實機驗收，故在正式旗標仍關閉時 `echo_cutover_ready` 維持 false。
