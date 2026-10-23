import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import app from "../src/index.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base="https://id.hglobal1985.com";
const db=(()=>{
 const challenges=new Map(),users=new Map(),profiles=new Map(),links=new Map(),sessions=new Map(),consents=[];
 function bindQuery(sql,args){
  return {
   async run(){
    if(sql.includes("INSERT INTO central_login_challenges")){challenges.set(args[0],{exp:args[2],used:false});return {success:true};}
    if(sql.includes("INSERT OR IGNORE INTO identity_users")){if(!users.has(args[0]))users.set(args[0],{user_id:args[0],membership_status:"pending",auth_version:1,suspended_at_ms:null,deleted_at_ms:null});return {success:true};}
    if(sql.includes("INSERT OR IGNORE INTO member_profiles")){if(!profiles.has(args[0]))profiles.set(args[0],{display_name:args[1],contact_email:null});return {success:true};}
    if(sql.includes("INSERT INTO auth_provider_links")){if(links.has(args[3]))throw Error("duplicate");links.set(args[3],args[1]);return {success:true};}
    if(sql.includes("INSERT INTO consent_records")){consents.push(args);return {success:true};}
    if(sql.includes("INSERT INTO auth_sessions")){sessions.set(args[0],{userId:args[1],exp:args[3],version:args[4],revoked:false});return {success:true};}
    if(sql.includes("UPDATE auth_sessions SET revoked_at_ms")){const r=sessions.get(args[1]);if(r)r.revoked=true;return {success:true};}
    throw Error("unexpected run SQL: "+sql);
   },
   async first(){
    if(sql.includes("UPDATE central_login_challenges SET consumed_at_ms")){
      const found=challenges.get(args[1]);
      if(!found||found.used||found.exp<=args[2])return null;
      found.used=true;return {nonce_hash:args[1]};
    }
    if(sql.includes("FROM auth_provider_links WHERE issuer='google'"))return links.has(args[0])?{user_id:links.get(args[0])}:null;
    if(sql.includes("FROM compat_google_subjects"))return null;
    if(sql.includes("SELECT user_id,membership_status,auth_version,suspended_at_ms,deleted_at_ms FROM identity_users")){
      return users.get(args[0])||null;
    }
    if(sql.includes("FROM auth_sessions s JOIN identity_users u")){
      const session=sessions.get(args[0]);if(!session||session.revoked||session.exp<=args[1])return null;
      const user=users.get(session.userId),profile=profiles.get(session.userId);
      return {...user,issued_auth_version:session.version,...profile};
    }
    if(sql.includes("FROM compat_legacy_principals WHERE"))return null;
    throw Error("unexpected first SQL: "+sql);
   }
  };
 }
 return {challenges,users,profiles,links,sessions,consents,
  prepare(sql){return {bind(...args){return bindQuery(sql,args);}};},
  async batch(items){const out=[];for(const q of items)out.push(await q.run());return out;}
 };
})();
test("Google verified token creates an unapproved account once, no email merge or admin role",async()=>{
 const keypair=await webcrypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const jwk=await webcrypto.subtle.exportKey("jwk",keypair.publicKey);
 Object.assign(jwk,{kid:"central-portal-key",use:"sig",alg:"RS256"});
 globalThis.fetch=async url=>{
   assert.match(String(url),/googleapis.com\/oauth2\/v3\/certs/);
   return new Response(JSON.stringify({keys:[jwk]}),{status:200});
 };
 const chal=await app.fetch(new Request(base+"/api/v1/portal/challenge"),{CENTRAL_DB:db});
 const nonce=(await chal.json()).nonce;
 const epoch=Math.floor(Date.now()/1000);
 const enc=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
 const data=enc({alg:"RS256",kid:jwk.kid})+"."+enc({
  iss:"https://accounts.google.com",
  aud:"791614645185-vbaqqbnr463r1vi4ga41uh73s7eg0gv5.apps.googleusercontent.com",
  sub:"google-central-user-subject-01",email_verified:true,name:"測試訪客",iat:epoch-10,exp:epoch+1000,nonce
 });
 const signature=await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5",keypair.privateKey,new TextEncoder().encode(data));
 const credential=data+"."+Buffer.from(signature).toString("base64url");
 const authRequest=()=>new Request(base+"/api/v1/portal/google-login",{
   method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:"central_login_nonce="+nonce},
   body:JSON.stringify({appId:"central",termsAccepted:true,credential})
 });
 let auth=await app.fetch(authRequest(),{CENTRAL_DB:db});
 assert.equal(auth.status,200);
 const result=await auth.json();
 assert.equal(result.authenticated,true);
 assert.equal(result.membership_status,"pending");
 assert.equal(result.central_approved,false);
 assert.equal(db.users.size,1);
 assert.equal(db.links.size,1);
 assert.equal(db.consents.length,1);
 assert.match(auth.headers.get("Set-Cookie"),/HttpOnly; Secure; SameSite=Lax/);
 const portalCookie=auth.headers.get("Set-Cookie").split(";")[0];
 let dashboard=await app.fetch(new Request(base+"/dashboard",{headers:{Cookie:portalCookie}}),{CENTRAL_DB:db});
 assert.equal(dashboard.status,200);
 const html=await dashboard.text();
 assert.match(html,/測試訪客/);
 assert.match(html,/訪客身分/);
 assert.doesNotMatch(html,/管理員權限已核准/);
 const replay=await app.fetch(authRequest(),{CENTRAL_DB:db});
 assert.equal(replay.status,401);
 assert.equal((await replay.json()).error,"nonce_expired_or_replayed");
 // Regression: a real Google-signed token for Starry must not log in to the H-Global portal.
 const legacyChallenge=await app.fetch(new Request(base+"/api/v1/portal/challenge"),{CENTRAL_DB:db});
 const legacyNonce=(await legacyChallenge.json()).nonce;
 const legacyParts=enc({alg:"RS256",kid:jwk.kid})+"."+enc({
  iss:"https://accounts.google.com",aud:"661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com",
  sub:"legacy-audience-not-central",email_verified:true,name:"Starry identity",iat:epoch-10,exp:epoch+1000,nonce:legacyNonce
 });
 const legacySignature=await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5",keypair.privateKey,new TextEncoder().encode(legacyParts));
 const oldAudienceResponse=await app.fetch(new Request(base+"/api/v1/portal/google-login",{
  method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:"central_login_nonce="+legacyNonce},
  body:JSON.stringify({appId:"central",termsAccepted:true,credential:legacyParts+"."+Buffer.from(legacySignature).toString("base64url")})
 }),{CENTRAL_DB:db});
 assert.equal(oldAudienceResponse.status,401);
 assert.equal((await oldAudienceResponse.json()).error,"credential_invalid");
 assert.equal(db.users.size,1);
 const logout=await app.fetch(new Request(base+"/api/v1/portal/logout",{method:"POST",headers:{Origin:base,Cookie:portalCookie}}),{CENTRAL_DB:db});
 assert.equal(logout.status,200);
 dashboard=await app.fetch(new Request(base+"/dashboard",{headers:{Cookie:portalCookie}}),{CENTRAL_DB:db});
 assert.equal(dashboard.status,303);
});
