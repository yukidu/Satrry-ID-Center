// Central API interactive self-test only; does not expose tokens in the DOM,
// browser storage, URLs, or logs. Never shows another member's records.
const html=String.raw`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>中央會員 API｜正式身分驗證自測</title>
<style>
:root{font-family:system-ui,-apple-system,"Noto Sans TC","PingFang TC",sans-serif;color:#19334d;background:#f3f7fb}
*{box-sizing:border-box}body{margin:0}header{background:#102f51;color:white;padding:18px 24px}header a{color:white;text-decoration:none}
main{max-width:780px;margin:38px auto;padding:0 20px}.card{background:white;padding:30px;border:1px solid #dfe8f2;border-radius:16px;box-shadow:0 10px 22px #0b233b0a}
h1{margin-top:0;font-size:clamp(24px,4vw,36px)}p{line-height:1.75;color:#526d82}.notice{padding:13px 16px;background:#eef5fb;border-left:4px solid #2a719f;border-radius:8px}
label{display:flex;gap:10px;align-items:flex-start;line-height:1.6;margin:20px 0}input{width:19px;height:19px;margin-top:3px}
button{background:#185a90;color:white;border:0;border-radius:9px;padding:12px 18px;font-size:15px;cursor:pointer;font-weight:700}
button:disabled{opacity:.5;cursor:default}#signin{margin:20px 0}pre{background:#f0f4f8;border:1px solid #d9e3ef;border-radius:12px;padding:18px;overflow-wrap:anywhere;white-space:pre-wrap;min-height:90px;line-height:1.65}
small{color:#718498}a{color:#17619b}
</style></head><body>
<header><a href="/">寰宇全球 H-Global｜中央會員 ID</a></header>
<main><section class="card">
<h1>中央會員 API｜正式自測</h1>
<p>這是中央會員正式環境的 <strong>本人身分查詢</strong> 自測頁。以 Google 驗證後，系統只讀取你自己的中央會員編號、姓名與會員資格，不查詢其他會員。</p>
<div class="notice">僅支援先前已在中央會員網站建立帳號的 Google 身分。此流程<strong>不會</strong>授予管理權限、獎銜或 Starry Battery 存取權。</div>
<label><input id="consent" type="checkbox"><span>我同意本次驗證 Google 身分，僅用於讀取我自己的中央會員基本資料。</span></label>
<button id="start">開始 API 身分驗證</button>
<div id="signin" aria-label="Google 登入"></div>
<p id="progress" role="status" aria-live="polite"></p>
<pre id="result" aria-label="自測結果">尚未進行驗證。</pre>
<p><small>驗證 Token 最多有效 5 分鐘；測試完成後會立即撤銷。頁面不保存 Token，也不會將會員資料公開搜尋。</small></p>
<p><a href="/dashboard">返回會員控制台</a>　<a href="/">返回首頁</a></p>
</section></main>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script src="/apps/api-test.js" defer></script>
</body></html>`;
const clientJs=String.raw`(function(){
 const button=document.getElementById("start"),agree=document.getElementById("consent"),
   status=document.getElementById("progress"),result=document.getElementById("result"),
   target=document.getElementById("signin");
 const say=s=>{status.textContent=s;};
 const call=async (url,options={})=>{
  const r=await fetch(url,{credentials:"omit",cache:"no-store",...options});
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"request_failed");
  return d;
 };
 button.addEventListener("click",async()=>{
  if(!agree.checked){say("請先勾選同意。");return;}
  button.disabled=true;result.textContent="正在準備驗證…";
  let challenge;
  try{
   challenge=await call("/api/v1/apps/challenge",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({app_id:"hglobal-web"})
   });
  }catch(e){say("無法建立驗證，請稍後再試："+e.message);button.disabled=false;return;}
  let attempt=0;
  function render(){
   if(!window.google?.accounts?.id){
    if(attempt++<40){setTimeout(render,250);return;}
    say("無法載入 Google 登入元件。");button.disabled=false;return;
   }
   google.accounts.id.initialize({
    client_id:challenge.google_client_id,nonce:challenge.nonce,
    auto_select:false,ux_mode:"popup",
    callback:async proof=>{
     let token=null;
     try{
      say("正在確認中央會員身分…");
      const issued=await call("/api/v1/apps/token",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({app_id:"hglobal-web",nonce:challenge.nonce,credential:proof.credential})
      });
      token=issued.access_token;
      const who=await call("/api/v1/apps/me",{
       headers:{"Authorization":"Bearer "+token,"X-Central-App":"hglobal-web"}
      });
      result.textContent=JSON.stringify({
       "中央 user_id":who.user_id,"會員姓名":who.display_name,
       "會員資格狀態":who.membership_status,
       "授權範圍":who.scope,
       "管理權限":who.management_authorized,
       "電池權限":who.battery_authorized
      },null,2);
      say("API 已成功驗證本人中央身分。");
     }catch(e){
      result.textContent="驗證未完成："+e.message+"\n如帳號尚未連結，請先到中央會員網站完成 Google 登入。";
      say("本次未取得正式會員資料。");
     }finally{
      if(token){
       try{await call("/api/v1/apps/revoke",{
        method:"POST",headers:{"Authorization":"Bearer "+token,"X-Central-App":"hglobal-web"}
       });}catch{say("Token 自動撤銷未確認；它將在 5 分鐘內到期。");}
      }
      button.disabled=false;
      if(window.google?.accounts?.id)google.accounts.id.disableAutoSelect();
     }
    }
   });
   target.replaceChildren();
   google.accounts.id.renderButton(target,{theme:"outline",size:"large",text:"signin_with",locale:"zh_TW",width:270});
   say("請按 Google 登入按鈕完成身分驗證。");
  }
  render();
 });
})();`;
const headers={
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
 "X-Frame-Options":"DENY","X-Robots-Tag":"noindex,nofollow,noarchive",
 "Referrer-Policy":"no-referrer"
};
export function demoRoute(request){
 const path=new URL(request.url).pathname;
 if(path!=="/apps/api-test"&&path!=="/apps/api-test.js")return null;
 if(request.method!=="GET")return new Response("method_not_allowed",{status:405,headers});
 if(path==="/apps/api-test.js")
  return new Response(clientJs,{headers:{...headers,"Content-Type":"application/javascript; charset=utf-8"}});
 return new Response(html,{headers:{...headers,
  "Content-Type":"text/html; charset=utf-8",
  "Content-Security-Policy":"default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'unsafe-inline'; img-src 'self' data: https://*.googleusercontent.com; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests"}});
}
