import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {Miniflare} from 'miniflare';

const secret=()=>randomBytes(32).toString('hex');
const origin='https://registry.example';
const entry=(extra={})=>({name:'Fixture Witness',key:secret(),listed:false,challenge:'register',...extra});

async function registry(t,bindings={}) {
  const challenges=[];
  const mf=new Miniflare({
    modules:true,compatibilityDate:'2026-05-01',scriptPath:'dist/server/index.js',cache:false,
    d1Databases:['DB'],bindings:{LOCAL_REGISTRY_PREVIEW:'1',REGISTRY_SECRET:secret(),TURNSTILE_SECRET:'fixture-only',...bindings},
    outboundService:async req=>{
      const form=new URLSearchParams(await req.text());
      const action=form.get('response').split(':')[0];
      challenges.push(action);
      return Response.json({success:true,hostname:'riemannsolved.com',action});
    }
  });
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  for(const path of ['migrations/0001_registry.sql','migrations/0002_certificate_issuance.sql']){
    const sql=await readFile(path,'utf8');
    for(const statement of sql.trim().split(/;\s*\n(?=CREATE |INSERT )/))await db.prepare(statement).run();
  }
  const post=(path,body)=>mf.dispatchFetch(origin+path,{
    method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.31'},body:JSON.stringify(body)
  });
  const hits=async()=> (await db.prepare('SELECT hits FROM limits ORDER BY hits').all()).results.map(row=>row.hits);
  return {db,post,hits,challenges};
}

test('waiting for the first witness leaves the shared network quota available',async t=>{
  const firstPass=secret();
  const {post,hits}=await registry(t,{FIRST_WITNESS_HASH:createHash('sha256').update(firstPass).digest('hex')});
  const waiting=await Promise.all(Array.from({length:25},(_,i)=>post('/api/register',entry({challenge:'register:'+i}))));
  assert.ok(waiting.every(response=>response.status===425));
  assert.deepEqual(await hits(),[]);

  const first=await post('/api/register',entry({firstPass}));
  assert.equal(first.status,200);
  assert.equal((await first.json()).id,1);
  const second=await post('/api/register',entry());
  assert.equal(second.status,200);
  assert.equal((await second.json()).id,2);
  assert.deepEqual(await hits(),[2]);
});

test('racing retries share the last network slot and issue exactly one certificate',async t=>{
  const {db,post,hits}=await registry(t);
  const prior=await Promise.all(Array.from({length:23},(_,i)=>post('/api/register',entry({challenge:'register:'+i}))));
  assert.ok(prior.every(response=>response.status===200));
  assert.deepEqual(await hits(),[23]);

  const input=entry();
  const responses=await Promise.all(Array.from({length:6},(_,i)=>post('/api/register',{...input,challenge:'register:retry-'+i})));
  assert.deepEqual(responses.map(response=>response.status),Array(6).fill(200));
  const rows=await Promise.all(responses.map(response=>response.json()));
  assert.equal(rows[0].id,24);
  assert.deepEqual(rows,Array(6).fill(rows[0]));
  assert.deepEqual(await hits(),[24]);

  assert.equal((await post('/api/register',entry())).status,429);
  assert.deepEqual(await hits(),[24]);
  assert.equal(await db.prepare('SELECT participants FROM totals WHERE id=1').first('participants'),24);
  assert.equal(await db.prepare('SELECT SUM(certificates) AS total FROM certificate_issuance_daily').first('total'),24);
});

test('a failed quota write rolls back the number and both issuance counters',async t=>{
  const {db,post,hits}=await registry(t);
  await db.prepare("CREATE TRIGGER fixture_quota_failure BEFORE INSERT ON limits BEGIN SELECT RAISE(ABORT,'fixture quota failure'); END").run();
  const input=entry();
  assert.equal((await post('/api/register',input)).status,500);
  assert.deepEqual(await hits(),[]);
  assert.equal(await db.prepare('SELECT participants FROM totals WHERE id=1').first('participants'),0);
  assert.equal(await db.prepare('SELECT COUNT(*) AS days FROM certificate_issuance_daily').first('days'),0);

  await db.prepare('DROP TRIGGER fixture_quota_failure').run();
  const retry=await post('/api/register',input);
  assert.equal(retry.status,200);
  assert.equal((await retry.json()).id,1);
  assert.deepEqual(await hits(),[1]);
});

test('invalid recovery form fields and multiline notes leave challenge and quota unused',async t=>{
  const {post,hits,challenges}=await registry(t);
  const recovery={challenge:'recover',email:'witness@example.test',phrase:'a valid fixture phrase'};
  for(const fields of [{email:''},{email:'not-an-email'},{phrase:'short'}]){
    assert.equal((await post('/api/recover',{...recovery,...fields})).status,400);
  }
  for(const separator of ['\n','\u2028','\u2029']){
    assert.equal((await post('/api/register',entry({message:'First line'+separator+'Second line'}))).status,400);
  }
  assert.deepEqual(challenges,[]);
  assert.deepEqual(await hits(),[]);

  assert.equal((await post('/api/recover',recovery)).status,404);
  assert.deepEqual(challenges,['recover']);
  assert.deepEqual(await hits(),[1]);
});
