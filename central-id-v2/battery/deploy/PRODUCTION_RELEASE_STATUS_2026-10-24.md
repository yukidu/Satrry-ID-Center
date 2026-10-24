# Starry Battery｜Production 發布實際盤點｜2026-10-24

> **狀態：正式基礎設施已建置；服務未上線；禁止會員扣款。**
> 使用者已授權啟動正式部署，但未授權跳過必要身分、財務帳務安全驗收。

## 已執行且 Cloudflare 讀回確認
| 資源 | ID / 名稱 | 狀態 |
| --- | --- | --- |
| Battery 專屬 Production D1 | `starry-battery-production` UUID `6fb69a9b-11b2-4794-950b-004db41d3343` | 2026-10-24 建立 |
| Battery 專屬 Production R2 | `starry-battery-ledger-production` | 2026-10-24 建立 |
| D1 schema | PR #37 `central-id-v2/battery/schema.sql`；Git blob `702045b77085e30b72ba5a1debe09bc37d202a92` | 空庫安全確認後 D1 查詢 API 成功執行 18 語句 |
| D1 table | `battery_app_clients`, `battery_app_rate_limits`, `battery_archive_index`, `battery_credit_receipts`, `battery_ledger`, `battery_lots`, `battery_overdraft_accounts`, `battery_reservation_allocations`, `battery_reservations`, `battery_wallets` | 實際列舉 10 張 |
| Production wallet/App/ledger/debt/archive | 在 Production D1 的 SELECT COUNT 讀回 | **全部 0 筆** |
| Production Battery Engine/Gateway/Archive Workers | `starry-battery-*-production` | **未建立／未部署**，沒有正式路由 |
| 中央正式 Worker/D1 | `hglobal-central-id-v2`, `central_id_v2` | 本輪 Battery AI 未修改 |

## 發布與安全隔離
- GitHub Battery 獨立 Draft PR #37：https://github.com/yukidu/Satrry-ID-Center/pull/37。**尚未合併 main**，不得直接把分支未驗收程式部署正式 Workers。
- 新增 `deploy/battery-targets.json`，定義 D1/R2 的正式 UUID／名稱，列出被禁止的中央 D1 UUID。
- 新增 `deploy/verify-battery-cloudflare.mjs` GET-only 預檢與 mock 單元測試；沒有 Cloudflare Secrets 也不會在 GitHub CI 假裝預檢已對真實帳號執行。
- 新增 `starry-battery-production-preflight.yml` 手動唯讀稽核；與 Battery 正式 deploy workflow 共享 `production-starry-battery` 互斥群組。中央獨立使用 `production-central-id`。
- Engine 實際 runtime `BATTERY_OPERATIONS_ENABLED`、`BATTERY_OVERDRAFT_ENABLED`、`BATTERY_CREDIT_ENABLED` 預設未開；Archive `BATTERY_ARCHIVE_ENABLED=false` 且無 Production Cron。普通 release 清理預留仍可執行，但所有新增扣款／透支／贈送不可意外啟用。
- PR 最新 CI 已驗證 Runtime 禁用及只讀 Cloudflare 預檢 Mock。**Production GitHub Environments／私密 Token 的配置和真實 Workflow Dispatch 尚無可驗證執行證據**。

## 已通過的獨立測試（非 Production）
- Cloudflare 隔離 D1 E2E `bat-d1-e2e-overdraft-20261024-05`：14/14 PASS。
- Cloudflare Preview R2 + D1 Archive E2E `bat-r2-archive-e2e-20261024-01`：PASS，sandbox 假會員資料清理驗證 0 筆。
- 新版 runtime 停用開關已加入 GitHub unit tests；這不等於已啟用正式跨 App 扣款。

## 上線阻擋（不得自行勾選）
1. 中央 AI 提供受保護的 Central Auth `CENTRAL_AUTH_VERIFY` Service Binding 與 `POST /v1/introspect`；以真實中央短期 Starry token 做撤銷、停權、刪帳、auth_version E2E。
2. 各 Starry App 分別申請 App Registry/scopes、獨立 Server Key、實際限流，H-Global 全拒絕；手機不得有長效金鑰。
3. 新註冊 X／首次核准 Y／贈送／遷移的可信 Server-to-Server 入帳事件與安全 issuer 權限驗收。
4. Production D1 回復書籤或備份與可回退 migration 演練、交易並行費用監控、刪帳及 R2 隱私清除。
5. PR #37 與中央共享契約 CI 驗收，按 SOP 合併 main 後，才使用 Battery 專屬 Production Workflow 發布。
6. 正式 worker deployment SHA、health、真實合法與非法 token 的讀寫 E2E、回退點與安全稽核證據。

## 發布結論
`production_ready=false`。**只有正式 D1/R2 基礎資源已部署；Battery API Production 尚未啟用。**
