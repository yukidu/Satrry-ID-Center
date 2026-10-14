# Satrry-ID-Center

Starry.phd 生態系中央會員資料庫專案。

## 專案定位

此 Repo 專門管理 Starry ID 中央會員資料庫相關內容：

- Cloudflare D1 `starry_id_db` schema
- 資料庫 migrations
- Echo Stars → Starry ID 會員資料對應與遷移工具
- D1 provision / audit 工具
- 中央會員資料欄位對照文件

## 重要原則

1. **繁星回聲 Echo Starry 保留在 `yukidu/Echo-Starry`，本次拆分不修改、不刪除 Echo-Starry 的既有程式。**
2. **現有正式 Cloudflare D1 `starry_id_db` 不重建、不搬家、不清空。** 本 Repo 只是把中央資料庫的程式與結構獨立管理。
3. 正式資料庫變更必須透過 migration，避免人工直接改 schema。
4. 任何正式 migration 執行前都必須先備份／確認影響範圍，並可重複安全執行。
5. 目前 `id.starry.phd` 與既有 Worker 部署仍維持原狀；本次建立 Repo 不切換正式流量。

## 來源基準

首次獨立來源：`yukidu/Echo-Starry` main `35300406dd72506ae4ac39f2440e031358da2b38`（v233，2026-10-14）。

## 目錄

- `starry-id/schema.sql`：中央 D1 主結構
- `starry-id/migrations/`：歷次資料庫 migration
- `starry-id/migrateFromEchoStars.ts`：Echo 會員欄位轉換
- `starry-id/remoteMigrate.ts`：遠端 D1 遷移工具
- `starry-id/provision-and-audit.sh`：建立／驗證中央 D1 與來源資料稽核
- `starry-id/ECHOSTARS_FIELD_MAPPING.md`：Echo 與 Starry ID 欄位對照

> 注意：本 Repo 名稱依目前 GitHub 實際名稱保留為 `Satrry-ID-Center`。
