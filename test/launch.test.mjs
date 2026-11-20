import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
test('the first witness must claim their own number; later visitors can register immediately',async()=>{
  const random=()=>randomBytes(32).toString('hex'),pass=random(),expected=createHash('sha256').update(pass).digest('hex');
  const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-01',scriptPath:'dist/server/index.js',
    d1Databases:['DB'],bindings:{REGISTRY_SECRET:random(),LOCAL_REGISTRY_PREVIEW:'1',TURNSTILE_SECRET:'fixture',FIRST_WITNESS_HASH:expected},
    outboundService:async()=>Response.json({success:true,hostname:'riemannsolved.com',action:'register'})});
  try{
    const db=await mf.getD1Database('DB');
    for(const st of (await readFile('migrations/0001_registry.sql','utf8')).trim().split(/;\s*\n(?=CREATE |INSERT )/))await db.prepare(st).run();
    async function claim(firstPass){return mf.dispatchFetch('https://registry.example/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:random(),name:'Fixture',listed:false,firstPass,challenge:'valid'})});}
    assert.equal((await claim('')).status,425);
    assert.equal((await claim(random())).status,425);
    assert.equal((await(await claim(pass)).json()).id,1);
    assert.equal((await(await claim('')).json()).id,2);
  }finally{await mf.dispose();}
});
