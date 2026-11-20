import {SITE,API} from './config.js';
import {page,esc} from './pages.js';
import {registry,serial,RequestError} from './data.js';

export function historyPage(){
  const title='The Riemann Hypothesis announcement of November 20, 2026';
  const description='Read Levent Alpöge’s announcement, explore Riemann’s 1859 manuscript, and see how the critical line appears on the commemorative witness badge.';
  return page(new URL(SITE).origin,{path:'/history/',title:title+' | I Was Here',description,image:SITE+'specimen.png',
    body:`<main id="main" class="sub story"><a href="${SITE}">I Was Here</a><h1>The Riemann Hypothesis announcement.</h1><p class="lede"><time datetime="2026-11-20">November 20, 2026</time></p>
    <h2>What happened on November 20?</h2><p>Mathematician Levent Alpöge posted a four-page note describing his work with Claude on the Riemann Hypothesis. He released the formalization in Lean, a language for writing mathematical statements and proofs. His note opens with the problem of counting primes and closes with a timeline of the work. <a href="https://alpo.ge/remark.pdf">Read Alpöge’s original announcement (PDF)</a>.</p>
    <h2>Why did mathematicians wait 167 years?</h2><p>In November 1859, Bernhard Riemann published a six-page manuscript about a familiar question. How many primes are smaller than a given number? Counting them one by one works for small numbers. Riemann connected the accuracy of estimates for very large numbers to the zeros of a function now named after him. <a href="https://www.claymath.org/collections/riemanns-1859-manuscript/">See Riemann’s manuscript at the Clay Mathematics Institute</a>.</p>
    <h2>What is the critical line?</h2><p>A complex number has a real part and an imaginary part. Plot those parts on two axes and every complex number becomes a point. Riemann’s hypothesis says that every nontrivial zero of his zeta function sits on the same vertical line, where the real part equals one half. <a href="https://www.claymath.org/millennium/riemann-hypothesis/">Read the mathematical statement</a>.</p>
    <figure><img src="${SITE}art/critical-strip.svg" width="736" height="348" alt="Five zeros of the zeta function marked in gold along the critical line"><figcaption>The gold dots on the witness badge mark the first five nontrivial zeros above the real axis. Each sits where the engraved surface reaches zero height.</figcaption></figure>
    <h2>What does a witness number record?</h2><p>A number records when someone signed this independent time capsule. The badge carries two dates. November 20, 2026 marks the announcement. The UTC timestamp records the actual signature, even for someone who arrives later. Visitors choose whether their name and message appear in the public register.</p><div class="actions"><a class="button mint-btn" href="${SITE}#sign">Sign the register</a><a class="button subtle" href="${API}/registry">Browse public witnesses</a></div></main>`});
}
export async function archivePage(env,url){
  const raw=url.searchParams.get('before');
  const before=raw?Number(raw):0;
  if(raw && (!/^\d+$/.test(raw)||!Number.isSafeInteger(before)||before<1))
    throw new RequestError(404,'Archive page unavailable.');
  const path=before?'/registry?before='+before:'/registry';
  const query=new URLSearchParams();
  if(before){
    const newer=await env.DB.prepare('SELECT id FROM witnesses WHERE listed=1 AND id>=? LIMIT 1').bind(before).first();
    if(!newer)throw new RequestError(404,'Archive page unavailable.');
    query.set('before',before);
  }
  const {entries,more}=await registry(env,query);
  if(before && !entries.length)throw new RequestError(404,'Archive page unavailable.');
  if(url.pathname+url.search!==path)return Response.redirect(url.origin+path,301);
  const heading=before?'Witnesses before #'+serial(before):'The witness registry.';
  const list=entries.map(w=>`<li class="signature"><a href="/w/${serial(w.id)}"><span class="serial">#${serial(w.id)}</span><div><strong>${esc(w.name)}</strong>${w.message?'<small>'+esc(w.message)+'</small>':''}</div></a><time datetime="${esc(w.created_at)}">${esc(w.created_at.slice(0,10))}</time></li>`).join('');
  return page(url.origin,{path,title:before?heading+' | I Was Here':'Riemann Hypothesis Witness Registry | I Was Here',description:'Browse public signatures from the Riemann Hypothesis time capsule, in registration order. Open a witness’s numbered badge and see when they signed.',body:`<main class="sub" id="main"><h1>${esc(heading)}</h1><p class="lede">Public signatures, newest first.</p><p><a href="${SITE}#registry">Search by name or number</a> · <a href="${SITE}#sign">Sign the register</a></p>${list?'<ol class="archive-list">'+list+'</ol>':'<p>The first public signature will appear here.</p>'}${before?'<p><a href="/registry">Newest signatures</a></p>':''}${more?'<p><a href="/registry?before='+entries.at(-1).id+'">Older signatures</a></p>':''}</main>`});
}

const span=2000, prefix='/sitemap-witnesses-';
function xml(kind,contents){
  return new Response('<?xml version="1.0" encoding="UTF-8"?><'+kind+' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+contents+'</'+kind+'>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
}
export async function witnessSitemap(env,origin,path){
  const legacy=/^\/sitemaps\/(registry\.xml|witnesses-(?:0|[1-9]\d{0,11})\.xml)$/.exec(path);
  if(legacy)return Response.redirect(origin+'/sitemap-'+legacy[1],301);
  if(path==='/sitemap.xml'){
    // Seek to the first public record in each range using the (listed, id) index.
    const {results}=await env.DB.prepare(`WITH RECURSIVE public_shards(shard) AS (
      SELECT (min(id)-1)/?1 FROM witnesses WHERE listed=1
      UNION ALL
      SELECT (SELECT (min(id)-1)/?1 FROM witnesses WHERE listed=1 AND id>(shard+1)*?1)
      FROM public_shards WHERE shard IS NOT NULL
    ) SELECT shard FROM public_shards WHERE shard IS NOT NULL ORDER BY shard`).bind(span).all();
    const pages=[origin+'/sitemap-registry.xml',...results.map(({shard})=>origin+prefix+shard+'.xml')];
    return xml('sitemapindex',pages.map(s=>'<sitemap><loc>'+esc(s)+'</loc></sitemap>').join(''));
  }
  if(path==='/sitemap-registry.xml')return xml('urlset',['/registry','/privacy'].map(p=>'<url><loc>'+esc(origin+p)+'</loc></url>').join(''));
  const match=/^\/sitemap-witnesses-(0|[1-9]\d{0,11})\.xml$/.exec(path);
  if(!match)throw new RequestError(404,'Sitemap unavailable.');
  const start=Number(match[1])*span;
  const {results}=await env.DB.prepare('SELECT id FROM witnesses WHERE listed=1 AND id>? AND id<=? ORDER BY id').bind(start,start+span).all();
  if(!results.length)throw new RequestError(404,'Sitemap unavailable.');
  return xml('urlset',results.map(w=>'<url><loc>'+esc(origin+'/w/'+serial(w.id))+'</loc></url>').join(''));
}
