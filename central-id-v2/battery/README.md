# Starry Battery API Gateway (開發分支，尚未正式發布)

* Starry 生態系專用，預期約 30 款 App 可分別註冊 App ID、Hash 金鑰、獨立 scope 與啟停。H-Global 不呼叫此 Gateway。
* Worker Gateway 需要 `BATTERY_DB`（專屬 D1）＋`CENTRAL_AUTH_VERIFY`（私有 Service Binding）兩項才能讀取錢包；變更電池操作另須 `BATTERY_ENGINE` 受保護 Service Binding。缺少即 503，絕不繞過驗證。
* 手機與瀏覽器絕不持有 App API Key；只有各 Starry App 受信後端可呼叫。HTTP API 無跨域讀取開放。
* `Authorization: Bearer <server-app-secret>`、`X-Battery-App-Id` 與 `X-Central-Access-Token` 均必須由後端傳入。中央驗證端需回傳 `{active:true,brand_allowed:true,user_id,suspended:false}` 才允許。
* `GET /v1/battery/wallet`、`GET /v1/battery/ledger`：只能讀中央驗證的本人錢包與交易；不接受 URL 傳入其他 user_id。
* `POST /v1/battery/reserve`、`commit`、`release`：Gateway 將驗證主體交給私有 Engine；Engine 尚未實作交易原子性/FEFO，因此未綁定時只回 503，絕不可先開放正式扣抵。
* 隔離測試需驗證 30 App 不互相冒用、上線/停用與 scopes、JWT 中央驗證錯誤、429、FEFO、逾時 3 分鐘全退與晚到成功不扣；跨 D1 無法採用單筆 ACID。
* 目前 D1 Schema 與 Gateway 是**開發實作候選**，沒有預設部署；需要先建立並驗證實際 Battery Engine 才能啟用寫入。
