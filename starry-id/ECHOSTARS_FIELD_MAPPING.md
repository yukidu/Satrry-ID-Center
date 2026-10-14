# Starry ID｜EchoStars 會員欄位搬移對照

基準：EchoStars `main` v200 / commit `741f51c9d32d213a43c85b228f3844446a78df63`。

## 搬移原則

1. 代表「這個人本身」且未來其他 App 也會使用的資料，進 Starry ID 中央會員庫。
2. 只屬於 EchoStars 的權限、使用次數、播放/收藏/學習紀錄，留在 EchoStars。
3. 現有 EchoStars `users.id` 直接保留為中央 `users.id`，不另外產生新 ID，避免既有 App 資料重新歸戶。
4. Google `googleSubject` 是主要外部身份鍵；Email 是聯絡資料與兼容查找鍵，不再當永久身份主鍵。
5. 推薦人/上線如果舊資料只有姓名文字，先保存文字，不因同名而自動誤綁。
6. 搬移完成前不刪任何 EchoStars 原始會員資料。

## 直接搬到中央會員中心

| EchoStars 欄位 | Starry ID | 說明 |
|---|---|---|
| `id` | `users.id` | 原 ID 直接升格為 Starry user id |
| `email` | `users.primaryEmail` | 正規化後唯一 |
| `googleSubject` | `identities.providerSubject` | `provider=google`，主要 Google 身份鍵 |
| `name` | `profiles.name` | 共用姓名 |
| `avatar` | `profiles.avatar` | 自訂頭像優先 |
| `googleAvatar` | `profiles.googleAvatar` | Google 原始頭像 |
| `amwayId` | `profiles.amwayId` | 固定會員/直銷商識別資料 |
| `phone` | `profiles.phone` | 共用基本資料 |
| `residence` | `profiles.residence` | 共用基本資料 |
| `center` | `profiles.center` | 共用組織基本資料 |
| `rank` | `profiles.rank` | 組織共用獎銜 |
| `approvedRank` | `profiles.approvedRank` | 共用已核准獎銜 |
| `rankApproved` | `profiles.rankApproved` | 共用獎銜核准狀態 |
| `rankAuditStatus` | `profiles.rankAuditStatus` | 共用獎銜審核狀態 |
| `rankAuditType` | `profiles.rankAuditType` | 共用獎銜審核類型 |
| `rankUpdatedAt` | `profiles.rankUpdatedAt` | 共用獎銜異動時間 |
| `joinReason` | `profiles.joinReason` | 長期個人資料 |
| `stayReason` | `profiles.stayReason` | 長期個人資料 |
| `birthday` | `profiles.birthday` | 優先來源 |
| `birthDate` | `profiles.birthday` | `birthday` 空白時才作 fallback |
| `motto` | `profiles.motto` | 座右銘 |
| `zodiac` | `profiles.zodiac` | 共用個人資料 |
| `talentNumber` | `profiles.talentNumber` | 共用個人資料 |
| `lifeNumber` | `profiles.lifeNumber` | 共用個人資料 |
| `registerDate` | `profiles.registerDate` | 保留最初註冊日期 |
| `auditedBy` | `profiles.auditedBy` | 因獎銜為中央資料，審核來源一併中央化 |
| `auditedAt` | `profiles.auditedAt` | 同上 |

## 搬到中央關係表，但不直接當文字欄位互相覆蓋

| EchoStars 欄位 | Starry ID | 做法 |
|---|---|---|
| `sponsor` | `member_relationships` | `relationType=sponsor`；先保存 `legacyLabel`，確認唯一會員後才填 `relatedUserId` |
| `platinumUpline` | `member_relationships` | `relationType=platinum_upline`；優先沿用既有 organization/upline 結構判定 |
| `diamondUpline` | `member_relationships` | `relationType=diamond_upline`；同上 |

## 留在 EchoStars / 只建立 App membership

| EchoStars 欄位 | 去向 | 原因 |
|---|---|---|
| `role` | `app_memberships.role` | EchoStars 角色，不代表其他 App 權限 |
| `isContributor` | `app_memberships.isContributor` | EchoStars 上傳/貢獻權限 |
| `isAdminUser` | `app_memberships.isAdminUser` | EchoStars 管理權限 |
| `canUpload` | `app_memberships.canUpload` | EchoStars 音檔上傳權限 |
| `isBlocked` | `app_memberships.status` | 先視為 EchoStars 封鎖，避免錯誤封鎖所有未來 App |
| `playCount` | EchoStars 原 DB | 使用行為，不是固定個人資料 |
| `lastActive` | EchoStars 原 DB | 應以每個 App 各自記錄活躍時間 |
| `avatarUploadCount` | EchoStars 原 DB | EchoStars 限額/行為欄位 |
| `avatarUploadMonth` | EchoStars 原 DB | 同上 |
| `profileEditCount` | EchoStars 原 DB | EchoStars 編輯限額/行為欄位 |
| `profileEditMonth` | EchoStars 原 DB | 同上 |

## 暫不自動搬成共用公開資料

`notes` 暫時保留在 EchoStars。它比較像管理備註，不應未經重新定義就讓所有未來 App 共用或看見。若之後確認它是組織共用管理資料，再移到中央的私密管理區。

## 現況特別注意

- `schema.sql` 的基礎 `users` 表目前沒有明列 `googleSubject` 與 `motto`，但正式 Worker 會在 runtime migration 中補欄位。Starry ID schema 已直接正式定義，避免未來再依賴執行時補欄位。
- EchoStars 正式 Google 登入已使用 Google JWT 的 `sub`，並用 `googleSubject` + 正規化 Email 防止錯誤綁定；這一套邏輯會成為 Starry ID 身份遷移的基礎。
- 現有 `organization_groups`、`organization_members`、`upline_bindings` 已經提供白金/鑽石上線的較可靠關係模型，搬移時會優先使用該結構，不單靠姓名猜測。

## 搬移順序

1. 建立中央 Starry ID D1 schema。
2. 對 EchoStars `users` 做只讀資料品質檢查。
3. 建立 migration batch，逐筆 idempotent upsert 中央 `users` / `identities` / `profiles`。
4. 建立 `legacy_links(sourceApp='echostars')`。
5. 把 EchoStars 角色/權限寫入 `app_memberships(appId='echostars')`。
6. 匯入推薦/上線關係；無法唯一判斷者只保存 legacyLabel 並列為待處理。
7. 核對筆數、Email、Google subject、會員 ID、獎銜與關係資料。
8. EchoStars 改成雙寫/中央讀取過渡期。
9. 驗證穩定後，停止 EchoStars 對共用 profile 欄位的直接寫入。
