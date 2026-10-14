-- v224: Starry ID 中央 Schema-driven 會員欄位規則
-- 原則：欄位規則與簡單擴充欄位由中央維護；各 App 只負責呈現。

CREATE TABLE IF NOT EXISTS profile_field_schema (
  fieldKey TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  inputType TEXT NOT NULL DEFAULT 'text',
  required INTEGER NOT NULL DEFAULT 0,
  maxLength INTEGER,
  optionCategory TEXT,
  storageMode TEXT NOT NULL DEFAULT 'native',
  userEditable INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1,
  placeholder TEXT NOT NULL DEFAULT '',
  helpText TEXT NOT NULL DEFAULT '',
  validationJson TEXT NOT NULL DEFAULT '{}',
  updatedAt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS profile_field_schema_active
  ON profile_field_schema(isActive,sortOrder,fieldKey);

CREATE TABLE IF NOT EXISTS profile_extension_values (
  userId TEXT NOT NULL,
  fieldKey TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId,fieldKey),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profile_extension_values_user
  ON profile_extension_values(userId,fieldKey);

CREATE TABLE IF NOT EXISTS profile_schema_meta (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version INTEGER NOT NULL DEFAULT 1,
  updatedAt INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO profile_schema_meta(id,version,updatedAt) VALUES (1,1,0);

-- 既有繁星回聲會員基本資料欄位。新增普通欄位時可使用 storageMode='extension'，
-- 不需要先修改各 App 的資料表即可由 Schema-driven UI 顯示與儲存。
INSERT OR IGNORE INTO profile_field_schema
(fieldKey,label,inputType,required,maxLength,optionCategory,storageMode,userEditable,sortOrder,isActive,placeholder,helpText,validationJson,updatedAt)
VALUES
('name','姓名或暱稱','text',1,50,NULL,'native',1,10,1,'請輸入姓名或暱稱','繁星生態系共用姓名','{}',0),
('amwayId','直銷商編號','text',0,32,NULL,'native',1,20,1,'例：12345678','繁星生態系共用會員識別資料','{"pattern":"^[A-Za-z0-9_-]*$"}',0),
('phone','手機','tel',0,30,NULL,'native',1,30,1,'請輸入手機號碼','','{}',0),
('residence','居住地','select',0,40,'residence','native',1,40,1,'請選擇居住地','','{}',0),
('center','直銷商中心','select',0,60,'center','native',1,50,1,'請選擇中心','','{}',0),
('rank','最高獎銜','select',0,60,'rank','native',1,60,1,'請選擇獎銜','獎銜仍依既有人工審核規則生效','{}',0),
('joinReason','初次如何認識安麗？','select',0,80,'joinReason','native',1,70,1,'請選擇','','{}',0),
('stayReason','什麼原因留在安麗？','select',0,100,'stayReason','native',1,80,1,'請選擇','','{}',0),
('sponsor','推薦人','relation',0,80,NULL,'native',1,90,1,'輸入推薦人姓名','可由中央會員目錄精準綁定','{}',0),
('platinumUpline','上手白金','relation',0,80,NULL,'native',1,100,1,'輸入或搜尋白金領袖','可由中央會員目錄精準綁定','{}',0),
('diamondUpline','上手鑽石','relation',0,80,NULL,'native',1,110,1,'輸入或搜尋鑽石領袖','可由中央會員目錄精準綁定','{}',0),
('birthday','西元生日','date',0,10,NULL,'native',1,120,1,'YYYY-MM-DD','生日由伺服器計算星座、天賦數與命數','{"dateMin":"1900-01-01"}',0),
('motto','座右銘','textarea',0,200,NULL,'native',1,130,1,'寫下你的座右銘','','{}',0);

-- 任一欄位規則或中央下拉選項變更，Schema 版本自動 +1。
DROP TRIGGER IF EXISTS profile_schema_field_insert;
DROP TRIGGER IF EXISTS profile_schema_field_update;
DROP TRIGGER IF EXISTS profile_schema_field_delete;
DROP TRIGGER IF EXISTS profile_schema_option_insert;
DROP TRIGGER IF EXISTS profile_schema_option_update;
DROP TRIGGER IF EXISTS profile_schema_option_delete;

CREATE TRIGGER profile_schema_field_insert AFTER INSERT ON profile_field_schema
BEGIN
  UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
END;
CREATE TRIGGER profile_schema_field_update AFTER UPDATE ON profile_field_schema
BEGIN
  UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
END;
CREATE TRIGGER profile_schema_field_delete AFTER DELETE ON profile_field_schema
BEGIN
  UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
END;
CREATE TRIGGER profile_schema_option_insert AFTER INSERT ON profile_option_values
BEGIN
  UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
END;
CREATE TRIGGER profile_schema_option_update AFTER UPDATE ON profile_option_values
BEGIN
  UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
END;
CREATE TRIGGER profile_schema_option_delete AFTER DELETE ON profile_option_values
BEGIN
  UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
END;
