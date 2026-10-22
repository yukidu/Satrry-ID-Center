-- 2026-10-23 | non-PII release catalog only.
-- Purpose: keep storefront links for two Apple developer accounts segregated.
-- No bundle id, Team ID, Connect URL, or public App Store URL has been verified.
-- ON CONFLICT DO NOTHING protects future filled-in listing metadata.
INSERT INTO ios_starry_release_links(app_key,app_name,listing_status,notes,created_at_ms,updated_at_ms)
VALUES
 ('echostars','繁星回聲','planned','Starry 生態系；iOS 開發者帳號 Starry.phd',strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('gostarry','繁星任意門','planned','Starry 生態系；尚待 iOS 上架資料核實',strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('downloadstarry','繁星捕手','planned','Starry 生態系；尚待 iOS 上架資料核實',strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('boxstarry','繁星視界','planned','Starry 生態系；尚待 iOS 上架資料核實',strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('starry-sync','繁星共振','planned','Starry 生態系；尚待 iOS 上架資料核實',strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('starry-ai','繁星副官','planned','Starry 生態系；尚待 iOS 上架資料核實',strftime('%s','now')*1000,strftime('%s','now')*1000)
ON CONFLICT(app_key) DO NOTHING;

INSERT INTO ios_hglobal_release_links(app_key,app_name,listing_status,notes,created_at_ms,updated_at_ms)
VALUES
 ('central-id','中央會員 ID 入口','planned','歸 hglobal1985 Apple 開發者帳號，中央 user_id 仍由共用後端管理',strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('hglobal-home','寰宇全球 H-Global 首頁','planned','H-Global 生態系；尚待 iOS 上架資料核實',strftime('%s','now')*1000,strftime('%s','now')*1000)
ON CONFLICT(app_key) DO NOTHING;
