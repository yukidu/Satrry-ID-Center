# Central ID｜與 Starry Battery 獨立發布邊界（2026-10-24）

**負責方：中央會員 ID AI。** Starry Battery Gateway／Engine／其獨立 D1、電池交易與透支規則由專責 Battery AI 統一維護。本文件不修改 Battery 專責資源。

## 已核對的真實部署資源（Cloudflare API 唯讀）
- 中央 Production Worker：`hglobal-central-id-v2`；`CENTRAL_DB` 綁定 `central_id_v2`（`ca08ee86-7b39-46fe-a578-611d1bee312c`）。另有 `LEGACY_AUTH_DB` 指向既有 `starry_id_db`（`01195c92-555e-4816-bddc-5b8cb2e795db`），目前是已存在的相容性／唯讀驗證依賴，**不是可供中央部署任意更新的 D1**。
- 中央 Preview Worker：`hglobal-central-id-v2-preview`，`CENTRAL_DB` 指向 `central_id_v2_compat_preview_20261023`（`bf911410-580f-4b5a-975c-28f77285fabb`）；**不要用它進行 Battery 測試**。Preview 既有 LEGACY_AUTH_DB 同樣指向隔離 D1，與 Production 分離。
- Battery 私有隔離 Worker：`starry-battery-engine-preview-20261024`、`starry-battery-e2e-private-20261024`；其 Sandbox D1 是 `4695a956-64c1-4635-b559-74e6298919d9`。中央 CI／部署不可觸碰。
- 既有 `central-id-acceptance-20261024` **同時綁定** `CENTRAL_SANDBOX` 與 `BATTERY_SANDBOX`，是需要專責雙方協調拆除的暫存驗收展示站，**不符合完全隔離，也絕不能作中央正式部署模板**。
- Cloudflare R2 清單本輪未找到可明確辨識的 Starry Battery 專屬 Bucket；不得宣稱 Battery R2 已隔離部署或已驗收。

## GitHub 分工與 PR #34 拆分
- PR #34 目前同時變動 `central-id-v2/src/**`、中央 `migrations/**`、`central-id-v2/battery/**` 與共用 workflow。**禁止直接合併或兩方繼續共同推送**。
- PR #37 是 Battery 專責獨立 PR，由 Battery AI 維護。中央一律從最新 `main` 建立獨立分支，中央程式搬遷另開 PR，不能 cherry-pick 包含 Battery 的混合 commit。
- 同時涉及中央身份驗證契約、GitHub Actions 或其他共用設定的 PR **必須雙方核對相容性**。這份 CI 路徑分流 PR 是共用 workflow 變更，合併前應讓 Battery AI 確認其將自行建立 Battery CI Gate。
- `central-id-v2.yml` CI 已限制只觸發中央程式、中央 D1、中央專用測試及 Central Release Manifest，不再對整個 `central-id-v2/**` 或 Battery tests 廣泛觸發。CodeQL 全倉庫安全掃描是共用安全 Gate，不構成服務部署。

## 正式發布與限制
- 中央可與 Battery **平行開發及隔離 Preview 測試**，但同一中央 Worker 的 Production 更新必須序列化。預定採 GitHub Environment `production-central-id`、concurrency group `production-central-id`；Battery 應獨立使用 `production-starry-battery`。
- 目前 **未建立經實測的中央自動 Production 部署 workflow**；不可因 CI 分流而假稱部署衝突保護已完整落地。部署前須先驗證 Environment 存在、部署憑證最小權限、實際 Worker name / D1 ID / Secret Binding 與回復點，完成 CI＋Preview＋D1＋OAuth／Session 權限驗收。
- 不允許從這份隔離宣告直接執行 `wrangler deploy`、DB migration 或改 Cloudflare Worker／D1。正式部署時須明確指向中央服務且只處理本模組，保留上一版 Worker deployment 作回退。
- 身分驗證對 Battery 的跨模組契約必須另外提變更申請並雙方核對；禁止未驗收就更新正式互相依賴。

## 工程驗收所需後續工作
1. 中央從 PR #34 將自身業務程式與遷移獨立 PR 化，核對最新中央正式規格，驗證是否涉及 43 階獎銜、中心授權等不同審核規則。
2. Battery AI 將 Battery 程式搬到 PR #37 或其獨立分支；建立 Battery 自身 CI（包括 Schema、FEFO、逾時及真正 D1 E2E），不借用中央全目錄 CI。
3. 兩方協調移除或分拆 `central-id-acceptance-20261024` 的跨服務 Sandbox Binding。
4. 使用各自的 Worker / D1 / Secrets 建立獨立 Production deployment Gate，再進行雙方平行 Preview 和正式序列發布實測。

## 狀態
截至本檔更新：**資源唯讀盤點已做、CI 分流已寫入中央候選 PR；完整 CI 生效、平行發布與自動 Production 部署仍待測試與跨 AI 確認。**
