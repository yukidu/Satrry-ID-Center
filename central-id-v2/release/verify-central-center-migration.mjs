// Central D1-only read-only preflight before PR #39 education-center migration.
// Never applies a migration, never reads member personal data, and never accesses Battery D1.
// Must be executed with the dedicated Central Cloudflare token.
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";

const config=JSON.parse(await readFile(new URL("./central-targets.json",import.meta.url),"utf8"));
const D1_PREVIEW="preview";
const D1_PRODUCTION="production";
const ALLOWED=new Set([D1_PREVIEW,D1_PRODUCTION]);
const LIST_SCHEMA="SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name";
const CENTER_COUNT="SELECT COUNT(*) AS count FROM education_centers";
const SESSION_COUNT="SELECT COUNT(*) AS count FROM auth_sessions WHERE revoked_at_ms IS NULL AND expires_at_ms>?";
const expected=["identity_users","member_profiles","auth_sessions","education_centers"];
const requiredFragments={
 identity_users:["user_id TEXT PRIMARY KEY","auth_version INTEGER","membership_status TEXT","suspended_at_ms","deleted_at_ms"],
 member_profiles:["user_id TEXT PRIMARY KEY","membership_system","center_code","record_version"],
 auth_sessions:["session_id_hash TEXT PRIMARY KEY","brand_scope","revoked_at_ms","issued_auth_version"],
 education_centers:["center_code TEXT PRIMARY KEY","display_name","is_active"]
};
const advancedTables=new Set(["admin_role_grants","member_center_change_events","protected_admin_principals"]);
const errorsForSchema=entries=>{
 const errors=[];
 const map=new Map(entries.map(x=>[x.name,x]));
 for(const name of expected){
  const item=map.get(name);
  if(!item||item.type!=="table"){errors.push("missing_baseline_table:"+name);continue;}
  for(const frag of requiredFragments[name]){
   if(!String(item.sql||"").includes(frag))errors.push("unexpected_baseline_ddl:"+name+":"+frag);
  }
 }
 for(const name of advancedTables){if(map.has(name))errors.push("already_or_partly_migrated:"+name);}
 for(const item of entries){
  if(item.type==="trigger"&&/^trg_hglobal_affiliation_/i.test(item.name))errors.push("already_or_partly_migrated_trigger");
 }
 return errors;
};

export async function auditCentralCenterMigration({
 target,accountId,token,request=fetch,nowMs=Date.now(),configOverride=config
}){
 if(!ALLOWED.has(target))throw Error("invalid_central_target");
 if(!/^[a-f0-9]{32}$/i.test(accountId||""))throw Error("invalid_account_id");
 if(typeof token!=="string"||token.length<10)throw Error("missing_central_api_token");
 const expectedDb=configOverride[target]?.d1_id;
 if(!/^[a-f0-9-]{36}$/i.test(expectedDb||""))throw Error("missing_expected_central_d1");
 if(configOverride.forbidden?.d1_ids?.includes(expectedDb))throw Error("battery_d1_not_allowed");
 if(!Number.isSafeInteger(nowMs)||nowMs<=0)throw Error("invalid_clock");
 const path="https://api.cloudflare.com/client/v4/accounts/"+accountId+"/d1/database/"+expectedDb+"/query";
 const auditLog=[];
 const read=async(sql,params=[])=>{
  if(![LIST_SCHEMA,CENTER_COUNT,SESSION_COUNT].includes(sql))throw Error("only_audited_queries_allowed");
  auditLog.push({query:sql===LIST_SCHEMA?"schema":sql===CENTER_COUNT?"center_count":"session_count",readOnly:true});
  const res=await request(path,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({sql,params})});
  if(!res.ok)throw Error("d1_read_failed_"+res.status);
  const json=await res.json();
  if(json?.success!==true||json?.result?.[0]?.success!==true||!Array.isArray(json.result[0].results))throw Error("d1_incomplete_read");
  return json.result[0].results;
 };
 const schema=await read(LIST_SCHEMA);
 const centers=await read(CENTER_COUNT);
 const sessions=await read(SESSION_COUNT,[nowMs]);
 const count=centers?.[0]?.count,active=sessions?.[0]?.count;
 if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(active)||active<0)throw Error("invalid_aggregate_response");
 const errors=errorsForSchema(schema);
 if(count!==0)errors.push("center_seed_requires_reconciliation");
 return {
  target,centralDbExact:true,baselineCompatible:errors.length===0,
  errors,existingCenters:count,activeSessions:active,
  impactsActiveSessions:active>0,
  status:"read_only_preflight",
  productionMigrationAuthorized:false,
  note:"PR #39 still requires rights/RBAC, rollback, data preservation, Preview, and human approvals",
  queries:auditLog
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const target=process.argv[2];
 auditCentralCenterMigration({
  target,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
  token:process.env.CLOUDFLARE_API_TOKEN_CENTRAL
 }).then(report=>{
  process.stdout.write(JSON.stringify(report)+"\n");
  if(!report.baselineCompatible)process.exitCode=1;
 },err=>{
  process.stderr.write("Central migration read-only preflight blocked: "+err.message+"\n");
  process.exitCode=1;
 });
}
