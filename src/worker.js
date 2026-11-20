import {badgePng} from './badge.js';
import {RequestError, register,recover,registry,count,manage,moderate,getWitness,serial} from './data.js';
import {home,page,utility,witnessPage,esc} from './pages.js';
import {archivePage,historyPage,witnessSitemap} from './discovery.js';
import holding from '../holding/index.html';
import {API,SITE,REGISTRY_OPEN} from './config.js';
const json = data => Response.json(data,{headers:{'Cache-Control':'no-store'}});
function unsupported(){throw new RequestError(405,'Method unavailable.');}
async function payload(req) {
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw new RequestError(415,'Send a JSON form.');
  const reader=req.body?.getReader();if(!reader)throw new RequestError(400,'Empty form.');
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new RequestError(413,'The form is too large.');}chunks.push(value);}
  try {const value=JSON.parse(await new Blob(chunks).text());if(!value || Array.isArray(value)||typeof value!=='object')throw Error();return value;}
  catch{throw new RequestError(400,'Invalid form.');}
}
const frontends=new Set([new URL(SITE).origin,'https://riemannsolved.com','https://www.riemannsolved.com','https://1337isnot1337.github.io']);
function restrictOrigin(req,url) {
  const origin=req.headers.get('Origin');
  if(origin && origin!==url.origin && (!frontends.has(origin) || !['/api/register','/api/count','/api/registry'].includes(url.pathname)))throw new RequestError(403,'Origin unavailable.');
}
async function route(req,env,ctx,url) {
  const {pathname:path,origin}=url,read=req.method==='GET'||req.method==='HEAD';
  restrictOrigin(req,url);
  if(req.method==='OPTIONS')return new Response(null,{status:204});
  const preview=env.LOCAL_REGISTRY_PREVIEW==='1' && ['localhost','127.0.0.1','registry.example'].includes(url.hostname);
  if(!REGISTRY_OPEN && !preview){
    if(read && path==='/')return new Response(holding,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, follow'}});
    if(read && path==='/robots.txt')return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain'}});
    if(read && ['/holding.css','/coming-soon.png','/seal.svg','/art/critical-strip.svg','/fonts/gloock.woff2'].includes(path) && env.ASSETS)return env.ASSETS.fetch(req);
    return Response.json({error:'The witness registry is coming soon.'},{status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex','Retry-After':'86400'}});
  }
  if(path==='/')return url.hostname==='w.riemannsolved.com'?Response.redirect(SITE,302):home(url.hostname.endsWith('.workers.dev')?new URL(SITE).origin:origin);
  if(path==='/api/register'&&req.method==='POST')return json(await register(env,req,await payload(req)));
  if(path==='/api/recover'&&req.method==='POST')return json(await recover(env,req,await payload(req)));
  if(path==='/api/count'&&read){
    const cache=globalThis.caches?.default,key=origin+'/api/count',hit=await cache?.match(key);
    if(hit)return hit;
    const resp=Response.json({total:await count(env)},{headers:{'Cache-Control':'public, max-age=20'}});
    if(cache && ctx)ctx.waitUntil(cache.put(key,resp.clone()));return resp;
  }
  if(path==='/api/registry'&&read)return json(await registry(env,url.searchParams));
  const key=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  const owner=/^\/api\/manage\/([1-9]\d*)$/.exec(path);
  if(owner){const id=Number(owner[1]);
    if(read)return json(await getWitness(env,id,key,true));
    if(['DELETE','PATCH'].includes(req.method))return json(await manage(env,req,id,key,req.method==='PATCH'?await payload(req):{}));
    unsupported();}
  const admin=/^\/api\/admin\/([1-9]\d*)$/.exec(path);
  if(admin && req.method==='DELETE')return json(await moderate(env,req,Number(admin[1])));
  if(!read)unsupported();
  if(['/manage','/recover','/privacy'].includes(path))return utility(origin,path.slice(1));
  const card=/^\/w\/(\d{1,15})(?:\/(social|portrait)\.png)?$/.exec(path);
  if(card){
    const id=Number(card[1]),w=await getWitness(env,id,card[2]?key:null);
    if(card[2]){
      const disposition=url.searchParams.has('download')?'attachment':'inline';
      const headers={'Content-Type':'image/png','Cache-Control':'private, no-store','Content-Disposition':disposition+'; filename="riemann-witness-'+serial(id)+'-'+card[2]+'.png"'};
      return new Response(req.method==='HEAD'?null:await badgePng(w,card[2]==='portrait',new URL(SITE).hostname),{headers});
    }
    if(card[1]!==serial(id))return Response.redirect(origin+'/w/'+serial(id),301);
    return witnessPage(origin.endsWith('.workers.dev')?API:origin,w);
  }
  if(path==='/specimen.png')return new Response(await badgePng(null,false,new URL(SITE).hostname),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});
  if(path==='/robots.txt')return new Response('User-agent: *\nDisallow: /api/\nDisallow: /manage\nDisallow: /recover\nSitemap: '+origin+'/sitemap.xml');
  if(path==='/sitemap.xml'||path.startsWith('/sitemaps/'))return witnessSitemap(env,origin,path);
  if(path==='/registry')return archivePage(env,origin,url.searchParams);
  if(path==='/history/'||path==='/history')return url.hostname==='localhost'||url.hostname==='127.0.0.1'?historyPage():Response.redirect(SITE+'history/',301);
  if(path.startsWith('/api/'))throw new RequestError(404,'Route unavailable.');
  if(env.ASSETS){const asset=await env.ASSETS.fetch(req);if(asset.status!==404)return asset;}
  throw new RequestError(404,'Entry unavailable.');
}
export default {async fetch(req,env,ctx) {
  const url=new URL(req.url);
  let response;
  try{response=await route(req,env,ctx,url);}
  catch(err){
    const status=err instanceof RequestError?err.status:500,msg=status===500?'The registry is temporarily unavailable. Please try again shortly.':err.message;
    if(status===500)console.error('Registry request failed',err.name);
    response=url.pathname.startsWith('/api/')||url.pathname.endsWith('.png')?Response.json({error:msg},{status,headers:{'Cache-Control':'no-store'}}):page(url.origin,{status,title:msg,description:msg,path:url.pathname,noindex:true,body:'<main class="sub" id="main"><h1>'+esc(msg)+'</h1><p><a href="/">Return to the register</a></p></main>'});
  }
  const out=new Response(req.method==='HEAD'?null:response.body,response);
  if(frontends.has(req.headers.get('Origin'))){
    out.headers.set('Access-Control-Allow-Origin',req.headers.get('Origin'));
    out.headers.set('Access-Control-Allow-Methods','GET, HEAD, POST, OPTIONS');
    out.headers.set('Access-Control-Allow-Headers','Content-Type');
    out.headers.set('Access-Control-Max-Age','86400');out.headers.append('Vary','Origin');
  }
  if(url.hostname.endsWith('.workers.dev'))out.headers.set('X-Robots-Tag','noindex, follow');
  out.headers.set('Referrer-Policy','no-referrer');out.headers.set('X-Content-Type-Options','nosniff');out.headers.set('X-Frame-Options','DENY');
  out.headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return out;
}};
