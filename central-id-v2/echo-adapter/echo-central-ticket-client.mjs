/**
 * Echo-Starry SERVER-SIDE adapter for the new central ID one-time ticket API.
 * Import into the Echo Worker only when doing a guarded migration test.
 * Do not deploy it directly as a public browser module.
 */
export const CENTRAL_ID_BASE = "https://id.hglobal1985.com";
const ID_RE=/^[A-Za-z0-9_-]{42,48}$/;
const MAX_JSON=8192;
export async function redeemCentralEchoTicket(code,{
  fetcher=fetch,base=CENTRAL_ID_BASE,timeoutMs=6500
}={}) {
  if(typeof code!=="string" || !ID_RE.test(code))return {ok:false,status:401,error:"invalid_ticket"};
  // Protect exact routing: no user-provided URL or arbitrary API base (SSRF).
  if(![CENTRAL_ID_BASE,"https://hglobal-central-id-v2-preview.yukidu.workers.dev"].includes(base))
    return {ok:false,status:503,error:"central_origin_untrusted"};
  let res;
  try {
    res=await fetcher(base+"/api/v1/compat/tickets/consume",{
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      redirect:"error",cache:"no-store",signal:AbortSignal.timeout(timeoutMs),
      body:JSON.stringify({appId:"echostars",code})
    });
  }catch {return {ok:false,status:503,error:"central_unreachable"};}
  if(!res.ok) {
    if([400,401,403].includes(res.status))return {ok:false,status:res.status,error:"central_ticket_denied"};
    return {ok:false,status:503,error:"central_service_unavailable"};
  }
  let data;
  try {
    const text=await res.text();
    if(text.length>MAX_JSON)throw Error("oversized_response");
    data=JSON.parse(text);
  }catch{return {ok:false,status:502,error:"central_response_invalid"};}
  if(data?.authenticated!==true ||
     data?.scope!=="legacy_echo_only" ||
     data?.membership_status!=="legacy_unverified" ||
     typeof data?.starryUserId!=="string" ||
     data.starryUserId.length===0||data.starryUserId.length>200||
     (data.echoLegacyUserId!==null && data.echoLegacyUserId!==undefined &&
      (typeof data.echoLegacyUserId!=="string" || data.echoLegacyUserId.length>200))) {
    return {ok:false,status:502,error:"central_contract_invalid"};
  }
  return {ok:true,status:200,centralUserId:data.starryUserId,
    echoLegacyUserId:data.echoLegacyUserId||null,scope:"legacy_echo_only"};
}
