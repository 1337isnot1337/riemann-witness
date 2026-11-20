import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REGISTRY_OPEN, SITE } from '../src/config.js';

test('the announcement has its own large card and opens the canonical registration experience', { skip: !REGISTRY_OPEN }, async () => {
  const html = await readFile('dist/pages/launch/index.html', 'utf8');
  assert.ok(html.includes('<link rel="canonical" href="' + SITE + '">'));
  assert.ok(html.includes('<meta property="og:url" content="' + SITE + 'launch/">'));
  for (const attribute of ['property="og:image"', 'name="twitter:image"']) {
    assert.ok(html.includes('<meta ' + attribute + ' content="' + SITE + 'launch/announcement.png">'));
  }
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /<form id="register"/);
  assert.match(html, /src="\/app\.js\?v=[0-9a-f]{12}"/);
  assert.doesNotMatch(html, /(?:href|src)="\.\//);
  assert.doesNotMatch(await readFile('dist/pages/sitemap.xml', 'utf8'), /\/launch\//);
  const image = await readFile('public/registry-card.png');
  assert.deepEqual(await readFile('dist/pages/launch/announcement.png'), image);
  assert.deepEqual(await readFile('dist/pages/coming-soon.png'), image);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test('movement is an optional layer on each registration landing page', { skip: !REGISTRY_OPEN }, async () => {
  for(const path of ['index.html','launch/index.html','join/index.html']){
    const html=await readFile('dist/pages/'+path,'utf8');
    assert.match(html, /data-webgl-notice role="status" hidden/);
    assert.match(html, /<div class="plate-stage"><img[^>]*critical-strip\.svg/);
    assert.match(html, /<button[^>]*data-motion-switch[^>]*aria-label="Pause animation"/);
    for(const script of ['hero-motion','plate-motion','plate-orbit','claim-motion']){
      const url=html.match(new RegExp('src="([^"]*'+script+'\\.js\\?v=[a-f0-9]{12})"'));
      assert.ok(url,script+' is missing its asset version');
      const asset=new URL(url[1], SITE+path);
      assert.equal(asset.pathname,'/'+script+'.js');
      assert.ok((await readFile('dist/pages'+asset.pathname)).length>0);
    }
  }
  assert.doesNotMatch(await readFile('dist/pages/history/index.html','utf8'), /src="[^"]*plate-orbit\.js/);
});

test('public badge referrals open a measurable registration path with a homepage canonical', {skip:!REGISTRY_OPEN},async()=>{
  const {witnessPage}=await import('../src/pages.js');
  const html=await witnessPage('https://w.riemannsolved.com',{id:1,name:'A witness',created_at:'2026-11-20T19:32:00Z'}).text();
  assert.ok(html.includes('href="'+SITE+'join/#sign">Get my own badge'));
  const landing=await readFile('dist/pages/join/index.html','utf8');
  assert.ok(landing.includes('<link rel="canonical" href="'+SITE+'">'));
  assert.match(landing,/<section[^>]*id="sign"/);
  assert.doesNotMatch(landing,/(?:href|src)="\.\//);
  assert.doesNotMatch(await readFile('dist/pages/sitemap.xml','utf8'),/\/join\//);
});
