# Starry ID 中央會員中心｜資料庫套件

正式入口：`https://id.starry.phd`

本目錄管理 Starry ID 中央會員資料庫 `starry_id_db` 的 schema、migration、資料搬移與稽核工具。

## 資料責任

- 中央會員身份與固定基本資料：Starry ID / `starry_id_db`
- App 專屬業務資料：各 App 自己的 Repo 與資料庫
- 使用同一個穩定 `user_id` 連結繁星生態系各 App

## 核心安全原則

- Google `sub` 是 provider identity 主鍵；Email 只作已驗證比對與舊會員遷移證據。
- Email 與 Google subject 若指向不同 stable user_id，停止自動合併。
- App 專屬角色、封鎖與上傳權限放在 `app_memberships`。
- 中央 profile 與關係欄位修改寫入 `profile_audit_logs`。
- EchoStars 來源資料不因本 Repo 獨立而刪除。
- 所有正式資料庫結構異動使用可重跑 migration。

## Cloudflare

中央 D1：`starry_id_db`

目前正式網站與 Worker 路由仍維持既有架構；把資料庫程式碼移入此 Repo **不代表切換正式流量，也不代表建立新的 D1**。

## 主要檔案

- `schema.sql`：中央 D1 基礎 schema
- `migrations/`：歷次 migration
- `migrateFromEchoStars.ts`：EchoStars → Starry ID 欄位與資料轉換
- `remoteMigrate.ts`：Cloudflare D1 遠端搬移與驗證工具
- `provision-and-audit.sh`：建立／升級 schema 與資料品質稽核
- `ECHOSTARS_FIELD_MAPPING.md`：欄位責任與搬移對照

## 首次獨立來源

由 `yukidu/Echo-Starry` main `35300406dd72506ae4ac39f2440e031358da2b38`（v233）拆出。Echo-Starry 本身未因此次拆分而修改。
