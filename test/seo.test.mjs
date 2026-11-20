import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {after,before,test} from 'node:test';
import {Miniflare} from 'miniflare';
import {API,REGISTRY_OPEN,SITE} from '../src/config.js';

const origin='https://registry.example';
let mf,db;
before(async()=>{
  mf=new Miniflare({modules:true,compatibilityDate:'2026-05-01',scriptPath:'dist/server/index.js',
    d1Databases:['DB'],bindings:{LOCAL_REGISTRY_PREVIEW:'1'}});
  db=await mf.getD1Database('DB');
  const sql=await readFile('migrations/0001_registry.sql','utf8');
  for(const statement of sql.trim().split(/;\s*\n(?=CREATE |INSERT )/))await db.prepare(statement).run();
  const insert=db.prepare('INSERT INTO witnesses(id,name,name_key,listed,owner_hash) VALUES(?,?,?,?,?)');
  await db.batch([
    ...Array.from({length:22},(_,i)=>insert.bind(i+1,'Public '+(i+1),'public',1,'fixture-'+(i+1))),
    insert.bind(2001,'Private 2001','private',0,'fixture-2001'),
    insert.bind(4001,'Public 4001','public',1,'fixture-4001')
  ]);
});
after(async()=>{await mf?.dispose();});

const request=(path,init={})=>mf.dispatchFetch(origin+path,{redirect:'manual',...init});
const locations=body=>Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/g),match=>match[1]);

test('archive hrefs and canonical URLs let crawlers walk each distinct page',async()=>{
  const root=await request('/registry');
  assert.equal(root.status,200);
  const html=await root.text();
  assert.ok(html.includes(`<link rel="canonical" href="${origin}/registry">`));
  assert.ok(html.includes('<a href="/w/004001">'));
  assert.ok(!html.includes('Private 2001'));
  const older=html.match(/<a href="(\/registry\?before=\d+)">Older signatures<\/a>/)?.[1];
  assert.equal(older,'/registry?before=4');
  const next=await request(older);
  assert.equal(next.status,200);
  const nextHtml=await next.text();
  assert.ok(nextHtml.includes(`<link rel="canonical" href="${origin}${older}">`));
  assert.ok(nextHtml.includes('<a href="/w/000001">'));
  assert.ok(!nextHtml.includes('<a href="/w/000004">'));
  assert.ok(nextHtml.includes('<a href="/registry">Newest signatures</a>'));
});

test('archive syntax variants consolidate and invalid or empty cursors return 404',async()=>{
  for(const [path,target] of [
    ['/registry/','/registry'],
    ['/registry?before=&utm_source=example','/registry'],
    ['/registry/?before=%30%30%34&extra=yes','/registry?before=4'],
    ['/registry?before=4&before=5','/registry?before=4'],
  ]){
    const response=await request(path);
    assert.equal(response.status,301,path);
    assert.equal(response.headers.get('location'),origin+target);
  }
  for(const query of ['1','0','-2','2e0','2.0','999999999999999','9007199254740992']){
    const response=await request('/registry?before='+query);
    assert.equal(response.status,404,query);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
  }
});

test('sitemaps list only existing public pages and update after consent withdrawal',async()=>{
  const index=await request('/sitemap.xml');
  assert.match(index.headers.get('content-type'),/^application\/xml/);
  assert.deepEqual(locations(await index.text()),[
    origin+'/sitemap-registry.xml',origin+'/sitemap-witnesses-0.xml',origin+'/sitemap-witnesses-2.xml'
  ]);
  const general=await request('/sitemap-registry.xml');
  assert.deepEqual(locations(await general.text()),[origin+'/registry',origin+'/privacy']);
  const legacy=await request('/sitemaps/witnesses-0.xml');
  assert.equal(legacy.status,301);
  assert.equal(legacy.headers.get('location'),origin+'/sitemap-witnesses-0.xml');
  const newest=await request('/sitemap-witnesses-2.xml');
  assert.deepEqual(locations(await newest.text()),[origin+'/w/004001']);
  assert.equal((await request('/sitemap-witnesses-1.xml')).status,404);
  await db.prepare('UPDATE witnesses SET listed=0 WHERE id=4001').run();
  assert.equal((await request('/sitemap-witnesses-2.xml')).status,404);
  assert.ok(!locations(await(await request('/sitemap.xml')).text()).includes(origin+'/sitemap-witnesses-2.xml'));
  for(const path of ['/w/004001','/w/4001','/w/004001/social.png','/w/002001','/w/009999']){
    const response=await request(path);
    assert.equal(response.status,404,path);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
    assert.doesNotMatch(await response.text(),/Public 4001|Private 2001/);
  }
});

test('published witness previews and crawl directives are available to bots',async()=>{
  const short=await request('/w/1');
  assert.equal(short.status,301);
  assert.equal(short.headers.get('location'),origin+'/w/000001');
  const card=await request('/w/000001?source=share');
  assert.equal(card.status,200);
  const html=await card.text(),image=origin+'/w/000001/social.png';
  assert.ok(html.includes(`<link rel="canonical" href="${origin}/w/000001">`));
  assert.ok(html.includes(`<meta property="og:image" content="${image}">`));
  assert.ok(html.includes(`<meta name="twitter:image" content="${image}">`));
  assert.ok(html.includes('<a href="/registry">'));
  const png=await request('/w/000001/social.png');
  assert.equal(png.status,200);
  assert.equal(png.headers.get('content-type'),'image/png');
  const bytes=Buffer.from(await png.arrayBuffer());
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  assert.equal(bytes.readUInt32BE(16),1200);
  assert.equal(bytes.readUInt32BE(20),630);
  const robots=await(await request('/robots.txt')).text();
  assert.match(robots,/Disallow: \/api\//);
  assert.doesNotMatch(robots,/Disallow: \/(?:manage|recover)/);
  assert.ok(robots.includes('Sitemap: '+origin+'/sitemap.xml'));
  for(const path of ['/manage','/recover']){
    const response=await request(path);
    assert.equal(response.status,200);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
    assert.match(await response.text(),/<meta name="robots" content="noindex,nofollow">/);
  }
  if(REGISTRY_OPEN){
    const brandedRoot=await mf.dispatchFetch(API+'/',{redirect:'manual'});
    assert.equal(brandedRoot.status,301);
    assert.equal(brandedRoot.headers.get('location'),SITE);
  }
});
