# 中央會員 ID｜Google 登入入口與會員控制台｜2026-10-23

## 最新實作範圍（請以 Production 檢查結果判斷實際上線）

使用者反映 id.hglobal1985.com 只顯示「尚未啟用」且沒有登入按鈕；本次補上真實中央網站網頁路由，而非僅有 Echo API：

- 公開首頁顯示「Google 會員登入」連結，指向 /login。
- GET /login：獨立手機優先登入頁，使用 Google Identity Services (GIS) 按鈕。首次登入必須勾選同意建立中央訪客帳號。
- GET /api/v1/portal/challenge：產生密碼學安全隨機 nonce，D1 只存 SHA-256 摘要；以 HttpOnly Secure SameSite=Lax Cookie 傳遞，600 秒有效。
- POST /api/v1/portal/google-login：只接受新中央站同源 POST、同意聲明、Google 官方 RS256 JWKS 簽章／aud／iss／iat／exp 驗證、Google JWT nonce 綁定及 D1 原子一次性使用。
- 若 Google subject 存在於舊 verified Starry provider 映射，沿用精準的舊中央 user_id，並且先從舊正式 D1 只讀確認未停權、subject 仍有效；**不用 Email 或姓名自動合併**。
- 若是新 Google subject，建立不可變 UUID user_id、auth_provider_links、member_profiles、consent_records；identity_users.membership_status 一律 pending，不自動核准會員、獎銜或管理員角色。
- 新的中央 Portal 與 Echo compatibility Session 分開。auth_sessions 只存 token SHA-256、auth_version、效期、撤銷時間；HttpOnly Secure SameSite=Lax Session Cookie。
- GET /dashboard 只允許已驗證本人登入，顯示最少必要資料與未核准提醒；POST /api/v1/portal/logout 可撤銷本裝置 Session；GET /api/v1/portal/me 只在登入後可讀自己的身分。
- 每次已登入請求重新檢查中央停權／刪除／auth_version；原有舊會員另從原 Starry D1 只讀確認 active。舊 Echo API、DB、電池、權限流程不改動。

## Cloudflare D1

新增獨立遷移 central-id-v2/migrations/0004_central_google_portal_identity.sql，含工程 v0.2 命名的：
- identity_users
- auth_provider_links
- auth_sessions
- education_centers
- member_profiles
- consent_records
- central_login_challenges

此階段**沒有**把使用者舊版獎銜、身分審核、職務自動批准或複製舊 cookie/session。正式會員資格與獎銜是兩個待人工審核的獨立判斷。

## 尚待外部設定／不得誤稱完整

- 現用 Google Web Client ID 為原 Starry 既有客戶端。**Google Cloud Auth Platform 必須核實已允許 JavaScript origin https://id.hglobal1985.com**，否則網頁即使顯示按鈕也可能報「origin not allowed」。沒有 Google 帳號擁有人在真實瀏覽器操作，CI 無法證實 Google Popup 在正式手機和 PWA 可以正常開啟。
- Apple 網頁登入需 Apple Developer Services ID、Sign in with Apple Domain Verification、Team ID／私密金鑰及正式回呼網址；目前沒有這些憑證，所以 **Apple 按鈕不啟用，不產生假的 Apple 登入流程**。Apple 開發者帳號申請完成 ≠ Apple 網頁 OAuth 已設定。
- 本階段只有「Google 中央帳號驗證、待審核訪客建檔、查看自己的身分與登出」，**不等於全部中央會員管理系統完成**。尚待會員中心自助完整資料、43 階獎銜申請與分流審核、兩名最高管理員保護、各中心權限、Apple 帳號綁定、夫妻、公開名片／訂閱／通知／申訴及 App 全面切換 E2E。
- 個別 Starry/H-Global App 原業務權限仍由各 App 自己驗證。Echo only SSO 的 ready=true for integration 不代表其他 App 都完成。
- 不得把 Live HTTP Smoke 的「nonce endpoint 可用」等同真正 Google 生產 JWT 正常登入；需要由真實 Google 帳號實機驗收。

## 回退

- 保留舊 Echo Worker、Google 登入及舊資料庫完全不動。
- 主頁、login、dashboard 均由 hglobal-central-id-v2 Worker 處理；若發現異常，可將新 Worker 安全回滾到前版部署，舊 id.starry.phd 不受影響。
- 新註冊訪客從不自動取得審核權限，因此可單獨停用 Portal 路由；不得清空正式 D1 或刪除任何使用者資料以處理網頁故障。
