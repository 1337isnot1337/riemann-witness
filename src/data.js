import { nameSupported } from './badge.js';

export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
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
const reserved = /^(?:(?:the)?(?:riemannregistry|iwashereregistry|admin(?:istrator)?|moderator|support|official|anthropic|claymathematicsinstitute|leventalpoge|bernhardriemann|terencetao))(?:official|admin|team|support)?$/;
async function throttle(env, req, action, max) {
  const now = Math.floor(Date.now()/1000);
  const end = (Math.floor(now/3600)+1)*3600;
  const bucket = await mac(env, JSON.stringify([action, end, req.headers.get('cf-connecting-ip') || 'unknown']));
  await env.DB.prepare('DELETE FROM limits WHERE expires < ?').bind(now).run();
  const row = await env.DB.prepare('INSERT INTO limits(bucket,expires,hits) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits < ? RETURNING hits').bind(bucket,end,max).first();
  if (!row) fail(429, 'Too many attempts from this network. Try again next hour.');
}
function recoveryInput(email, phrase) {
  email = cleaned(email).toLowerCase();
  if (!email || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Enter a valid recovery email.');
  if (typeof phrase!=='string' || phrase.length<12 || phrase.length>180) fail(400,'Choose a recovery phrase between 12 and 180 characters.');
  return JSON.stringify([email, phrase.normalize('NFC')]);
}
export async function register(env, req, body) {
  if (!ownerKey(body.key)) fail(400,'Reload the form and try again.');
  const owner = await mac(env,'owner:'+body.key);
  const prior = await env.DB.prepare('SELECT '+fields+' FROM witnesses WHERE owner_hash=?').bind(owner).first();
  if (prior) return prior;
  await throttle(env,req,'register',24);
  const name = cleaned(body.name), message = cleaned(body.message);
  if (body.website || !nameSupported(name) || !name || [...name].length>48) fail(400,'Enter a name of up to 48 characters using Latin, Greek or Cyrillic letters and supported punctuation.');
  if (typeof body.listed !== 'boolean') fail(400,'Choose a visibility setting.');
  if (reserved.test(keyName(name).replace(/[^a-z0-9]/g,''))) fail(400,'This name is reserved. Choose a different name.');
  if ([...message].length>160 || /[\p{Cc}\p{Cf}]/u.test(message)) fail(400,'Use a single line of up to 160 characters for your message.');
  if (/(?:https?:|www\.)/i.test(message+' '+name)) fail(400,'Please leave links out of your entry.');
  const recovery = body.email || body.phrase ? await mac(env, 'recovery:'+recoveryInput(body.email,body.phrase)) : null;
  // The conditional INSERT keeps idempotent retries from consuming a number.
  await env.DB.prepare('INSERT INTO witnesses(name,name_key,message,listed,owner_hash,recovery_hash) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM witnesses WHERE owner_hash=?)').bind(name,keyName(name),message,+body.listed,owner,recovery,owner).run();
  return env.DB.prepare('SELECT '+fields+' FROM witnesses WHERE owner_hash=?').bind(owner).first();
}
export async function recover(env, req, body) {
  await throttle(env,req,'recover',12);
  const hash = await mac(env,'recovery:'+recoveryInput(body.email,body.phrase));
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
  const before=Number(params.get('before')||Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(before) || before<1) fail(400,'Invalid page.');
  let sql='SELECT '+fields+' FROM witnesses WHERE listed=1', order='id DESC';
  const args=[];
  if (/^#?\d+$/.test(q)) {
    sql+=' AND id=?';args.push(Number(q.replace('#',''))||0);
  } else if (q) {
    const prefix=keyName(q);sql+=' AND name_key>=? AND name_key<?';
    args.push(prefix,prefix+'\u{10ffff}');order='name_key,id';
    const cursor=params.get('afterName');
    if (cursor!==null) {sql+=' AND (name_key,id)>(?,?)';args.push(keyName(cursor.slice(0,128)),before);}
  } else {sql+=' AND id<?';args.push(before);}
  const {results}=await env.DB.prepare(sql+' ORDER BY '+order+' LIMIT 21').bind(...args).all();
  return {entries:results.slice(0,20),more:results.length>20};
}
export async function count(env) { return (await env.DB.prepare('SELECT participants AS total FROM totals WHERE id=1').first()).total; }
export async function moderate(env,req,id) {
  if (!env.ADMIN_TOKEN || req.headers.get('Authorization')!=='Bearer '+env.ADMIN_TOKEN) fail(404,'Entry unavailable.');
  await env.DB.prepare('DELETE FROM witnesses WHERE id=?').bind(id).run();
  return {ok:true};
}
