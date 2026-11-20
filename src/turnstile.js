import {RequestError} from './errors.js';
const productionHosts=new Set(['riemannsolved.com','www.riemannsolved.com','w.riemannsolved.com','riemann-witness.canvaswork.workers.dev']);
export const publicSitekey='0x4AAAAAAGKs3FSFV06aVQn1';
export function localHost(host){return ['localhost','127.0.0.1','registry.example'].includes(host);}
export function checkTokenFormat(token){
  if(typeof token!=='string'||!token.length||token.length>2048)throw new RequestError(400,'Complete the spam check and try again.');
}
export async function verifyChallenge(env,req,token,action){
  if(!env.TURNSTILE_SECRET)throw new RequestError(503,'The spam check is temporarily unavailable.');
  const payload=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token});
  const ip=req.headers.get('CF-Connecting-IP');if(ip)payload.set('remoteip',ip);
  let result;
  try{
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:payload,signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error();
    result=await response.json();
  }catch{throw new RequestError(503,'The spam check is temporarily unavailable. Try again shortly.');}
  const local=localHost(new URL(req.url).hostname);
  const testKey=env.TURNSTILE_SECRET==='1x0000000000000000000000000000000AA';
  // Cloudflare's documented development keys return a fixed test result.
  const developmentResult=local && testKey;
  if(result?.success!==true || (testKey && !local) || (!developmentResult && (result.action!==action || !productionHosts.has(result.hostname))))
    throw new RequestError(403,'Please repeat the spam check and try again.');
}
