# Central ID v2｜新站獨立入口

本目錄為 `https://id.hglobal1985.com` 的**新版中央會員 ID 網站**，與 `id.starry.phd` 舊站及既有 `starry_id_db` 嚴格隔離。

## 2026-10-23 初期部署範圍
- 唯讀的正式資訊首頁，包含 8 大功能模組、流程、FAQ。
- `GET /healthz`、`GET /api/v1/status`、`GET /api/v1/public/help`。
- 不啟用 OAuth、會員註冊／申請、會員名錄、申訴、私密 API；所有寫入回覆 503，預設拒絕。
- 全站 `noindex`、安全回應標頭、行動優先響應式、零分析／追蹤程式。
- 不讀寫舊 D1、不執行 v0.2 候選 Schema、不導流至舊版，不配置業務 Secrets。

## 部署名稱
- Preview Worker：`hglobal-central-id-v2-preview`
- Production Worker：`hglobal-central-id-v2`
- Production hostname：`id.hglobal1985.com`
- GitHub 唯一版控來源：本 repo main 的 `central-id-v2/src/index.mjs`

## 測試與部署 SOP
1. 開分支＋PR；`node --test central-id-v2/test/*.test.mjs`。
2. Preview Worker 部署同一份原始碼，確認 `/healthz`、首頁、所有拒絕私有端點和安全標頭。
3. 驗收成功、合併至 main，Production 部署 main 同一版本。
4. 啟用專屬 custom domain；再次對正式站執行非破壞性 smoke tests。
5. 下一階段分別加入：安全 OAuth 設定、合規政策、D1 新資料庫與資料遷移、核准權限檢查、R2 證據保護、正式端對端測試。**未通過所有安全門檻前不可將登入／個資蒐集假裝已可用。**

## 安全邊界
- 不把 Cloudflare 或 GitHub Token 放進 Repo。
- 不修改舊站、既有會員、DNS 根網域、既有 Workers 路由或 Starry Battery。
- 不把 v0.2 候選 SQL 直接套到已有正式 D1。
- 架構文件 01／02 的已定決議優先於 04／05 工程候選；專案所有權、最終架構仍需以實際部署為準。
