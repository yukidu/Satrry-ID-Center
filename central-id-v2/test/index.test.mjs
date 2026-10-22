import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/index.mjs";

const req=(path,method="GET")=>app.fetch(new Request("https://id.hglobal1985.com"+path,{method}));
test("status is transparent about disabled sensitive services",async()=>{
  const res=await req("/healthz");
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.status,"ok");
  assert.equal(data.member_login_enabled,false);
  assert.equal(data.directory_enabled,false);
  assert.equal(data.complaints_enabled,false);
  assert.equal(data.legacy_linked,false);
  assert.equal(data.legacy_snapshot.state,"copied-and-verified");
  assert.equal(data.legacy_snapshot.isolated,true);
  assert.equal(data.legacy_snapshot.tables,61);
  assert.equal(data.legacy_snapshot.rows,4849);
  assert.equal(data.legacy_snapshot.production_login_reuse,false);
});
test("homepage contains honest unavailable notice and headers",async()=>{
  const res=await req("/");
  const html=await res.text();
  assert.equal(res.status,200);
  assert.match(html,/目前開放的是新版官方資訊頁/);
  assert.match(html,/中央會員 ID/);
  assert.equal(res.headers.get("X-Robots-Tag"),"noindex, nofollow, noarchive");
  assert.match(res.headers.get("Content-Security-Policy"),/form-action 'none'/);
});
test("private data and writes fail closed",async()=>{
  for(const path of ["/api/v1/me","/api/v1/public/directory","/api/v1/public/complaints"]){
    const res=await req(path);
    assert.equal(res.status,503);
    assert.equal((await res.json()).error,"not_enabled");
  }
  const post=await req("/api/v1/public/complaints","POST");
  assert.equal(post.status,503);
});
test("no old-site redirect and no indexing",async()=>{
  const res=await req("/robots.txt");
  assert.match(await res.text(),/Disallow: \/$/m);
  const unknown=await req("/c/example");
  assert.equal(unknown.status,404);
});
test("only read-only public help available",async()=>{
  const res=await req("/api/v1/public/help");
  assert.equal(res.status,200);
  assert.equal((await res.json()).phase,"public-information");
});
