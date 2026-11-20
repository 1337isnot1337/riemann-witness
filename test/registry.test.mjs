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
    d1Databases:['DB'],bindings:{REGISTRY_SECRET:token(),ADMIN_TOKEN:'test-admin'},cache:false});
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
function entry(i,more={}){return {name:'Witness '+i,key:token(),message:'',listed:true,...more};}
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
  assert.equal((await post('/api/recover',{email,phrase:'totally wrong phrase'})).status,404);
  const recovered=await (await post('/api/recover',{email,phrase})).json();
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
  assert.equal((await post('/api/recover',{email,phrase})).status,404);
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
test('Pages build uses project-relative assets and absolute social metadata',async()=>{
  const html=await readFile('dist/pages/index.html','utf8');assert.match(html,/meta name="registry-api" content="https:\/\//);assert.match(html,/src="\.\/app.js"/);assert.match(html,/og:image" content="https:\/\/[^"]+\/specimen.png/);assert.match(html,/RIEMANN<br>HYPOTHESIS<br><em>SOLVED\./);
  png(await readFile('dist/pages/specimen.png'),1200,630);
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
