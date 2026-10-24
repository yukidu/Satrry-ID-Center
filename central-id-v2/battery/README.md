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
- 所有這些目前只是 GitHub Draft PR #34 和 Cloudflare 私有隔離 Worker。Gateway 尚未連上正式 `CENTRAL_AUTH_VERIFY`，私有正式 Secret 尚未配置，正式 30 App 未接入。

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
- 新要求『容許電池負數二次，不論數字多大』仍待使用者確認次數語意、重設週期、還款規則與安全邊界，未啟用，也不得偷改原有非負 CHECK。
- 開發合併／發布安全 Gate：https://github.com/yukidu/Satrry-ID-Center/issues/35
