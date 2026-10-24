// Generate service-specific Wrangler configs without modifying Central ID resources.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const base=new URL("../",import.meta.url);
const target=process.env.BATTERY_TARGET;
const d1id=process.env.BATTERY_D1_ID;
const d1name=process.env.BATTERY_D1_NAME;
const central=process.env.CENTRAL_AUTH_WORKER||"";
if(!["preview","production"].includes(target))throw Error("invalid_battery_target");
if(!/^[a-f0-9-]{36}$/i.test(d1id||""))throw Error("missing_battery_d1_id");
if(!/^[a-zA-Z0-9_-]{3,128}$/.test(d1name||""))throw Error("missing_battery_d1_name");
if(central&&!/^[a-z0-9][a-z0-9-]{2,62}$/.test(central))throw Error("invalid_central_auth_worker_name");
if(target==="production"&&!central)throw Error("production_requires_verified_central_auth_worker");
const engineName="starry-battery-engine-"+target;
const common={compatibility_date:"2026-10-01",d1_databases:[{binding:"BATTERY_DB",database_name:d1name,database_id:d1id}]};
const engine={...common,name:engineName,main:"engine.mjs",workers_dev:false,triggers:{crons:["* * * * *"]}};
const gateway={...common,name:"starry-battery-gateway-"+target,main:"worker.mjs",workers_dev:target==="preview",services:[{binding:"BATTERY_ENGINE",service:engineName}]};
if(central)gateway.services.push({binding:"CENTRAL_AUTH_VERIFY",service:central});
for(const [name,config] of [["engine",engine],["gateway",gateway]]){
 const output=path.join(fileURLToPath(base),".wrangler."+name+".generated.json");
 fs.writeFileSync(output,JSON.stringify(config,null,2)+"\n",{mode:0o600});
}
console.log("Generated isolated Battery Wrangler configs for",target,"(no Central ID settings modified)");
