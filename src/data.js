import { nameSupported } from './badge.js';

import { RequestError } from './errors.js';
import { checkTokenFormat,verifyChallenge } from './turnstile.js';
import { noteNeedsRewording } from './moderation.js';
export { RequestError };
const fail = (s, msg) => { throw new RequestError(s, msg); };
const encoder = new TextEncoder();
const fields = 'id,name,message,listed,created_at';
export const serial = n => String(n).padStart(6, '0');
const hex = b => Array.from(new Uint8Array(b), n => n.toString(16).padStart(2,'0')).join('');
async function mac(env, text) {
  if (!env.REGISTRY_SECRET) throw new Error('Missing registry secret');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.REGISTRY_SECRET), {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(text)));
}
const ownerKey = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
const cleaned = value => typeof value === 'string' ? value.trim().normalize('NFC') : '';
const keyName = value => value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const reservationKey = value => keyName(value).replace(/[\s\p{P}]+/gu,'');
const reserved = /^(?:(?:the)?(?:riemannregistry|iwashereregistry|admin(?:istrator)?|moderator|support|official|anthropic|claymathematicsinstitute|leventalpoge|bernhardriemann|terencetao))(?:official|admin|team|support)?$/;
const registrationLimit = 24;
const rateLimitExceeded = () => fail(429, 'Too many attempts from this network. Try again next hour.');
async function rateWindow(env, req, action) {
  const now = Math.floor(Date.now()/1000);
  const end = (Math.floor(now/3600)+1)*3600;
  const bucket = await mac(env, JSON.stringify([action, end, req.headers.get('cf-connecting-ip') || 'unknown']));
  return {bucket,end,now};
}
async function throttle(env, req, action, max) {
  const {bucket,end,now} = await rateWindow(env,req,action);
  const [,usage] = await env.DB.batch([
    env.DB.prepare('DELETE FROM limits WHERE expires < ?').bind(now),
    env.DB.prepare('INSERT INTO limits(bucket,expires,hits) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits < ? RETURNING hits').bind(bucket,end,max)
  ]);
  if (!usage.results.length) rateLimitExceeded();
}
function recoveryInput(email, phrase) {
  email = cleaned(email).toLowerCase();
  if (!email || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Enter a valid recovery email.');
  if (typeof phrase!=='string' || phrase.length<12 || phrase.length>180) fail(400,'Choose a recovery phrase between 12 and 180 characters.');
  return JSON.stringify([email, phrase.normalize('NFC')]);
}
export async function register(env, req, body) {
  if (!ownerKey(body.key)) fail(400,'Reload the form and try again.');
  checkTokenFormat(body.challenge);
  const owner = await mac(env,'owner:'+body.key);
  const prior = await env.DB.prepare('SELECT '+fields+' FROM witnesses WHERE owner_hash=?').bind(owner).first();
  if (prior) return prior;
  const name = cleaned(body.name), message = cleaned(body.message);
  if (env.RESERVED_DISPLAY_NAME && reservationKey(name)===reservationKey(env.RESERVED_DISPLAY_NAME)) return null;
  if (body.website || !nameSupported(name) || !name || [...name].length>48) fail(400,'Enter a name of up to 48 characters using Latin, Greek or Cyrillic letters and supported punctuation.');
  if (typeof body.listed !== 'boolean') fail(400,'Choose a visibility setting.');
  if (reserved.test(keyName(name).replace(/[^a-z0-9]/g,''))) fail(400,'This name is reserved. Choose a different name.');
  if ([...message].length>160 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(message)) fail(400,'Use a single line of up to 160 characters for your message.');
  if (/(?:https?:|www\.)/i.test(message+' '+name)) fail(400,'Please leave links out of your entry.');
  if (noteNeedsRewording(message)) fail(422,'Please reword your note to remove identity-based slurs. Your entry has not been submitted.');
  const recovery = body.email || body.phrase ? await mac(env, 'recovery:'+recoveryInput(body.email,body.phrase)) : null;
  await verifyChallenge(env,req,body.challenge,'register');
  const firstPass=typeof body.firstPass==='string' && /^[a-f0-9]{64}$/.test(body.firstPass) ? body.firstPass : '';
  const firstAllowed=!env.FIRST_WITNESS_HASH || (firstPass && hex(await crypto.subtle.digest('SHA-256',encoder.encode(firstPass)))===env.FIRST_WITNESS_HASH);
  const {bucket,end,now} = await rateWindow(env,req,'register');
  const [, , , records, usage] = await env.DB.batch([
    env.DB.prepare('DELETE FROM limits WHERE expires < ?').bind(now),
    env.DB.prepare(`
      INSERT INTO witnesses(name,name_key,message,listed,owner_hash,recovery_hash)
      SELECT ?,?,?,?,?,?
      WHERE NOT EXISTS (SELECT 1 FROM witnesses WHERE owner_hash=?)
        AND (?=1 OR EXISTS (SELECT 1 FROM sqlite_sequence WHERE name='witnesses' AND seq>0))
        AND COALESCE((SELECT hits FROM limits WHERE bucket=?),0) < ?
    `).bind(name,keyName(name),message,+body.listed,owner,recovery,owner,firstAllowed?1:0,bucket,registrationLimit),
    // SQLite changes() refers to the immediately preceding insert, excluding triggers.
    env.DB.prepare(`
      INSERT INTO limits(bucket,expires,hits)
      SELECT ?,?,1 WHERE changes()=1
      ON CONFLICT(bucket) DO UPDATE SET hits=hits+1
    `).bind(bucket,end),
    env.DB.prepare('SELECT '+fields+' FROM witnesses WHERE owner_hash=?').bind(owner),
    env.DB.prepare('SELECT hits FROM limits WHERE bucket=?').bind(bucket)
  ]);
  if (records.results.length) return records.results[0];
  if (usage.results[0]?.hits >= registrationLimit) rateLimitExceeded();
  fail(425,'The first witness is signing. Please try again in a moment.');
}
export async function recover(env, req, body) {
  checkTokenFormat(body.challenge);
  const recovery = recoveryInput(body.email,body.phrase);
  await verifyChallenge(env,req,body.challenge,'recover');
  await throttle(env,req,'recover',12);
  const hash = await mac(env,'recovery:'+recovery);
  const {results} = await env.DB.prepare('SELECT id,name FROM witnesses WHERE recovery_hash=? ORDER BY id DESC LIMIT 50').bind(hash).all();
  if (!results.length) fail(404,'No matching entry. Check your email and recovery phrase.');
  return Promise.all(results.map(async row => ({...row,key:await mac(env,'restore:'+row.id+':'+hash)})));
}
export async function getWitness(env, id, key, requireOwner=false) {
  if (!Number.isSafeInteger(id) || id<1) fail(404,'Entry unavailable.');
  if (!key && !requireOwner) {
    const row = await env.DB.prepare('SELECT '+fields+' FROM witnesses WHERE id=? AND listed=1').bind(id).first();
    if (!row) fail(404,'Entry unavailable.');
    return row;
  }
  const row = await env.DB.prepare('SELECT '+fields+',owner_hash,recovery_hash FROM witnesses WHERE id=?').bind(id).first();
  if (!row || !ownerKey(key)) fail(404,'Entry unavailable.');
  const {owner_hash,recovery_hash,...safe} = row;
  if (await mac(env,'owner:'+key)!==owner_hash && (!recovery_hash || await mac(env,'restore:'+id+':'+recovery_hash)!==key)) fail(404,'Entry unavailable.');
  return safe;
}
export async function manage(env,req,id,key,body) {
  await getWitness(env,id,key,true);
  if (req.method==='DELETE') await env.DB.prepare('DELETE FROM witnesses WHERE id=?').bind(id).run();
  else {
    if (typeof body.listed!=='boolean') fail(400,'Choose a visibility setting.');
    await env.DB.prepare('UPDATE witnesses SET listed=? WHERE id=?').bind(+body.listed,id).run();
  }
  return {ok:true};
}
export async function registry(env,params) {
  const q=cleaned(params.get('q')).slice(0,64);
  const sort=params.get('order'), oldest=sort==='oldest';
  if (sort!==null && !oldest && sort!=='newest') fail(400,'Invalid order.');
  const before=params.get('before'), after=params.get('after');
  const rawCursor=oldest?after:before;
  const cursor=Number(rawCursor||(oldest?0:Number.MAX_SAFE_INTEGER));
  if ((oldest?before:after) || !Number.isSafeInteger(cursor) || (rawCursor && cursor<1)) fail(400,'Invalid page.');
  let sql='SELECT '+fields+' FROM witnesses WHERE listed=1', order=oldest?'id ASC':'id DESC';
  const args=[];
  const number=/^#?\d+$/.test(q);
  if (number) {
    const id=Number(q.replace('#',''));
    sql+=' AND id=?';args.push(Number.isSafeInteger(id)?id:0);
  } else if (q) {
    const prefix=keyName(q);sql+=' AND name_key>=? AND name_key<?';
    args.push(prefix,prefix+'\u{10ffff}');
    if (sort===null) {
      order='name_key,id';
      const name=params.get('afterName');
      if (name!==null) {sql+=' AND (name_key,id)>(?,?)';args.push(keyName(name.slice(0,128)),cursor);}
    }
  }
  if (rawCursor && (sort!==null || !q)) {
    sql+=oldest?' AND id>?':' AND id<?';
    args.push(cursor);
  }
  const {results}=await env.DB.prepare(sql+' ORDER BY '+order+' LIMIT 21').bind(...args).all();
  return {entries:results.slice(0,20),more:results.length>20};
}
export async function count(env) {
  return env.DB.prepare('SELECT participants AS total, public_participants AS public, participants-public_participants AS private FROM totals WHERE id=1').first();
}
export async function moderate(env,req,id,noteOnly=false) {
  if (!Number.isSafeInteger(id) || id<1 || !env.ADMIN_TOKEN || req.headers.get('Authorization')!=='Bearer '+env.ADMIN_TOKEN) fail(404,'Entry unavailable.');
  const statement=noteOnly ? "UPDATE witnesses SET message='[note removed]' WHERE id=?" : 'DELETE FROM witnesses WHERE id=?';
  const result=await env.DB.prepare(statement).bind(id).run();
  if(!result.meta.changes)fail(404,'Entry unavailable.');
  return {ok:true};
}
