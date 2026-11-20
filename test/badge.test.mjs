import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inflateSync} from 'node:zlib';
import {badgePng,nameSupported} from '../src/badge.js';

const render=(name,portrait=false,rest={})=>badgePng({
  id:87,name,created_at:'2026-11-20T19:22:00.000Z',...rest
},portrait,'riemannsolved.com');

function pngChunks(png){
  const bytes=Buffer.from(png),chunks=[];
  for(let offset=8;offset<bytes.length;){
    const length=bytes.readUInt32BE(offset);
    chunks.push({type:bytes.toString('ascii',offset+4,offset+8),data:bytes.subarray(offset+8,offset+8+length)});
    offset+=length+12;
  }
  return chunks;
}

test('badge names retain Vietnamese, polytonic Greek and Cyrillic stress marks',async()=>{
  for(const name of ['Nguyễn Thị Minh Khai','Trần Đình Long','Αἰμιλία Ἀλεξάνδρου','Лев Толсто́й','Anne‑Marie\u00a0Dubois']){
    assert.ok(nameSupported(name),name);
    assert.ok(nameSupported(name.normalize('NFD')),name);
    assert.deepEqual(await render(name),await render(name.normalize('NFD')));
  }
  assert.notDeepEqual(await render('Лев Толсто́й'), await render('Лев Толстой'));
  assert.equal(nameSupported('\u0301'),false);
  assert.equal(nameSupported('a'.repeat(49)),false);
});

test('a long portrait name retains its thin em dash',async()=>{
  const name='W'.repeat(20)+' — '+'W'.repeat(25);
  assert.equal(name.length,48);
  const chunks=pngChunks(await render(name,true));
  const rows=inflateSync(Buffer.concat(chunks.filter(chunk=>chunk.type==='IDAT').map(chunk=>chunk.data)));
  const width=900,stride=width+1;
  assert.equal(rows.length,1200*stride);
  // The name has a space on either side of the dash so this crop is just its ink.
  const dash=rows.subarray(1063*stride+275+1,1063*stride+286+1);
  assert.ok(dash.every(value=>value>104));
});

test('badge bytes contain no private record fields or PNG metadata',async()=>{
  const name='Example Witness';
  const output=await render(name,false,{
    listed:0,message:'Personal note',recovery_hash:'fixture-recovery',owner_hash:'fixture-owner'
  });
  assert.deepEqual(output,await render(name,false,{listed:1}));
  assert.deepEqual(pngChunks(output).map(chunk=>chunk.type),['IHDR','PLTE','IDAT','IDAT','IEND']);
});
