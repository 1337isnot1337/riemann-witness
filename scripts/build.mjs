import { build } from 'esbuild';
import { mkdir,writeFile,cp } from 'node:fs/promises';
import {home} from '../src/pages.js';
import {badgePng} from '../src/badge.js';
import {SITE,API} from '../src/config.js';
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['src/worker.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',target:'es2022',platform:'browser',minify:true,legalComments:'none'});
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
await writeFile('dist/pages/specimen.png',await badgePng(null,false,new URL(API).host));
await writeFile('dist/pages/sitemap.xml','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+SITE+'</loc></url></urlset>');
await writeFile('dist/pages/.nojekyll','');
