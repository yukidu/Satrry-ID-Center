# Echo-Starry × 新中央 ID｜正式接口交接（安全雙軌切換）

> 這份文件給負責 `yukidu/Echo-Starry` 的另一個 AI。它只是**受控 API 接入契約**，不是所有會員已正式切換的證明；**不要把整個 Echo 的 `API_BASE` 搜尋取代成 `id.hglobal1985.com`**。Echo 的一般業務（音檔、電池、自己的 session、資料庫）要保留原服務。

## 目前已部署的環境

| 項目 | URL / 狀態 |
|---|---|
| 新中央 ID | `https://id.hglobal1985.com` |
| 新中央 API Readiness | `GET https://id.hglobal1985.com/api/v1/compat/readiness` |
| 原中央 ID | `https://id.starry.phd`，保持不變 |
| Echo | `https://echo.starry.phd`，原登入流程未更動 |
| 新中央 D1 | `central_id_v2`；74 舊會員索引、72 verified Google subject、108 舊 App 權限、70 Echo 精準 ID 映射 |
| Live Source | `starry_id_db` 的只讀 D1 binding `LEGACY_AUTH_DB`，新網關登入／簽發／兌換要即時檢查停權與 Echo App 權限 |
| Production SSO feature gate | `ECHO_TICKETS_ENABLED` 的實際值必須從 Readiness 檢查；不得以版本號推測 |
| 最終 Switch Flag | `echo_cutover_ready` 未做跨 App 端到端真實驗收前必須是 false |

## Echo 舊 API 與新版映射

1. 原 `id.starry.phd/api/google-sync`：不可以直接原 URL 字串替換。**Echo 必須已在瀏覽器取得 Google GIS ID Token**（Google Client ID 必須與新端 `aud` 相同）。POST `https://id.hglobal1985.com/api/google-sync`，`Origin: https://echo.starry.phd`，JSON `{"appId":"echostars","credential":"<GIS ID Token>"}`。新網關驗 RS256 Google JWKS 簽章、iss/aud/exp/iat/subject、verified Google + 舊正式 user 狀態。Email 不能作合併依據。
2. 回應 `continueUrl` 若存在，瀏覽器使用 `window.location.assign(continueUrl)` **整頁跳轉**到 `/auth/echo/continue`，不依賴第三方 Cookie。橋接碼一次性、120 秒內有效；新網域設一方 HttpOnly Lax session 並 HTTP 303 至 Echo `/auth/callback?code=...`。
3. **要修改 Echo Worker** 的 `worker/starryEcosystemSsoRouter.ts`：當 `url.hostname==='echo.starry.phd'` 且 `pathname==='/api/auth/ecosystem-exchange'`，新增受控分流，以使用者送來的 `code` 向 `POST https://id.hglobal1985.com/api/v1/compat/tickets/consume` 兌換，body `{"appId":"echostars","code":"..."}`，**不要**把新 token 交給舊版 `consumeEchoTicket`（舊 D1 的 starry_app_auth_codes 不認識新票據）。
4. 將回應的 `starryUserId`（中央 global ID）及 `echoLegacyUserId`（有的話 70 個舊 Echo 本地 ID 映射）核對本地 `env.DB.users`。有 echoLegacyUserId 時**只依精準本地 ID 查詢**，禁止單靠姓名／相同 Email 自動挑一筆。若本地找不到則記安全錯誤 `identity_link_missing`、停在舊流程 fallback，不得直接把非認證獎銜或管理員權限授予新帳號。
5. 驗證 `users.isBlocked!==1`，再呼叫原 Echo `createEchoSession(env, local.id)` 與 `next(/api/auth/session)`，沿用原 `authToken,sessionExpiresAt,starryUserId` Echo 回應契約。中央不傳上手、會員隱私、Starry 電池、獎銜核准；Echo 應繼續用自己的權限決定畫面。
6. 這是**Echo 登入 SSO** 的替換，並非其他 `/api/tracks`、`/api/categories`、電池、通知、音檔等 Echo 業務 API 的轉址。

## 接入程式

可從本 repo `central-id-v2/echo-adapter/echo-central-ticket-client.mjs` 複製私有服務端 helper `redeemCentralEchoTicket(code)` 到 Echo Worker 的專屬模組，再在 Echo 的原本 `exchangeEchoTicket` 分支內插入其呼叫（路由與 return 使用原有程式封裝）。

Helper 特點：固定新 API URL、禁止外部 URL（SSRF）、輸入驗證、網路 timeout、實際 scope/權限契約核驗、對所有失敗一律回拒絕物件；它**只兌換票據，不自行授權或建本地帳號**。

## 分批驗收與即時回退

- Preflight：GET readiness 必須 `status:"ok"`、`storage:"connected"`、`live_legacy_auth:"read_only_live_checked"` 且開票 `ticket_exchange_enabled:true`；若 `false`，不可切換。
- 使用安全測試會員驗證 Google ID Token、Echo callback、App local session 完整打通；錯誤 audience、偽簽、過期、已用過的 code、錯誤 Origin、被封鎖 app、使用者停權、Google subject 改綁、無映射都必須拒絕。
- 務必確認目前 Echo frontend Google callback 的真正入口；只改 Echo 的 SSO login 路徑，保留其他 App 原網址。
- 先以明確灰度旗標 `ECHO_CENTRAL_V2_SSO` **針對單一測試帳號啟用**。正式 Google 授權網域、跨站 Browser Cookie、iOS/Android PWA、Echo 本地帳號、回退驗收全通過後，再逐步放量；每一步都可即時恢復 `id.starry.phd` 原 SSO。
- 不要把任何真實 Google ID Token、Apple Team Secret、長效 Session、私人會員資料記入 GitHub PR、Google Docs、測試 log 或詢問 AI 的純文字訊息。

## 跟進

正式架構及過渡性 live read：`central-id-v2/ECHO_COMPAT_PHASE1_20261023.md`。上線稽核與阻擋事項：GitHub Issue #15。舊正式 D1 在完成安全主權遷移及連續動態同步前，會維持 **只讀權威檢查**。
