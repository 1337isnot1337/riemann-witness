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
  assert.match(html, /src="\/app.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\.\//);
  assert.doesNotMatch(await readFile('dist/pages/sitemap.xml', 'utf8'), /\/launch\//);
  const image = await readFile('public/registry-card.png');
  assert.deepEqual(await readFile('dist/pages/launch/announcement.png'), image);
  assert.deepEqual(await readFile('dist/pages/coming-soon.png'), image);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});
