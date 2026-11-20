import { build } from 'esbuild';
import { mkdir,writeFile,cp,rm } from 'node:fs/promises';
import {historyPage} from '../src/discovery.js';
import {home} from '../src/pages.js';
import {badgePng} from '../src/badge.js';
import {SITE,API,REGISTRY_OPEN} from '../src/config.js';
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['src/worker.js'],outfile:'dist/server/index.js',loader:{'.html':'text'},bundle:true,format:'esm',target:'es2022',platform:'browser',minify:true,legalComments:'none'});
await rm('dist/pages',{recursive:true,force:true});
if(!REGISTRY_OPEN){
  await mkdir('dist/pages',{recursive:true});
  await cp('holding/index.html','dist/pages/index.html');
  for(const file of ['holding.css','coming-soon.png','seal.svg','art/critical-strip.svg','fonts/gloock.woff2','fonts/OFL-Gloock.txt']){
    await cp('public/'+file,'dist/pages/'+file);
  }
  await writeFile('dist/pages/robots.txt','User-agent: *\nAllow: /\nSitemap: '+SITE+'sitemap.xml\n');
  await writeFile('dist/pages/sitemap.xml','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+SITE+'</loc></url></urlset>');
  await writeFile('dist/pages/.nojekyll','');
}else{
await cp('public','dist/pages',{recursive:true});
let html=await home(new URL(SITE).origin).text();
html=html.replace('<head>','<head><meta name="registry-api" content="'+API+'">')
  .replaceAll('href="/#','href="#').replaceAll('href="/"','href="./"')
  .replace(/href="\/(recover|privacy)"/g,(_,p)=>'href="'+API+'/'+p+'"')
  .replace(/(src|href)="\/([^"]+)"/g,'$1="./$2"')
  .replaceAll(new URL(SITE).origin+'/specimen.png',SITE+'specimen.png')
  .replaceAll('content="'+new URL(SITE).origin+'/"','content="'+SITE+'"')
  .replaceAll('href="'+new URL(SITE).origin+'/"','href="'+SITE+'"');
await writeFile('dist/pages/index.html',html);
await writeFile('dist/pages/specimen.png',await badgePng(null,false,new URL(SITE).hostname));
await mkdir('dist/pages/history',{recursive:true});
const history=await historyPage().text();
await writeFile('dist/pages/history/index.html',history.replace(/href="\/(recover|privacy)"/g,(_,p)=>'href="'+API+'/'+p+'"'));
await writeFile('dist/pages/robots.txt','User-agent: *\nAllow: /\nSitemap: '+SITE+'sitemap.xml\n');
await writeFile('dist/pages/sitemap.xml','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+SITE+'</loc></url><url><loc>'+SITE+'history/</loc></url></urlset>');
await writeFile('dist/pages/.nojekyll','');
}
