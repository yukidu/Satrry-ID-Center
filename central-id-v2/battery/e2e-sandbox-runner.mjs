// Private Cloudflare Cron acceptance runner. Test-only: NEVER deploy to Production D1.
// This Worker has no public hostname, route or exposed endpoint. Runs once per RUN_ID.
// It calls the actual source engine with Cloudflare's real D1 binding, not a mock.
import engine, { reserve, settle, sweepExpiredReservations, sweepExpiredAvailableLots } from "./engine.mjs";
const RUN_ID="bat-d1-e2e-20261024-01";
const BASE=Date.now() + 48*3600000; // future logical clock: production sandbox Cron can't race
const assert=(ok, why)=>{if(!ok)throw Error(why)};
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const call=async(r)=>({status:r.status,data:await r.json()});
const cid=(user,suffix)=>({user_id:user,app_id:"e2e_app",operation_id:"e2e_op_"+suffix});
async function seed(db,u,values,expiry){
 const qty=values.reduce((a,b)=>a+b,0);
 const b=[db.prepare("INSERT INTO battery_wallets(user_id,available_units,reserved_units,version) VALUES(?,?,0,1)").bind(u,qty)];
 for(let i=0;i<values.length;i++)b.push(db.prepare("INSERT INTO battery_lots(lot_id,user_id,source,expires_at_ms,available_units,reserved_units) VALUES(?,?,'sandbox_e2e',?,?,0)").bind(u+"_lot_"+i,u,expiry[i],values[i]));
 await db.batch(b);
}
async function clean(db,u){
 await db.batch([
  db.prepare("DELETE FROM battery_reservation_allocations WHERE reservation_id IN (SELECT reservation_id FROM battery_reservations WHERE user_id=?)").bind(u),
  db.prepare("DELETE FROM battery_ledger WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_reservations WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_lots WHERE user_id=?").bind(u),
  db.prepare("DELETE FROM battery_wallets WHERE user_id=?").bind(u)
 ]);
}
async function testOn(db,label,callback){
 const u="e2e_20261024_"+label;
 try {await clean(db,u); await callback(u); return {name:label,pass:true};}
 catch(e){return {name:label,pass:false,error:String(e).slice(0,280)}}
 finally{try{await clean(db,u)}catch(e){/* test summary records the original error; orphan detection runs later */}}
}
async function main(db){
 const checks=[];
 checks.push(await testOn(db,"fefo",async u=>{
  await seed(db,u,[5,7],[BASE+90000,BASE+300000]);
  const c={...cid(u,"fefo"),quantity:8};
  const a=await call(await reserve(db,c,BASE));assert(a.status===200,"reserve 8 failed "+JSON.stringify(a));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(w.available_units===4&&w.reserved_units===8,"wallet after reservation "+JSON.stringify(w));
  const lots=await all(db,"SELECT available_units,reserved_units FROM battery_lots WHERE user_id=? ORDER BY expires_at_ms",u);
  assert(lots[0].available_units===0&&lots[0].reserved_units===5&&lots[1].available_units===4&&lots[1].reserved_units===3,"FEFO incorrect "+JSON.stringify(lots));
  const dup=await call(await reserve(db,c,BASE+100));assert(dup.status===200&&dup.data.idempotent===true,"duplicate not idempotent");
  const cm=await call(await settle(db,c,"commit",BASE+1000));assert(cm.status===200,"commit failure");
  const cm2=await call(await settle(db,c,"commit",BASE+1001));assert(cm2.status===200&&cm2.data.idempotent,"double-commit should idempotent");
  const after=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  const led=await one(db,"SELECT COUNT(*) AS n,SUM(quantity_delta) AS amount FROM battery_ledger WHERE user_id=?",u);
  assert(after.available_units===4&&after.reserved_units===0&&led.n===1&&led.amount===-8,"commit/ledger mismatch");
 }));
 checks.push(await testOn(db,"cancel",async u=>{
  await seed(db,u,[9],[BASE+1000000]);const c={...cid(u,"cancel"),quantity:6};
  assert((await call(await reserve(db,c,BASE))).status===200,"reserve failure");
  assert((await call(await settle(db,c,"release",BASE+1000))).status===200,"release failure");
  const r=await call(await settle(db,c,"release",BASE+1100));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  const n=await one(db,"SELECT COUNT(*) AS n FROM battery_ledger WHERE user_id=?",u);
  assert(r.status===200&&r.data.idempotent===true&&w.available_units===9&&w.reserved_units===0&&n.n===0,"full refund/duplicate failed");
 }));
 checks.push(await testOn(db,"timeout",async u=>{
  await seed(db,u,[10],[BASE+1000000]);const c={...cid(u,"timeout"),quantity:3};
  assert((await call(await reserve(db,c,BASE))).status===200,"reserve failure");
  const sweep=await sweepExpiredReservations(db,BASE+180001);
  assert(sweep.expired>=1&&sweep.failed===0,"Cron timeout return "+JSON.stringify(sweep));
  const late=await call(await settle(db,c,"commit",BASE+180002));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(late.status===409&&w.available_units===10&&w.reserved_units===0,"late commit or wallet corruption");
 }));
 checks.push(await testOn(db,"expired",async u=>{
  await seed(db,u,[4,6],[BASE+500,BASE+500000]);const c={...cid(u,"expired"),quantity:7};
  assert((await call(await reserve(db,c,BASE))).status===200,"reserve failure");
  const commit=await call(await settle(db,c,"commit",BASE+600));
  assert(commit.status===409&&commit.data.error==="reservation_lot_expired_must_release","expired lot allowed commit");
  const refund=await call(await settle(db,c,"release",BASE+600));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(refund.status===200&&w.available_units===6&&w.reserved_units===0,"expired credits resurrected "+JSON.stringify(w));
 }));
 checks.push(await testOn(db,"cleanup",async u=>{
  await seed(db,u,[4,6],[BASE+500,BASE+500000]);
  const sweep=await sweepExpiredAvailableLots(db,BASE+600);
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  assert(sweep.cleared>=1&&sweep.failed===0&&w.available_units===6,"expired sweep corrupt "+JSON.stringify({sweep,w}));
 }));
 checks.push(await testOn(db,"concurrent",async u=>{
  await seed(db,u,[6],[BASE+500000]);const a={...cid(u,"racea"),quantity:5},b={...cid(u,"raceb"),quantity:5};
  const results=await Promise.all([reserve(db,a,BASE),reserve(db,b,BASE)]).then(xs=>Promise.all(xs.map(call)));
  const w=await one(db,"SELECT available_units,reserved_units FROM battery_wallets WHERE user_id=?",u);
  const n=await one(db,"SELECT COUNT(*) AS n FROM battery_reservations WHERE user_id=?",u);
  assert(results.filter(x=>x.status===200).length===1&&results.filter(x=>x.status===409).length===1,"overbooking results "+JSON.stringify(results));
  assert(w.available_units===1&&w.reserved_units===5&&n.n===1,"double-spend wallet "+JSON.stringify({w,n}));
 }));
 const req=new Request("https://battery-engine.internal/v1/reserve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({app_id:"e2e_app",user_id:"e2e_authority",operation_id:"e2e_op_auth",quantity:1})});
 const guarded=await call(await engine.fetch(req,{BATTERY_DB:db}));
 checks.push({name:"authfailclosed",pass:guarded.status===503,error:guarded.status===503?undefined:"engine accepted request without internal Secret"});
 const leftovers=await one(db,"SELECT COUNT(*) AS n FROM battery_wallets WHERE user_id LIKE 'e2e_20261024_%'");
 checks.push({name:"cleanupall",pass:leftovers.n===0,error:leftovers.n===0?undefined:"leftover wallet rows "+leftovers.n});
 return {run_id:RUN_ID,passed:checks.filter(x=>x.pass).length,total:checks.length,checks,environment:"isolated_battery_d1",production:false};
}
export default {
 async scheduled(event,env){
  const db=env?.BATTERY_DB;if(!db?.batch)throw Error("isolated Battery D1 missing");
  await db.prepare("CREATE TABLE IF NOT EXISTS e2e_test_results (run_id TEXT PRIMARY KEY NOT NULL, created_at_ms INTEGER NOT NULL, passed INTEGER NOT NULL, total INTEGER NOT NULL, report TEXT NOT NULL)").run();
  const old=await one(db,"SELECT run_id FROM e2e_test_results WHERE run_id=?",RUN_ID);
  if(old)return;
  let report;
  try{report=await main(db)}catch(e){report={run_id:RUN_ID,passed:0,total:1,checks:[{name:"fatal",pass:false,error:String(e).slice(0,250)}],production:false}}
  await db.prepare("INSERT OR IGNORE INTO e2e_test_results(run_id,created_at_ms,passed,total,report) VALUES(?,?,?,?,?)").bind(RUN_ID,Date.now(),report.passed,report.total,JSON.stringify(report)).run();
 },
 async fetch(){return new Response("not_found",{status:404})}
};