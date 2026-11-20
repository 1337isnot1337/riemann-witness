import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {inflateSync} from 'node:zlib';
const origin='https://registry.example', token=()=>randomBytes(32).toString('hex');
let mf, db;
before(async()=>{
  mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-05-01',
    d1Databases:['DB'],bindings:{LOCAL_REGISTRY_PREVIEW:'1',TURNSTILE_SECRET:'fixture-only',REGISTRY_SECRET:token(),ADMIN_TOKEN:'test-admin'},cache:false,outboundService:async req=>{
      assert.equal(req.url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(req.method,'POST');
      const form=new URLSearchParams(await req.text()),challenge=form.get('response');
      assert.equal(form.get('secret'),'fixture-only');
      assert.match(form.get('remoteip'),/^\d+\.\d+\.\d+\.\d+$/);
      if(challenge==='unavailable')return new Response(null,{status:503});
      if(challenge==='malformed')return new Response('not JSON');
      if(challenge==='null-result')return Response.json(null);
      return Response.json({
        success:challenge.startsWith('string-success')?'false':['valid','recover','wronghost','wronghost-recover'].includes(challenge),
        action:challenge.endsWith('recover')?'recover':'register',
        hostname:challenge.startsWith('wronghost')?'example.org':'riemannsolved.com'
      });
    }});
  db=await mf.getD1Database('DB');
  const sql=await readFile('migrations/0001_registry.sql','utf8');
  for(const statement of sql.trim().split(/;\s*\n(?=CREATE |INSERT )/))await db.prepare(statement).run();
});
after(async()=>{await mf?.dispose();});
async function req(path,init={}){return mf.dispatchFetch(origin+path,init);}
const auth=key=>({Authorization:'Bearer '+key});
async function post(path,body,ip='192.0.2.1') {
  return req(path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(body)});
}
function entry(i,more={}){return {challenge:'valid',name:'Witness '+i,key:token(),message:'',listed:true,...more};}
function png(buffer,w,h){
  assert.equal(buffer.subarray(1,4).toString(),'PNG');
  assert.equal(buffer.readUInt32BE(16),w);assert.equal(buffer.readUInt32BE(20),h);
  let pos=8,chunks=[];
  while(pos<buffer.length){const size=buffer.readUInt32BE(pos);if(buffer.toString('ascii',pos+4,pos+8)==='IDAT')chunks.push(buffer.subarray(pos+8,pos+8+size));pos+=size+12;}
  assert.equal(inflateSync(Buffer.concat(chunks)).length,h*(w+1));
}
test('concurrent claims and racing retries get permanent unique sequential numbers',async()=>{
  const inputs=Array.from({length:16},(_,i)=>entry(i));
  const registered=await Promise.all(inputs.map(async (body,i)=>{const r=await post('/api/register',body,'192.0.2.'+(i+1));assert.equal(r.status,200);return r.json();}));
  assert.deepEqual(registered.map(r=>r.id).sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i+1));
  const body=entry('retry'),raced=await Promise.all(Array.from({length:5},async()=>(await post('/api/register',body)).json()));
  assert.ok(raced.every(r=>r.id===17));
  assert.equal((await db.prepare('SELECT participants FROM totals').first()).participants,17);
  const after=await (await post('/api/register',entry('next'))).json();assert.equal(after.id,18);
  assert.ok(Math.abs(Date.now()-Date.parse(after.created_at))<10000);
});
test('private entries and recovery credentials stay out of public routes; records can be restored, published, hidden and deleted',async()=>{
  const key=token(),email='private@example.com',phrase='my test recovery phrase',name='Eléna Private';
  const input=entry(0,{key,name,email,phrase,message:'<script>private note</script>',listed:false});
  const r=await post('/api/register',input);assert.equal(r.status,200);
  const row=await r.json();assert.equal(row.name,name);assert.deepEqual(Object.keys(row).sort(),['created_at','id','listed','message','name']);
  const path='/w/'+String(row.id).padStart(6,'0'),management='/api/manage/'+row.id;
  for(const suffix of ['','/social.png','/portrait.png'])assert.equal((await req(path+suffix)).status,404);
  assert.equal((await req(management,{headers:auth(token())})).status,404);
  assert.equal((await (await req('/api/registry?q=Elena')).json()).entries.length,0);
  assert.equal((await post('/api/recover',{challenge:'recover',email,phrase:'totally wrong phrase'})).status,404);
  const recovered=await (await post('/api/recover',{challenge:'recover',email,phrase})).json();
  assert.equal(recovered[0].id,row.id);
  const stored=JSON.stringify(await db.prepare('SELECT * FROM witnesses WHERE id=?').bind(row.id).first());
  for(const privateValue of [email,phrase,key,recovered[0].key])assert.ok(!stored.includes(privateValue));
  async function visibility(v){return req(management,{method:'PATCH',headers:{...auth(recovered[0].key),'Content-Type':'application/json'},body:JSON.stringify({listed:v})});}
  assert.equal((await visibility(true)).status,200);
  const matches=await (await req('/api/registry?q=Elena')).json();assert.equal(matches.entries[0].id,row.id);
  const html=await(await req(path)).text();assert.ok(html.includes(path+'/social.png'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes(email));
  for(const [type,w,h] of [['social',1200,630],['portrait',900,1200]]){const resp=await req(path+'/'+type+'.png');assert.equal(resp.headers.get('content-type'),'image/png');png(Buffer.from(await resp.arrayBuffer()),w,h);}
  assert.equal((await visibility(false)).status,200);assert.equal((await req(path+'/social.png')).status,404);
  assert.equal((await req(path+'/social.png',{headers:auth(key)})).status,200);
  assert.equal((await req(management,{method:'DELETE',headers:auth(key)})).status,200);assert.equal((await req(management,{headers:auth(key)})).status,404);
  const latest=await(await post('/api/register',entry('after deletion'))).json();assert.ok(latest.id>row.id);
  assert.equal((await post('/api/recover',{challenge:'recover',email,phrase})).status,404);
});
test('validation, moderation, CORS and network cap',async()=>{
  for(const body of [entry(0,{name:'Admin'}),entry(0,{name:'@LeventAlpöge'}),entry(0,{name:' '}),entry(0,{message:'x'.repeat(161)}),entry(0,{website:'bot'}),entry(0,{listed:'false'})])assert.equal((await post('/api/register',body,'203.0.113.2')).status,400);
  const originPage='https://1337isnot1337.github.io';
  const cors=await req('/api/register',{method:'OPTIONS',headers:{Origin:originPage}});assert.equal(cors.headers.get('Access-Control-Allow-Origin'),originPage);
  assert.equal((await req('/api/register',{method:'OPTIONS',headers:{Origin:'https://unrelated.example'}})).status,403);
  const row=await(await post('/api/register',entry('moderate'))).json();
  const path='/api/admin/'+row.id;
  assert.equal((await req(path,{method:'DELETE',headers:auth('invalid')})).status,404);
  assert.equal((await req(path,{method:'DELETE',headers:auth('test-admin')})).status,200);
  const block=[];for(let i=0;i<25;i++)block.push((await post('/api/register',entry(i),'203.0.113.9')).status);
  assert.equal(block[0],200);assert.equal(block.at(-1),429);
});
test('published artifacts and public Worker honor the selected release state',async()=>{
  const {REGISTRY_OPEN}=await import('../src/config.js');
  const html=await readFile('dist/pages/index.html','utf8');
  assert.equal(html.includes('<form id="register"'),REGISTRY_OPEN);
  const r=await mf.dispatchFetch('https://w.riemannsolved.com/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(REGISTRY_OPEN){assert.equal(r.status,400);assert.match(html,/registry-api/);}
  else{assert.match(html,/Coming soon/i);assert.equal(r.status,503);assert.doesNotMatch(html,/<form|registry-api/);}
});
test('indexed name-prefix pagination visits each public namesake once',async()=>{
  for(let i=0;i<23;i++)await post('/api/register',entry(i,{name:'Amélie Fields'}),'198.51.100.'+(i+1));
  await post('/api/register',entry(0,{name:'Amélie Private',listed:false}),'198.51.100.77');
  const prefix='/api/registry?q=amelie', first=await(await req(prefix)).json();
  assert.equal(first.entries.length,20);assert.equal(first.more,true);
  const cursor=first.entries.at(-1);
  const next=await(await req(prefix+'&before='+cursor.id+'&afterName='+encodeURIComponent(cursor.name))).json();
  assert.equal(next.more,false);assert.equal(next.entries.length,3);
  assert.equal(new Set([...first.entries,...next.entries].map(w=>w.id)).size,23);
});
test('celebratory profanity is accepted and slur rejection spends neither a number nor a rate-limit hit',async()=>{
  const ip='198.51.100.120';
  const first=await post('/api/register',entry(0,{message:'FUCK YEAH'}),ip);
  assert.equal(first.status,200);
  const row=await first.json();
  assert.equal(row.message,'FUCK YEAH');
  const limitsBefore=await db.prepare('SELECT * FROM limits ORDER BY bucket').all();

  for(const message of ['nigger','n1gg3r','k.i.k.e','f a g g o t','spíc']){
    const response=await post('/api/register',entry(0,{message}),ip);
    assert.equal(response.status,422);
    assert.match((await response.json()).error,/reword your note/i);
  }

  assert.deepEqual((await db.prepare('SELECT * FROM limits ORDER BY bucket').all()).results,limitsBefore.results);
  const second=await post('/api/register',entry(0,{message:'DAMN IM EXCITED'}),ip);
  assert.equal(second.status,200);
  const next=await second.json();
  assert.equal(next.id,row.id+1);
  assert.equal(next.message,'DAMN IM EXCITED');
  const ordinary=await post('/api/register',entry(0,{message:'I told my friend from Scunthorpe and went back to my spice rack.'}),ip);
  assert.equal(ordinary.status,200);
});
test('note-only moderation preserves the signed record and badge while removing the original note from public views',async()=>{
  const original='I wrote this by the observatory.';
  const input=entry(0,{name:'Amélie Fields',message:original});
  const registration=await post('/api/register',input,'198.51.100.121');
  assert.equal(registration.status,200);
  const row=await registration.json();
  const privateInput=entry(0,{name:'Álvaro Private',message:'Private note.',listed:false});
  const privateRegistration=await post('/api/register',privateInput,'198.51.100.122');
  assert.equal(privateRegistration.status,200);
  const privateRow=await privateRegistration.json();
  const path='/w/'+String(row.id).padStart(6,'0');
  const moderation='/api/admin/'+row.id+'/note';
  const lookup='/api/registry?q='+row.id;
  const totalBefore=await (await req('/api/count')).json();
  const badgePaths=[path+'/social.png',path+'/portrait.png'];
  const badgesBefore=await Promise.all(badgePaths.map(async badge=>{
    const response=await req(badge);
    assert.equal(response.status,200);
    return Buffer.from(await response.arrayBuffer());
  }));
  for(const p of [path,'/registry']){
    const response=await req(p);
    assert.equal(response.status,200);
    assert.ok((await response.text()).includes(original));
  }
  assert.deepEqual((await (await req(lookup)).json()).entries,[row]);

  for(const headers of [{},auth('invalid'),auth(input.key)]){
    assert.equal((await req(moderation,{method:'DELETE',headers})).status,404);
  }
  assert.deepEqual((await (await req(lookup)).json()).entries,[row]);

  const admin=auth('test-admin');
  for(const p of [moderation,moderation,'/api/admin/'+privateRow.id+'/note']){
    const response=await req(p,{method:'DELETE',headers:admin});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true});
  }
  const updated={...row,message:'[note removed]'};
  assert.deepEqual((await (await req(lookup)).json()).entries,[updated]);
  assert.deepEqual(await (await req('/api/manage/'+row.id,{headers:auth(input.key)})).json(),updated);
  for(const p of [path,'/registry']){
    const response=await req(p);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.ok(html.includes(updated.message));
    assert.ok(!html.includes(original));
  }
  const badgesAfter=await Promise.all(badgePaths.map(async badge=>{
    const response=await req(badge);
    assert.equal(response.status,200);
    return Buffer.from(await response.arrayBuffer());
  }));
  assert.deepEqual(badgesAfter,badgesBefore);
  assert.deepEqual(await (await req('/api/count')).json(),totalBefore);
  assert.deepEqual((await (await req('/api/registry?q='+privateRow.id)).json()).entries,[]);
  assert.equal((await req('/w/'+String(privateRow.id).padStart(6,'0'))).status,404);
  assert.deepEqual(await (await req('/api/manage/'+privateRow.id,{headers:auth(privateInput.key)})).json(),{...privateRow,message:'[note removed]'});
});
test('Turnstile rejects missing, failed and mismatched verification before registration or recovery writes',async()=>{
  const ip='198.51.100.123';
  const recovery={email:'challenge@example.com',phrase:'turnstile test phrase'};
  const first=await post('/api/register',entry(0,recovery),ip);
  assert.equal(first.status,200);
  const row=await first.json();
  const totalBefore=await (await req('/api/count')).json();
  const limitsBefore=await db.prepare('SELECT * FROM limits ORDER BY bucket').all();

  for(const [path,body,wrongAction,wrongHost] of [
    ['/api/register',entry(0),'recover','wronghost'],
    ['/api/recover',recovery,'valid','wronghost-recover']
  ]){
    for(const [challenge,status] of [
      [undefined,400],['',400],['x'.repeat(2049),400],['failed',403],
      [wrongAction,403],[wrongHost,403],['null-result',403],
      [path==='/api/recover'?'string-success-recover':'string-success',403],
      ['unavailable',503],['malformed',503]
    ]){
      const response=await post(path,{...body,challenge},ip);
      assert.equal(response.status,status,path+' rejected '+JSON.stringify(challenge?.slice(0,30)));
    }
  }

  assert.deepEqual(await (await req('/api/count')).json(),totalBefore);
  assert.deepEqual((await db.prepare('SELECT * FROM limits ORDER BY bucket').all()).results,limitsBefore.results);
  const recovered=await post('/api/recover',{...recovery,challenge:'recover'},ip);
  assert.equal(recovered.status,200);
  assert.deepEqual((await recovered.json()).map(w=>w.id),[row.id]);
  const next=await post('/api/register',entry(0),ip);
  assert.equal(next.status,200);
  assert.equal((await next.json()).id,row.id+1);
});
