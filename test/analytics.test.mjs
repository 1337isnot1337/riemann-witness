import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {REGISTRY_OPEN} from '../src/config.js';

test('the production Pages build has analytics on public pages only',async()=>{
  const beacon=/https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js/g;
  const html=await readFile('dist/pages/index.html','utf8');
  assert.equal([...html.matchAll(beacon)].length,1);
  if(REGISTRY_OPEN){
    const history=await readFile('dist/pages/history/index.html','utf8');
    assert.equal([...history.matchAll(beacon)].length,1);
  }
  const worker=await readFile('dist/server/index.js','utf8');
  assert.doesNotMatch(worker,beacon);
});

test('issuance totals count successful certificate inserts once and survive deletion',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(await readFile('migrations/0001_registry.sql','utf8'));
    db.exec(await readFile('migrations/0002_certificate_issuance.sql','utf8'));
    const register=db.prepare(`INSERT INTO witnesses (name,name_key,listed,owner_hash,created_at)
      SELECT 'Example','example',?,?,? WHERE NOT EXISTS (SELECT 1 FROM witnesses WHERE owner_hash=?)`);
    const first='2026-11-20T23:59:59.000Z',second='2026-11-21T00:00:00.000Z';
    register.run(1,'first',first,'first');
    register.run(1,'first',first,'first');
    register.run(0,'second',first,'second');
    register.run(1,'third',second,'third');
    db.exec("UPDATE witnesses SET message='Edited' WHERE owner_hash='third'; DELETE FROM witnesses WHERE owner_hash='first'");
    db.exec('BEGIN');
    register.run(1,'rolled back',second,'rolled back');
    db.exec('ROLLBACK');
    const days=db.prepare('SELECT day_utc, certificates FROM certificate_issuance_daily ORDER BY day_utc').all();
    assert.deepEqual(days.map(row=>[row.day_utc,row.certificates]),[['2026-11-20',2],['2026-11-21',1]]);
    assert.equal(db.prepare('SELECT participants FROM totals').get().participants,2);
  }finally{
    db.close();
  }
});
