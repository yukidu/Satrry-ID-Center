(async()=>{
 const status=document.getElementById("state"),say=t=>{if(status)status.textContent=t};
 const logout=document.getElementById("logout");
 if(logout){
   logout.addEventListener("click",async()=>{
     say("正在安全登出…");
     try{
       const r=await fetch("/api/logout",{method:"POST",credentials:"same-origin"});
       if(!r.ok)throw Error("logout_failed");
       location.replace("/login");
     }catch{say("登出未完成，請重新嘗試。");}
   });
   return;
 }
 const target=document.getElementById("google-button");
 if(!target)return;
 let challenge;
 try{
   const res=await fetch("/api/v1/portal/challenge",{credentials:"same-origin",cache:"no-store"});
   if(!res.ok)throw Error("challenge_unavailable");
   challenge=await res.json();
 }catch{say("登入安全驗證暫時無法建立，請重新整理頁面。");return;}
 let attempts=0;
 const boot=()=>{
   if(!window.google?.accounts?.id){
     if(attempts++<36){setTimeout(boot,250);return;}
     say("無法載入 Google 登入元件。請確認瀏覽器與 Google OAuth 設定。");return;
   }
   google.accounts.id.initialize({
     client_id:challenge.google_client_id,
     nonce:challenge.nonce,
     auto_select:false,
     ux_mode:"popup",
     callback:async googleResponse=>{
       if(!document.getElementById("consent").checked){
         say("請先勾選同意，再點選 Google 登入。");return;
       }
       say("正在驗證 Google 身分並建立安全 Session…");
       try{
         const res=await fetch("/api/google-sync",{
           method:"POST",credentials:"same-origin",
           headers:{"Content-Type":"application/json"},
           body:JSON.stringify({credential:googleResponse.credential,appId:"central",termsAccepted:true})
         });
         const data=await res.json();
         if(!res.ok||data.authenticated!==true)throw Error(data.error||"login_failed");
         location.replace("/dashboard");
       }catch(e){
         say("登入未完成（"+String(e.message||"unknown")+"）。請重新整理後重試。");
       }
     }
   });
   google.accounts.id.renderButton(target,{theme:"outline",size:"large",shape:"pill",text:"signin_with",locale:"zh_TW",width:270});
 };
 boot();
})();
