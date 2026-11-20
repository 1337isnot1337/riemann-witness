import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir,readFile,writeFile,cp,rm } from 'node:fs/promises';
import {historyPage} from '../src/discovery.js';
import {home} from '../src/pages.js';
import {badgePng} from '../src/badge.js';
import {SITE,API,REGISTRY_OPEN} from '../src/config.js';
const preview=process.argv.includes('--preview');
const pages=preview?'dist/preview-pages':'dist/pages';
const full=preview||REGISTRY_OPEN;
const beacon=`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"683cea5ed4a045c3abb56adbc6294bdd"}'></script>`;
const assetHashes=new Map(await Promise.all(['app.js','style.css','hero-motion.js','plate-motion.js','plate-orbit.js','claim-motion.js'].map(async file=>[
  file,createHash('sha256').update(await readFile('public/'+file)).digest('hex').slice(0,12)
])));
const staticPolicy=[
  "default-src 'self'", "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "connect-src 'self' "+API+" https://challenges.cloudflare.com https://cloudflareinsights.com",
  "frame-src https://challenges.cloudflare.com", "img-src 'self' data:", "object-src 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ');
function writePublicHtml(file,html){
  const current=html.replace(/((?:src|href)="(?:\.\/|\/))(app\.js|style\.css|hero-motion\.js|plate-motion\.js|plate-orbit\.js|claim-motion\.js)"/g,
    (_,prefix,asset)=>prefix+asset+'?v='+assetHashes.get(asset)+'"');
  const protectedHtml=current.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+staticPolicy+'">');
  return writeFile(pages+'/'+file,preview?protectedHtml:protectedHtml.replace('</body>',beacon+'</body>'));
}
if(!preview){
  await mkdir('dist/server',{recursive:true});
  await build({entryPoints:['src/worker.js'],outfile:'dist/server/index.js',loader:{'.html':'text'},bundle:true,format:'esm',target:'es2022',platform:'browser',minify:true,legalComments:'none'});
}
await rm(pages,{recursive:true,force:true});
if(!full){
  await mkdir(pages,{recursive:true});
  await writePublicHtml('index.html',await readFile('holding/index.html','utf8'));
  for(const file of ['holding.css','coming-soon.png','seal.svg','art/critical-strip.svg','fonts/gloock.woff2','fonts/OFL-Gloock.txt']){
    await cp('public/'+file,pages+'/'+file);
  }
}else{
  await cp('public',pages,{recursive:true});
  async function landingHtml(launch=false){
    const html=await home(new URL(SITE).origin,launch).text();
    return html.replace('<head>','<head><meta name="registry-api" content="'+API+'">')
    .replaceAll('href="/#','href="#').replaceAll('href="/"','href="./"')
    .replace(/href="\/(recover|privacy)"/g,(_,p)=>'href="'+API+'/'+p+'"')
    .replace(/(src|href)="\/([^"]+)"/g,'$1="./$2"')
    .replaceAll(new URL(SITE).origin+'/specimen.png',SITE+'specimen.png')
    .replaceAll('content="'+new URL(SITE).origin+'/"','content="'+SITE+'"')
    .replaceAll('href="'+new URL(SITE).origin+'/"','href="'+SITE+'"');
  }
  await writePublicHtml('index.html',await landingHtml());
  await mkdir(pages+'/launch',{recursive:true});
  const launchHtml=(await landingHtml(true)).replace(/(src|href)="\.\/([^"]*)"/g,'$1="/$2"');
  await writePublicHtml('launch/index.html',launchHtml);
  await cp('public/registry-card.png',pages+'/launch/announcement.png');
  // Earlier shares can still request the prelaunch image by its original URL.
  await cp('public/registry-card.png',pages+'/coming-soon.png');
  await writeFile(pages+'/specimen.png',await badgePng(null,false,new URL(SITE).hostname));
  await mkdir(pages+'/history',{recursive:true});
  const history=await historyPage().text();
  await writePublicHtml('history/index.html',history.replace(/href="\/(recover|privacy)"/g,(_,p)=>'href="'+API+'/'+p+'"'));
}
const registryMap=full?'Sitemap: '+API+'/sitemap.xml\n':'';
await writeFile(pages+'/robots.txt','User-agent: *\nAllow: /\nSitemap: '+SITE+'sitemap.xml\n'+registryMap);
const historyUrl=full?'<url><loc>'+SITE+'history/</loc></url>':'';
await writeFile(pages+'/sitemap.xml','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+SITE+'</loc></url>'+historyUrl+'</urlset>');
await writeFile(pages+'/.nojekyll','');
