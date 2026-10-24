// Central ID Cloudflare read-only preflight. NEVER deploy or mutate resources.
// Battery-owned workers, D1, R2 and secrets must never be touched by this tool.
import {readFile} from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";
const manifest=JSON.parse(await readFile(new URL("./central-targets.json",import.meta.url),"utf8"));
const forbiddenService=/^starry-battery-/i;
const requiredBindings=["CENTRAL_DB","LEGACY_AUTH_DB"];
export async function verifyCentralTarget({target,accountId,token,request=fetch,config=manifest}){
 if(!["preview","production"].includes(target))throw Error("invalid_target");
 if(!/^[a-f\d]{32}$/i.test(accountId||""))throw Error("invalid_account_id");
 if(typeof token!=="string"||token.length<10)throw Error("central_api_token_unavailable");
 const expected=config[target],name=expected?.worker;
 if(!name||!name.startsWith("hglobal-central-id-v2"))throw Error("non_central_worker");
 const base="https://api.cloudflare.com/client/v4/accounts/"+accountId;
 const get=async route=>{
  const response=await request(base+route,{method:"GET",headers:{Authorization:"Bearer "+token}});
  if(!response.ok)throw Error("read_only_cloudflare_api_status_"+response.status);
  const json=await response.json();
  if(!json.success)throw Error("cloudflare_api_rejected");
  return json.result;
 };
 const settings=await get("/workers/scripts/"+encodeURIComponent(name)+"/settings");
 const bindings=settings?.bindings;
 if(!Array.isArray(bindings))throw Error("missing_binding_snapshot");
 const byName=new Map(bindings.map(b=>[b.name,b]));
 for(const key of requiredBindings){
  if(byName.get(key)?.type!=="d1")throw Error("missing_required_central_d1_binding_"+key);
 }
 const actualId=byName.get("CENTRAL_DB").id||byName.get("CENTRAL_DB").database_id;
 if(actualId!==expected.d1_id)throw Error("wrong_central_d1_target");
 if(actualId===config.forbidden.d1_ids[0])throw Error("battery_d1_target");
 for(const b of bindings){
  if(forbiddenService.test(b.name||"")||forbiddenService.test(b.service||""))throw Error("battery_binding_found");
  if(b.type==="d1"&&config.forbidden.d1_ids.includes(b.id||b.database_id))throw Error("battery_d1_binding_found");
 }
 if(target==="production"){
  const legacy=byName.get("LEGACY_AUTH_DB").id||byName.get("LEGACY_AUTH_DB").database_id;
  if(legacy!==config.production.legacy_d1_id)throw Error("legacy_auth_binding_changed");
 }
 const centralD1=await get("/d1/database/"+encodeURIComponent(expected.d1_id));
 if(!centralD1?.uuid||centralD1.uuid!==expected.d1_id)throw Error("central_d1_not_confirmed");
 const deployments=await get("/workers/scripts/"+encodeURIComponent(name)+"/deployments");
 const current=deployments?.deployments?.[0];
 if(!current?.versions?.[0]?.version_id)throw Error("missing_rollback_source");
 return {target,worker:name,central_db:centralD1.name,current_version:current.versions[0].version_id,rollback_source_available:true,only_read_operations:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const target=process.argv[2],accountId=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN_CENTRAL;
 verifyCentralTarget({target,accountId,token}).then(result=>{
  process.stdout.write(JSON.stringify(result)+"\n");
 },err=>{process.stderr.write("Central Cloudflare preflight blocked: "+String(err.message)+"\n");process.exitCode=1;});
}
