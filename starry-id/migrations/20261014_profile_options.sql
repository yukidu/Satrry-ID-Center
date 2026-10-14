-- v220: Starry ID 中央會員基本資料選項
-- 來源：繁星回聲既有會員基本資料選項。
-- Runtime 亦會以 INSERT OR IGNORE 補齊，確保既有正式 D1 可安全升級。

CREATE TABLE IF NOT EXISTS profile_option_values (
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  sortOrder INTEGER NOT NULL,
  isActive INTEGER NOT NULL DEFAULT 1,
  sourceApp TEXT NOT NULL DEFAULT 'starry-id',
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(category,value)
);
CREATE INDEX IF NOT EXISTS profile_option_values_active
  ON profile_option_values(category,isActive,sortOrder);

INSERT OR IGNORE INTO profile_option_values(category,value,sortOrder,isActive,sourceApp,updatedAt) VALUES
('residence','臺北',0,1,'echostars',0),('residence','新北',1,1,'echostars',0),('residence','基隆',2,1,'echostars',0),('residence','桃園',3,1,'echostars',0),('residence','新竹',4,1,'echostars',0),('residence','苗栗',5,1,'echostars',0),('residence','臺中',6,1,'echostars',0),('residence','彰化',7,1,'echostars',0),('residence','南投',8,1,'echostars',0),('residence','雲林',9,1,'echostars',0),('residence','嘉義',10,1,'echostars',0),('residence','臺南',11,1,'echostars',0),('residence','高雄',12,1,'echostars',0),('residence','屏東',13,1,'echostars',0),('residence','宜蘭',14,1,'echostars',0),('residence','花蓮',15,1,'echostars',0),('residence','臺東',16,1,'echostars',0),('residence','澎湖',17,1,'echostars',0),('residence','金門',18,1,'echostars',0),('residence','連江',19,1,'echostars',0),('residence','海外',20,1,'echostars',0),
('center','無',0,1,'echostars',0),('center','非寰宇體系',1,1,'echostars',0),('center','飛登',2,1,'echostars',0),('center','南京',3,1,'echostars',0),('center','自強',4,1,'echostars',0),('center','明星',5,1,'echostars',0),('center','民權',6,1,'echostars',0),('center','中山',7,1,'echostars',0),('center','桃園',8,1,'echostars',0),('center','新竹',9,1,'echostars',0),('center','台中',10,1,'echostars',0),('center','彰化',11,1,'echostars',0),('center','員林',12,1,'echostars',0),('center','嘉義',13,1,'echostars',0),('center','台南',14,1,'echostars',0),('center','高雄',15,1,'echostars',0),('center','屏東',16,1,'echostars',0),('center','香港',17,1,'echostars',0),('center','澳門',18,1,'echostars',0),('center','中國',19,1,'echostars',0),('center','美國',20,1,'echostars',0),('center','澳洲',21,1,'echostars',0),('center','加拿大',22,1,'echostars',0),('center','英國',23,1,'echostars',0),('center','義大利',24,1,'echostars',0),('center','日本',25,1,'echostars',0),('center','韓國',26,1,'echostars',0),('center','馬來西亞',27,1,'echostars',0),('center','泰國',28,1,'echostars',0),('center','越南',29,1,'echostars',0),('center','印尼',30,1,'echostars',0),
('rank','無',0,1,'echostars',0),('rank','3%',1,1,'echostars',0),('rank','6%',2,1,'echostars',0),('rank','9%',3,1,'echostars',0),('rank','12%',4,1,'echostars',0),('rank','12%初階',5,1,'echostars',0),('rank','15%',6,1,'echostars',0),('rank','15%銅章',7,1,'echostars',0),('rank','18%',8,1,'echostars',0),('rank','21%',9,1,'echostars',0),('rank','銀章',10,1,'echostars',0),('rank','金章',11,1,'echostars',0),('rank','白金',12,1,'echostars',0),('rank','紅寶石',13,1,'echostars',0),('rank','創辦人白金',14,1,'echostars',0),('rank','創辦人紅寶石',15,1,'echostars',0),('rank','藍寶石',16,1,'echostars',0),('rank','創辦人藍寶石',17,1,'echostars',0),('rank','明珠',18,1,'echostars',0),('rank','翡翠',19,1,'echostars',0),('rank','創辦人翡翠',20,1,'echostars',0),('rank','鑽石級以上',21,1,'echostars',0),
('joinReason','尚未加入',0,1,'echostars',0),('joinReason','購買產品',1,1,'echostars',0),('joinReason','事業',2,1,'echostars',0),('joinReason','捧場人情',3,1,'echostars',0),('joinReason','商業餐會',4,1,'echostars',0),('joinReason','匹克球',5,1,'echostars',0),('joinReason','參加吃喝玩樂活動',6,1,'echostars',0),('joinReason','參加營養課',7,1,'echostars',0),('joinReason','參加美容課',8,1,'echostars',0),('joinReason','參加生涯規劃',9,1,'echostars',0),('joinReason','參加其它課程',10,1,'echostars',0),('joinReason','參加大會',11,1,'echostars',0),('joinReason','忘記了',12,1,'echostars',0),('joinReason','其他',13,1,'echostars',0),
('stayReason','商業餐會',0,1,'echostars',0),('stayReason','匹克球',1,1,'echostars',0),('stayReason','可以增加收入',2,1,'echostars',0),('stayReason','打造自己的事業與團隊',3,1,'echostars',0),('stayReason','課程活動多元豐富',4,1,'echostars',0),('stayReason','認識人脈',5,1,'echostars',0),('stayReason','學習健康',6,1,'echostars',0),('stayReason','助人',7,1,'echostars',0),('stayReason','擁有舞台',8,1,'echostars',0),('stayReason','熱愛產品好用',9,1,'echostars',0),('stayReason','喜歡分享好東西',10,1,'echostars',0),('stayReason','其它',11,1,'echostars',0);
