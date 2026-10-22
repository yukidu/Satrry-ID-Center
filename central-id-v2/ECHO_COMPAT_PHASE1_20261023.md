# Central ID v2｜Echo-Starry API 相容開發第一階段（2026-10-23）

## Cloudflare 資料庫進度

- 正式新版 D1：`central_id_v2`，其原有 33 表正式候選 Schema 尚未整體遷入。
- 新增的相容表：`compat_legacy_principals`、`compat_google_subjects`、`compat_legacy_app_access`、`compat_auth_sessions`、`compat_auth_tickets`、`compat_migration_audit`。均與正式 v0.2 Schema 使用不同命名，避免把候選欄位誤當正式中央審核資料。
- 僅從隔離副本 `central_id_legacy_snapshot_20261023` 匯入 74 筆 legacy principal、72 筆 **emailVerified 的 Google subject**、108 筆 App 成員紀錄。**未匯入舊 Session、舊 Token、舊 App 秘鑰、Starry 電池或舊名片對外可見旗標。**
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
| POST `/api/apps/:appId/ticket` | **一律 503**，因 Echo 應用端 ticket 交換和完整授權驗收尚未完成 |

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
