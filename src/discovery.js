import {SITE,API} from './config.js';
import {page,esc} from './pages.js';
import {registry,serial,RequestError} from './data.js';

export function historyPage(){
  const title='The Riemann Hypothesis announcement of November 20, 2026';
  const description='Read Levent Alpöge’s announcement, explore Riemann’s 1859 manuscript, and see how the critical line appears on the commemorative witness badge.';
  return page(new URL(SITE).origin,{path:'/history/',title:title+' | I Was Here',description,image:SITE+'specimen.png',
    body:`<main id="main" class="sub story"><a href="${SITE}">I Was Here</a><h1>November 20, 2026.</h1><p class="lede">The day of the Riemann Hypothesis announcement.</p>
    <h2>What happened on November 20?</h2><p>Mathematician Levent Alpöge posted a four-page note describing his work with Claude on the Riemann Hypothesis. He released the formalization in Lean, a language for writing mathematical statements and proofs. His note opens with the problem of counting primes and closes with a timeline of the work. <a href="https://alpo.ge/remark.pdf">Read Alpöge’s original announcement (PDF)</a>.</p>
    <h2>Why did mathematicians wait 167 years?</h2><p>In November 1859, Bernhard Riemann published a six-page manuscript about a familiar question. How many primes are smaller than a given number? Counting them one by one works for small numbers. Riemann connected the accuracy of estimates for very large numbers to the zeros of a function now named after him. <a href="https://www.claymath.org/collections/riemanns-1859-manuscript/">See Riemann’s manuscript at the Clay Mathematics Institute</a>.</p>
    <h2>What is the critical line?</h2><p>A complex number has a real part and an imaginary part. Plot those parts on two axes and every complex number becomes a point. Riemann’s hypothesis says that every nontrivial zero of his zeta function sits on the same vertical line, where the real part equals one half. <a href="https://www.claymath.org/millennium/riemann-hypothesis/">Read the mathematical statement</a>.</p>
    <figure><img src="${SITE}art/critical-strip.svg" width="736" height="348" alt="Five zeros of the zeta function marked in gold along the critical line"><figcaption>The gold dots on the witness badge mark the first five nontrivial zeros above the real axis. Each sits where the engraved surface reaches zero height.</figcaption></figure>
    <h2>What does a witness number record?</h2><p>A number records when someone signed this independent time capsule. The badge carries two dates. November 20, 2026 marks the announcement. The UTC timestamp records the actual signature, even for someone who arrives later. Visitors choose whether their name and message appear in the public register.</p><div class="actions"><a class="button mint-btn" href="${SITE}#sign">Sign the register</a><a class="button subtle" href="${API}/registry">Browse public witnesses</a></div></main>`});
}
export async function archivePage(env,origin,params){
  const before=params.get('before'),query=new URLSearchParams();
  if(before)query.set('before',before);
  const {entries,more}=await registry(env,query);
  if(before && !entries.length)throw new RequestError(404,'Archive page unavailable.');
  const path=before?'/registry?before='+encodeURIComponent(before):'/registry';
  const heading=before?'Witnesses before #'+serial(before):'The witness registry.';
  const list=entries.map(w=>`<li class="signature"><a href="/w/${serial(w.id)}"><span class="serial">#${serial(w.id)}</span><div><strong>${esc(w.name)}</strong>${w.message?'<small>'+esc(w.message)+'</small>':''}</div></a><time datetime="${esc(w.created_at)}">${esc(w.created_at.slice(0,10))}</time></li>`).join('');
  return page(origin,{path,title:before?heading+' | I Was Here':'Riemann Hypothesis Witness Registry | I Was Here',description:'Browse public signatures from the Riemann Hypothesis time capsule, in registration order. Open a witness’s numbered badge and see when they signed.',body:`<main class="sub" id="main"><h1>${esc(heading)}</h1><p class="lede">Public signatures, newest first.</p><p><a href="${SITE}#registry">Search by name or number</a> · <a href="${SITE}#sign">Sign the register</a></p>${list?'<ol class="archive-list">'+list+'</ol>':'<p>The first public signature will appear here.</p>'}${more?'<a href="/registry?before='+entries.at(-1).id+'">Older signatures</a>':''}</main>`});
}

const span=2000, prefix='/sitemaps/witnesses-';
function xml(kind,contents){
  return new Response('<?xml version="1.0" encoding="UTF-8"?><'+kind+' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+contents+'</'+kind+'>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
}
export async function witnessSitemap(env,origin,path){
  if(path==='/sitemap.xml'){
    const last=await env.DB.prepare('SELECT id FROM witnesses WHERE listed=1 ORDER BY id DESC LIMIT 1').first();
    const pages=[origin+'/sitemaps/registry.xml'];
    for(let i=0;i<Math.ceil((last?.id||0)/span);i++)pages.push(origin+prefix+i+'.xml');
    return xml('sitemapindex',pages.map(s=>'<sitemap><loc>'+esc(s)+'</loc></sitemap>').join(''));
  }
  if(path==='/sitemaps/registry.xml')return xml('urlset',['/registry','/privacy'].map(p=>'<url><loc>'+esc(origin+p)+'</loc></url>').join(''));
  const match=/^\/sitemaps\/witnesses-(0|[1-9]\d{0,9})\.xml$/.exec(path);
  if(!match)throw new RequestError(404,'Sitemap unavailable.');
  const start=Number(match[1])*span;
  const {results}=await env.DB.prepare('SELECT id FROM witnesses WHERE listed=1 AND id>? AND id<=? ORDER BY id').bind(start,start+span).all();
  return xml('urlset',results.map(w=>'<url><loc>'+esc(origin+'/w/'+serial(w.id))+'</loc></url>').join(''));
}
