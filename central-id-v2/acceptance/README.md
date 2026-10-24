# 中央會員 ID｜獨立驗收測試頁（非 Production）
公開驗收 UI：`https://central-id-acceptance-20261024.yukidu.workers.dev/`
Repo branch: `feat/central-hglobal-center-battery-api-20261024`
GitHub PR: https://github.com/yukidu/Satrry-ID-Center/pull/34

## 真實部署
- Cloudflare Worker: `central-id-acceptance-20261024`
- Cloudflare Worker 部署 ID: `3a239830-ec2e-4e4d-9cea-c8ce47d0848e`
- 已啟用 worker subdomain，`previews_enabled=false`。
- 只有兩個**隔離 D1 測試庫**（CENTRAL_SANDBOX、BATTERY_SANDBOX），資料只含 schema/中心固定清單；沒有正式會員個資。
- `GET /api/acceptance/status` 使用唯讀 SELECT 回傳中心筆數、電池 schema 表數、啟用測試 App 數。其他 POST/PUT/PATCH/DELETE 全部 405。
- UI 中選中心、送出獎銜申報與電池預留/扣抵/退回全部為前端**模擬**。明確禁止用於正式會員或真實扣抵、不可將模擬演算標記為 Backend E2E。
- 此 Cloudflare Worker 原始碼是由 `acceptance/worker.mjs` 加上 `src/centers.mjs` 編譯成單模組上傳，中心名錄與主程式同源。

## Starry Battery 實際隔離 Engine
- Worker: `starry-battery-engine-preview-20261024`
- 最新部署 ID：`e4be2de3-5b67-4c22-bc09-92fb2894c030`
- 已綁 **Battery Sandbox D1**，沒有設定 `BATTERY_ENGINE_SECRET`，沒有任何公開 URL，也未連 Gateway/正式中央 Auth。
- FEFO Reserve、Commit、Release 交易程式已進入開發 PR，CI Node 測試驗證 FEFO 順序、D1 batch 呼叫、幂等、逾時拒扣與權限 fail closed。但目前未完成真實 D1 交易的 End-to-End、逾期清算、cron、舊額度認領、正式中央 introspection、30 App 上架認證或生產安全審核。
- 所以不可對外開放、不可用於真實電池資料。

## 最後上線前驗收
請以 https://github.com/yukidu/Satrry-ID-Center/issues/35 為整體工作清單，
且重新確認 GitHub PR #34 的所有 CI/CodeQL 狀態，
完成真實 OAuth、服務間密鑰隔離、歷史事件稽核、Data Migration staging/E2E 與 rollback 才能發佈正式服務。
