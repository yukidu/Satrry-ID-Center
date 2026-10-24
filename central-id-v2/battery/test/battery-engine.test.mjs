import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import engine,{reserve,settle,sweepExpiredReservations,sweepExpiredAvailableLots,sweepOldRateLimitWindows} from "../engine.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const c={user_id:"member_123",app_id:"starry_echo",operation_id:"operation_123",quantity:4};
function dbWith({existing=null,lots=[{lot_id:"early",available_units:2,expires_at_ms:100000},{lot_id:"late",available_units:7,expires_at_ms:200000}],wallet=9,allocations=[],expiredReservations=[],expiredLots=[]}={}){
 const calls=[],batches=[];
 return {
  calls,batches,
  prepare(sql){
   return {
    bind(...args){
     const state={sql,args};calls.push(state);
     return {
      ...state,
      async first(){
       if(sql.includes("FROM battery_reservations WHERE"))return existing;
       if(sql.includes("SELECT available_units,version FROM battery_wallets"))return wallet===null?null:{available_units:wallet,version:1};
       if(sql.includes("FROM battery_overdraft_accounts"))return null;
       throw Error("unexpected first "+sql);
      },
      async all(){
       if(sql.includes("FROM battery_lots WHERE expires_at_ms<="))return {results:expiredLots};
       if(sql.includes("FROM battery_lots WHERE"))return {results:lots};
       if(sql.includes("FROM battery_reservation_allocations a JOIN battery_lots"))return {results:allocations};
       if(sql.includes("FROM battery_reservations WHERE state='reserved'"))return {results:expiredReservations};
       throw Error("unexpected all "+sql);
      }
     };
    }
   };
  },
  async batch(ops){batches.push(ops);return ops.map(()=>({success:true}));}
 };
}
const json=async r=>({code:r.status,data:await r.json()});
test("reserve picks FEFO source lots, issues one atomic D1 batch",async()=>{
 const db=dbWith();
 const res=await json(await reserve(db,c,1000));
 assert.equal(res.code,200);
 assert.equal(res.data.status,"reserved");
 assert.equal(res.data.quantity,4);
 assert.equal(res.data.allocations,2);
 assert.equal(db.batches.length,1);
 const ops=db.batches[0];
 assert.equal(ops.length,7);
 const lotUpdates=ops.filter(x=>x.sql.startsWith("UPDATE battery_lots"));
 assert.deepEqual(lotUpdates.map(x=>({source:x.args[4],quantity:x.args[1]})),[{source:"early",quantity:2},{source:"late",quantity:2}]);
 const ledger=ops.filter(x=>x.sql.includes("INSERT INTO battery_ledger"));
 assert.equal(ledger.length,0,"reserve must never settle consumption");
});
test("reserve may allocate eligible lots and reserve one overdue shortfall",async()=>{
 const db=dbWith({lots:[{lot_id:"almost",available_units:2,expires_at_ms:1001}]});
 const r=await json(await reserve(db,c,1000));
 assert.equal(r.code,200);
 assert.equal(r.data.overdraft_units,2);
 assert.equal(r.data.funded_units,2);
 assert.equal(db.batches.length,1);
});
test("duplicate operation returns idempotent response instead of debiting twice",async()=>{
 const existing={...c,funded_units:4,overdraft_units:0,reservation_id:"res-123",state:"reserved",deadline_at_ms:500000};
 const db=dbWith({existing});
 const r=await json(await reserve(db,c,1000));
 assert.equal(r.code,200);
 assert.equal(r.data.idempotent,true);
 assert.equal(db.batches.length,0);
});
test("commit is forbidden after deadline; no database mutation",async()=>{
 const existing={...c,funded_units:4,overdraft_units:0,reservation_id:"res-123",state:"reserved",deadline_at_ms:1001};
 const db=dbWith({existing,allocations:[{lot_id:"early",quantity:4,expires_at_ms:99999}]});
 const r=await json(await settle(db,c,"commit",1002));
 assert.equal(r.code,409);
 assert.equal(r.data.error,"reservation_expired_must_release");
 assert.equal(db.batches.length,0);
});
test("cancel releases reservation and allocates all units back in one batch",async()=>{
 const existing={...c,funded_units:4,overdraft_units:0,reservation_id:"res-123",state:"reserved",deadline_at_ms:200000};
 const db=dbWith({existing,allocations:[{lot_id:"early",quantity:2,expires_at_ms:100000},{lot_id:"late",quantity:2,expires_at_ms:200000}]});
 const r=await json(await settle(db,c,"release",1000));
 assert.equal(r.code,200);
 assert.equal(r.data.status,"released");
 assert.equal(db.batches.length,1);
 assert.equal(db.batches[0].filter(x=>x.sql.startsWith("UPDATE battery_lots")).length,2);
 assert.equal(db.batches[0].filter(x=>x.sql.includes("INSERT INTO battery_ledger")).length,0);
});
test("release never resurrects expired reserved lots in spendable wallet",async()=>{
 const existing={...c,funded_units:4,overdraft_units:0,reservation_id:"res-123",state:"reserved",deadline_at_ms:300000};
 const db=dbWith({existing,allocations:[{lot_id:"early",quantity:2,expires_at_ms:900},{lot_id:"late",quantity:2,expires_at_ms:200000}]});
 const r=await json(await settle(db,c,"release",1000));
 assert.equal(r.code,200);
 assert.equal(r.data.status,"released");
 const ops=db.batches[0];
 const w=ops.find(x=>x.sql.startsWith("UPDATE battery_wallets"));
 assert.equal(w.args[0],4,"all reserved units are cleared");
 assert.equal(w.args[1],2,"only non-expired units can become spendable");
 const lots=ops.filter(x=>x.sql.startsWith("UPDATE battery_lots"));
 assert.deepEqual(lots.map(x=>x.args.slice(0,2)),[[2,0],[2,2]]);
});
test("commit is forbidden if any reserved source lot has expired",async()=>{
 const existing={...c,funded_units:4,overdraft_units:0,reservation_id:"res-123",state:"reserved",deadline_at_ms:300000};
 const db=dbWith({existing,allocations:[{lot_id:"early",quantity:2,expires_at_ms:999},{lot_id:"late",quantity:2,expires_at_ms:200000}]});
 const r=await json(await settle(db,c,"commit",1000));
 assert.equal(r.code,409);
 assert.equal(r.data.error,"reservation_lot_expired_must_release");
 assert.equal(db.batches.length,0);
});
test("timeout release never returns expired units as spendable",async()=>{
 const existing={...c,funded_units:4,overdraft_units:0,reservation_id:"res-123",state:"reserved",deadline_at_ms:1100};
 const db=dbWith({existing,allocations:[{lot_id:"early",quantity:4,expires_at_ms:1150}]});
 const r=await json(await settle(db,c,"release",1200));
 assert.equal(r.code,200);
 assert.equal(r.data.status,"expired");
 const w=db.batches[0].find(x=>x.sql.startsWith("UPDATE battery_wallets"));
 assert.equal(w.args[1],0);
});
test("private Cron sweeps timed-out reservations without the App coming back",async()=>{
 const existing={...c,funded_units:4,overdraft_units:0,reservation_id:"res-123",state:"reserved",deadline_at_ms:1100};
 const db=dbWith({existing,expiredReservations:[{user_id:c.user_id,app_id:c.app_id,operation_id:c.operation_id}],allocations:[{lot_id:"late",quantity:4,expires_at_ms:99999}]});
 const outcome=await sweepExpiredReservations(db,1200);
 assert.deepEqual(outcome,{checked:1,expired:1,failed:0});
 assert.equal(db.batches.length,1);
});
test("expiry cleanup removes available lots and matching wallet units atomically",async()=>{
 const db=dbWith({expiredLots:[{user_id:c.user_id,lot_id:"early",available_units:7}]});
 const outcome=await sweepExpiredAvailableLots(db,100000);
 assert.deepEqual(outcome,{checked:1,cleared:1,failed:0});
 assert.equal(db.batches.length,1);
 assert.match(db.batches[0][0].sql,/ELSE -1/,"expired-lot update must fail closed on concurrent changes");
 assert.equal(db.batches[0][1].args[0],7);
});
test("old API rate-limit windows are pruned only in bounded batches",async()=>{
 let q="",params=[];
 const db={prepare(sql){q=sql;return{bind(...args){params=args;return{async run(){return {meta:{changes:9}}}}}}}};
 const r=await sweepOldRateLimitWindows(db,48*3600000+180000,500);
 assert.equal(r.deleted,9);
 assert.match(q,/DELETE FROM battery_app_rate_limits/);
 assert.match(q,/LIMIT \?/);
 assert.deepEqual(params,[180000,500]);
});
test("private Cron scheduled() silently skips missing sandbox D1",async()=>{
 await assert.doesNotReject(()=>engine.scheduled({},{}));
});
test("private engine fails closed without secret or configured D1",async()=>{
 const req=new Request("https://battery-engine.internal/v1/reserve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(c)});
 const r=await json(await engine.fetch(req,{}));
 assert.equal(r.code,503);
});
test("private engine rejects clients with wrong secret",async()=>{
 const req=new Request("https://battery-engine.internal/v1/reserve",{method:"POST",headers:{"Content-Type":"application/json","X-Battery-Internal-Authorization":"Bearer wrong"},body:JSON.stringify(c)});
 const r=await json(await engine.fetch(req,{BATTERY_DB:{batch(){}},BATTERY_ENGINE_SECRET:"s".repeat(40)}));
 assert.equal(r.code,403);
});
test("private engine rejects forged extra identity fields even with valid secret",async()=>{
 const req=new Request("https://battery-engine.internal/v1/reserve",{method:"POST",headers:{"Content-Type":"application/json","X-Battery-Internal-Authorization":"Bearer "+"s".repeat(40)},body:JSON.stringify({...c,admin:true})});
 const r=await json(await engine.fetch(req,{BATTERY_DB:{batch(){}},BATTERY_ENGINE_SECRET:"s".repeat(40)}));
 assert.equal(r.code,400);
});
test("overdraft debt is recorded only on successful commit, not reserve",async()=>{
 const db=dbWith({lots:[],wallet:0});
 const request={...c,quantity:8};
 const r=await json(await reserve(db,request,1000));
 assert.equal(r.code,200);
 assert.equal(r.data.overdraft_units,8);
 assert.equal(r.data.allocations,0);
 const batch=db.batches[0];
 assert.ok(batch.some(x=>x.sql.includes("battery_overdraft_accounts SET active_reservation_id")));
 assert.ok(!batch.some(x=>x.sql.includes("SET debt_units=")));
});
test("overdraft settle success commits debt once and advances usage count",async()=>{
 const existing={...c,funded_units:1,overdraft_units:3,reservation_id:"res_12345678",state:"reserved",deadline_at_ms:200000};
 const db=dbWith({existing,allocations:[{lot_id:"early",quantity:1,expires_at_ms:100000}]});
 const r=await json(await settle(db,c,"commit",1000));
 assert.equal(r.code,200);
 const op=db.batches[0].find(x=>x.sql.includes("SET debt_units="));
 assert.ok(op);
 assert.match(op.sql,/successful_uses=successful_uses\+1/);
});
