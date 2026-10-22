# 中央會員 ID｜兩組 Apple Developer 帳號 iOS 上架資料分隔（2026-10-23）

## 最新正式決議（取代 2026-10-22 Apple 一帳號過渡規則）

使用者已**申請**兩組 Apple Developer Program 開發者帳號，代稱 `Starry.phd`、`Hglobal1985`：

| 生態系 | Apple Developer 帳號代稱 | 發行資料獨立表 | Google 原生 Sheets 登記表 |
|---|---|---|---|
| Starry | Starry.phd | `ios_starry_release_links` | https://docs.google.com/spreadsheets/d/1sC6hja7dYq6tyBwrFf90eAWEHoT5bNJJFxS4-wQhm2s/edit |
| H-Global（含中央 ID 入口 App） | Hglobal1985 | `ios_hglobal_release_links` | https://docs.google.com/spreadsheets/d/1-Fa9fIfXngsje6OvoCux0c7-hvM3Dlt3Vdi5e5sv8G4/edit |

兩個帳號的「已申請」不能等同 Apple 已核准、Team ID 已取得、App Store listing 已上線。勿將 `Starry.phd` 誤作一定會出現在 App Store 的公開賣方名稱。

## 規劃 App Key

Starry.phd (6): `echostars` 繁星回聲、`gostarry` 繁星任意門、`downloadstarry` 繁星捕手、`boxstarry` 繁星視界、`starry-sync` 繁星共振、`starry-ai` 繁星副官。

Hglobal1985 (2): `central-id` 中央會員 ID 入口、`hglobal-home` 寰宇全球 H-Global 首頁。

只建立規劃紀錄，**尚未取得各 App 官方 Bundle ID、Apple Team ID、公開 App Store URL、App Store Connect 深連結**，一律保持空值，狀態 `planned`。

## 資料庫與安全

- 遷移 SQL：`migrations/0002_ios_separate_apple_developer_accounts.sql`。
- 初始化資料：`migrations/0003_ios_release_catalog_seed.sql`，重跑不覆寫既有上架資訊。
- 兩張表都有固定 `developer_account_slug` 且 CHECK 分帳，不允許跨帳號記錄；要轉移 App 歸屬必須經明確資料遷移與稽核，不能直接把另一個帳號寫進同一張表。
- 商店公開 URL 必須是 `https://apps.apple.com/`；App Store Connect URL 必須是 `https://appstoreconnect.apple.com/`；沒填公開網址的 App 不能標記 `published`。
- 本架構**只分隔 iOS App 發行連結**，不分割中央 `user_id`、會員資格、Google＋Apple OAuth 連結、獎銜審核；Starry Battery 僅由 Starry 應用存取，不向 H-Global 暴露。
- 兩份 Google 試算表是營運維護登記表，**目前沒有自動同步到 Cloudflare D1**。正式 App Store 連結要由官方核實再透過受控寫入流程存入 D1，絕不開放匿名寫入，也不將 Apple API 密鑰放入 Sheet。
- 只有通過 Apple 官方審核後才可按實況把 App 發布狀態改成 approved / published。
- GitHub CI 內以 SQLite 測試雙帳號資料分離、重跑初始化冪等、未驗證網址不得標 published、不得填假網址與 schema integrity。
- 已有 Echo-Starry API 相容層與中央會員 D1 保持不變；**尚未宣布 Echo API 可正式切換**。

## 連動文件

- [01 正式架構](https://docs.google.com/document/d/1EfnSzUBxLUQiiWi5mVLNQ23-Cm7rZtvOoHzUPTCmx4E/edit)：追加 2026-10-23 最新兩 Apple 帳號覆蓋註記。
- [02 決議與進度](https://docs.google.com/document/d/1E7tsLHEdMxT2nAXktidYzh8hJ50_RCFpoPhJNQ2epnc/edit)：追加操作與待核實項目。
