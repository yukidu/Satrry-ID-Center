// Separate no-secret browser script for H-Global immediate center edits.
export const centerClientCode = `(()=>{
 const picker=document.getElementById("center-code"),button=document.getElementById("save-center");
 if(!picker||!button)return;
 const status=document.getElementById("center-save-status"),editor=document.getElementById("profile-editor");
 const show=v=>{if(status)status.textContent=v};
 button.addEventListener("click",async()=>{
  const centerCode=picker.value;
  if(!/^EC-0(0[3-9]|[12][0-9]|3[012])$/.test(centerCode)){show("請先選擇有效的教育中心。");return;}
  button.disabled=true;show("正在更新教育中心…");
  try{
   const version=Number(editor?.dataset.version)||1;
   const res=await fetch("/api/v1/portal/center",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({centerCode,version})});
   const data=await res.json();
   if(!res.ok||data.saved!==true)throw Error(data.error||"save_failed");
   if(editor)editor.dataset.version=String(data.version);
   if(data.relogin){show("✓ 教育中心已更新、原中心權限已撤銷。正在重新登入…");setTimeout(()=>location.replace("/login"),850);}
   else show("✓ 教育中心已儲存。");
  }catch(e){show("更新失敗（"+String(e.message||"unknown")+"），資料尚未儲存。請重新整理再試。");}
  finally{button.disabled=false;}
 });
})();`;
