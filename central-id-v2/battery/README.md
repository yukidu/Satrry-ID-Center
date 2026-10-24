# Starry Battery API Gateway／Private Engine（開發分支，尚未正式發布）

## 品牌與存取
- 只供 Starry 生態系，預計約 30 款 App。H-Global 永不使用電池。
- 所有 App 只能由可信任後端透過 Gateway 呼叫，手機及瀏覽器不得持有服務端私密 App Key。
- Gateway 需要 `BATTERY_DB`、`CENTRAL_AUTH_VERIFY`，寫操作再需要 `BATTERY_ENGINE` Service Binding 與 `BATTERY_ENGINE_SECRET`。任一必要綁定或驗證失敗必須拒絕，不能繞過。
- App ID、服務端 token SHA-256、獨立 Scope／啟停／每分鐘限流分別設定；限制值預設 120，Schema 範圍 1～10,000。
- 後端提交 `Authorization: Bearer <server-app-secret>`、`X-Battery-App-Id`、`X-Central-Access-Token`；中央身份驗證要回傳 `{active:true,brand_allowed:true,user_id,suspended:false}`。
- `GET /v1/battery/wallet`、`GET /v1/battery/ledger` 僅讀取中央驗證的本人資料，不能任意提交其他 `user_id`。
- `POST /v1/battery/reserve`、`/commit`、`/release` 透過 Gateway 轉交私有引擎，均按 (app_id,operation_id) 去重。會員正式 UI 不顯示人手預留／扣款／退款按鈕。

## 已寫但不可誤認正式上線的引擎
- `engine.mjs` 已有 FEFO reserve、成功 commit、失敗 release 的 D1.batch() 原子變更、同 operation 冪等，以及 3 分鐘預留期限。
- 私有 Cron 針對逾時 reservation 自動放回有效電池、清除已過期但仍在可用錢包的批次、刪除 48 小時以前的每 App 限流暫存資料；每輪掃描與刪除有上限，降低 D1 讀寫。
- 發現保護情況：逾期來源 lot 不得成功扣款；釋放預留時不能把已到期額度再加回會員可用餘額。
- Battery Gateway／Engine／獨立負債候選程式目前已由混合 PR #34 分拆到獨立 Draft PR #37。私有 D1 E2E 專項仍待完整驗收；Gateway 尚未連上正式 `CENTRAL_AUTH_VERIFY`，私有正式 Secret 尚未配置，正式 30 App 未接入。

## 真正 Cloudflare D1 驗收
- `e2e-sandbox-runner.mjs` 是專供隔離 D1 的 Cron 測試 Worker；無 public Worker URL，只會在獨立 test DB 寫入測試帳本及 `e2e_test_results`，使用假用戶 ID 並清理。它涵蓋 FEFO、重複操作、成功扣款、取消／逾時全退、已到期來源處理、跨請求併發、無私鑰拒絕。
- GitHub CI 單元測試不能等同真正的 Cloudflare D1 交易測試。必須從 `e2e_test_results` 讀到同一 `run_id` 的完整 PASS 證據才可宣稱該 E2E 通過。
- Cloudflare Cron 觸發可能需要部署傳播，尚未讀到驗收結果以前要標示 `pending`，不可誇大。
- 在隔離 D1 額外做過原生 SQL CHECK、同時扣額競爭、交易失敗 rollback 的直接驗證；僅能證實 D1 的該 SQL 路徑而非整體引擎。
- 出正式 API 前還缺真實會員登入/驗證、scope/App key 安全發放、FEFO 真實 D1 高併發 E2E、過期監控、發放與封存、R2、安全稽核與跨 App 整合。

## 規則來源與 AI 工作流程
- M06 Google 正式規格：https://docs.google.com/document/d/10XEaZagWP_hwF1kn3JidrjYyfE3-7L9SZLND2CZdAXA/edit
- M06-A 非工程師版：https://docs.google.com/document/d/1T-SXNilxJ9QnwHotDkFAC3OHIbZtpPo0KJ8PgcDeRLc/edit
- `rules-catalog.json`、`RULES_CHANGE_SOP.md` 規定規則 ID、狀態、同步流程。後續任何 API/Engine/DB 規則變更都要同步 M06-A、M04、M09、99；純粹編輯 Google Docs 不會自動部署。
- 正式選定『成功透支兩筆』，跨 Starry App 共用、同會員同時只限一筆透支、三分鐘超時釋放、債務清償立即回復兩次；負數以獨立負債帳記錄，FEFO lot 保持非負。本分支已有候選程式及 D1 遷移，但尚未通過完整真實雲端整合驗收，Production 未啟用。
- 開發合併／發布安全 Gate：https://github.com/yukidu/Satrry-ID-Center/issues/35

## 2026-10-24｜專責獨立開發與負債候選程式
- GitHub Battery 獨立 Draft PR #37：https://github.com/yukidu/Satrry-ID-Center/pull/37；不要直接合併與中央會員程式混雜的 PR #34。
- `migrations/0001_overdraft.sql` 只適用已建立的**Battery 專屬 D1**；新資料庫直接使用新版 schema.sql，切勿重複跑此 migration 或套用到中央會員 D1。
- 正值 lot/wallet 嚴格非負；`battery_overdraft_accounts.debt_units` 儲存負債，`successful_uses` 記成功透支次數（最多 2），`active_reservation_id` 保護每會員唯一透支任務。
- `applyCredit()` 是**尚未對接正式發放/贈送的內部函式**：先抵債，再把剩餘額度加入有效 lot；在透支尚未結算時會回覆需要重試，不得把 409 當作成功入帳。
- Gateway `GET /v1/battery/wallet` 新回傳 `available_units`（淨餘額，可能為負）、`spendable_units`（有效可用正值）、`debt_units`、`overdraft_remaining`、`overdraft_in_progress`。需在約 30 App 逐一驗證新版欄位相容性。
- 所有參數仍受 JavaScript 安全整數及資料庫 Check、防重、Rate limit 等技術安全界線保護；無單筆**業務**限制不等於無限數字或可跳過限流。
- 全部正式部署 Gate 仍未完成：真實中央 Auth Service Binding、私有 Engine Secret、App 安全金鑰發放、獨立 production D1 migration 與回退、R2 歸檔與用量風控、真實 D1 跨 App E2E、Preview 與 Production 健康驗證。**此 PR 不應自動啟用正式扣款。**

## 2026-10-24｜真實隔離 D1 與 Cloudflare Preview 驗收證據
- 測試庫：`starry-battery-overdraft-e2e-20261024`；私有 E2E Worker：`starry-battery-overdraft-e2e-private-20261024`（無公開網址，測試 Cron 已停用）。
- 第一輪 `bat-d1-e2e-overdraft-20261024-02` 為 11/12；排程在上輪完成前重複開始造成 `cleanupall` 暫時殘留，已用唯一 `e2e_run_claims` 鎖保護。
- 第二輪 `bat-d1-e2e-overdraft-20261024-03` **12/12 PASS**，包含 FEFO、取消、逾時、到期保護、普通並行扣款、首次透支、兩次透支和還款重設、同會員透支併行、信用發放衝突重試、私有 Engine 身分拒絕與清理。
- Preview 專屬庫：`starry-battery-overdraft-preview-20261024`（已套用 schema 與 reservation split SQL guard）。
- Preview 私有 Engine：`starry-battery-engine-preview-v2-20261024`（workers.dev 停用）；Preview Gateway：`starry-battery-gateway-preview-v2-20261024`（已設定只連專屬 D1 與私有 Engine；故意不綁正式 CENTRAL_AUTH_VERIFY，須 fail closed）。
- GitHub Actions Battery isolated guard 和外部 Gateway 健康檢查通過（workflow run `40063045064`）；PR #37 保持 Draft，**Production 仍未合併／未啟用**。
- 不可把 E2E 12/12 等同全部商業需求正式完成；還須真實中央 OAuth 契約、約 30 Apps 逐款接入、贈送／R2／正式遷移與回退等 Gate。
