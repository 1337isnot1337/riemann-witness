const $ = selector => document.querySelector(selector);
const api = $('meta[name="registry-api"]')?.content || location.origin;
const n = id => String(id).padStart(6,'0');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
const ownerUrl = (id,key) => api+'/manage#'+id+'.'+key;
const el = (tag,text,cls) => {const node=document.createElement(tag);if(text!=null) node.textContent=text;if(cls)node.className=cls;return node;};
function link(label,href,cls) {const a=el('a',label,cls);a.href=href;return a;}
async function request(path, options={}) {
  const response=await fetch(api+path,{...options,credentials:'omit'});
  const result=await response.json().catch(()=>({error:'The registry is busy. Please try again shortly.'}));
  if (!response.ok) throw new Error(result.error||'Please try again.');
  return result;
}
function post(body) {return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};}
let challengeReady;
function prepareChallenge(form){
  const container=form.querySelector('.challenge');
  if(!container || container.dataset.widget!==undefined)return Promise.resolve();
  challengeReady ||= new Promise((resolve,reject)=>{
    if(window.turnstile){resolve();return;}
    const script=document.createElement('script');
    window.witnessChallengeReady=resolve;
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=witnessChallengeReady&render=explicit';
    script.onerror=()=>{challengeReady=null;script.remove();reject(new Error('Could not load the spam check. Please try again.'));};
    document.head.append(script);
  });
  return challengeReady.then(()=>{
    if(container.dataset.widget===undefined)container.dataset.widget=window.turnstile.render(container,{
      sitekey:container.dataset.key,action:container.dataset.action,theme:'auto',size:'flexible',
      'response-field-name':'challenge',appearance:'interaction-only'
    });
  });
}
function formTask(form, task) {
  const prime=()=>prepareChallenge(form).catch(err=>{form.querySelector('.status').textContent=err.message;});
  form.addEventListener('focusin',prime,{once:true});
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(([item])=>{if(item.isIntersecting){observer.disconnect();prime();}},{rootMargin:'100px'});observer.observe(form);
  }else prime();
  form.addEventListener('submit',async event=>{
    event.preventDefault();const status=form.querySelector('.status'), button=form.querySelector('button');
    button.disabled=true;status.textContent='Working…';
    try {
      await prepareChallenge(form);
      const data=new FormData(form);
      if(!data.get('challenge'))throw new Error('Finish the spam check, then submit again.');
      await task(data);status.textContent='';
    }
    catch(err){
      status.textContent=err.message;
      if(err.message.includes('reword'))form.elements.message?.focus();
      const widget=form.querySelector('.challenge');
      if(widget?.dataset.widget!==undefined && window.turnstile?.getResponse(widget.dataset.widget))window.turnstile.reset(widget.dataset.widget);
    }
    finally {button.disabled=false;}
  });
}
const register=$('#register');
if(register) {
  let firstPass;
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(/^[a-f0-9]{64}$/.test(fragment.get('first')||'')){
    firstPass=fragment.get('first');history.replaceState(null,'',location.pathname+location.search);
    try{sessionStorage.setItem('riemann-first',firstPass);}catch{}
  }else{try{firstPass=sessionStorage.getItem('riemann-first');}catch{}}
  let key;
  try{key=sessionStorage.getItem('riemann-pending');}catch{}
  key ||= secret();
  try{sessionStorage.setItem('riemann-pending',key);}catch{}
  formTask(register,async data=>{
    const row=await request('/api/register',post({...Object.fromEntries(data),listed:data.has('listed'),firstPass,key}));
    try{sessionStorage.removeItem('riemann-pending');sessionStorage.removeItem('riemann-first');}catch{}
    location.assign(ownerUrl(row.id,key));
  });
  async function live(){
    try{const {total}=await request('/api/count');
      $('[data-count]').textContent=total.toLocaleString()+' in the';
      $('#registry-total').textContent=total.toLocaleString()+(total===1?' witness':' witnesses');
    }catch{$('[data-count]').textContent='View the';}
  }
  live();setInterval(()=>{if(!document.hidden)live();},90000);
  let before,afterName,version=0;
  async function entries(append=false) {
    const run=++version,box=$('#entries'),more=$('#more'),q=$('#q').value.trim();
    more.disabled=true;
    const params=new URLSearchParams({q});if(append && before){params.set('before',before);if(q)params.set('afterName',afterName);}
    try{const data=await request('/api/registry?'+params);
      if(run!==version)return;
      if(!append)box.replaceChildren();
      if(!q && !append){
        const times=data.entries.map(row=>Date.parse(row.created_at));
        $('#signatures-plot').hidden=!times.length;
        if(times.length){
          const start=Math.min(...times),end=Math.max(...times);
          $('#constellation').replaceChildren(...times.map((stamp,i)=>{
            const dot=el('i');dot.style.left=(end===start?50:(stamp-start)*100/(end-start))+'%';
            dot.style.top=(4+i%3*7)+'px';return dot;}));
          const label=t=>new Date(t).toISOString().slice(0,16).replace('T',' ');
          $('#first-signature').textContent=label(start);
          $('#last-signature').textContent=end===start?'':label(end);
        }
      }
      for(const row of data.entries) {
        const line=el('div',null,'signature'),a=link('',api+'/w/'+n(row.id)),details=el('div'),name=el('strong',row.name);
        details.append(name);if(row.message)details.append(el('small',row.message));
        a.append(el('span','#'+n(row.id),'serial'),details);const time=el('time',row.created_at.slice(0,10));time.dateTime=row.created_at;time.title=row.created_at;
        line.append(a,time);box.append(line);
      }
      if(!append&&!data.entries.length)box.append(el('p',q?'No matching public signatures.':'The register is open. The first public signature will appear here.','empty'));
      before=data.entries.at(-1)?.id;afterName=data.entries.at(-1)?.name;more.hidden=!data.more;
    }catch(err){if(run===version){box.textContent=err.message;more.hidden=true;}}
    finally{if(run===version)more.disabled=false;}
  }
  $('#search').addEventListener('submit',e=>{e.preventDefault();entries();});
  $('#more').onclick=()=>entries(true);
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){observer.disconnect();entries();}},{rootMargin:'200px'});observer.observe($('#registry'));}else entries();
}
async function copyText(value,button) {
  try{await navigator.clipboard.writeText(value);button.textContent='Copied';}
  catch{const input=el('input');input.value=value;input.readOnly=true;button.after(input);input.select();}
}
document.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=()=>copyText(btn.dataset.copy,btn));
if($('#recover')){
  try{if(localStorage.getItem('riemann-owner'))$('#recover').before(link('Open my badge saved on this device','/manage','button subtle'));}catch{}
}
if($('#recover'))formTask($('#recover'),async data=>{
  const rows=await request('/api/recover',post(Object.fromEntries(data)));
  $('#matches').replaceChildren(...rows.map(row=>link('Open #'+n(row.id)+' · '+row.name,ownerUrl(row.id,row.key),'button subtle')));
});
if($('#owner')) {
  const box=$('#owner');
  let value=location.hash.slice(1);
  try{if(!value)value=localStorage.getItem('riemann-owner')||'';}catch{}
  const match=/^([1-9]\d*)\.([a-f0-9]{64})$/.exec(value);
  async function owner(visibilityChanged=false) {
    if(!match){box.replaceChildren(link('Recover a badge','/recover','button mint-btn'));return;}
    const [,id,key]=match,path='/w/'+n(id),priv='/api/manage/'+id;
    const headers={Authorization:'Bearer '+key};
    const w=await request(priv,{headers});
    try{
      localStorage.setItem('riemann-owner',value);
      if(location.hash && localStorage.getItem('riemann-owner')===value)history.replaceState(null,'',location.pathname+location.search);
    }catch{}
    // Keep the capability in the copied management link, out of browser requests.
    const permanent=ownerUrl(id,key),publicURL=api+path;
    const status=el('p','', 'status');status.setAttribute('role','status');
    const img=el('img',null,'badge');img.alt='Commemorative badge for '+w.name+', witness #'+n(id);img.width=1200;img.height=630;
    let landscape;
    async function png(p) {const response=await fetch(api+path+'/'+p+'.png',{headers});if(!response.ok)throw new Error('Badge image unavailable. Please try again.');return response.blob();}
    const imageBlob=await png('social');landscape=URL.createObjectURL(imageBlob);img.src=landscape;
    const buttons=el('div',null,'actions'),downloads=el('div',null,'downloads');
    function action(label,fn,cls='button subtle'){const b=el('button',label,cls);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn(b);}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;}
    const extras=el('details',null,'share-options'),moreLinks=el('div',null,'actions');
    extras.append(el('summary','More ways to share'),moreLinks);
    const nativeFile=new File([imageBlob],'riemann-witness-'+n(id)+'.png',{type:'image/png'});
    if(navigator.canShare?.({files:[nativeFile]})){
      buttons.append(action('Share certificate',async()=>{
        try{await navigator.share({files:[nativeFile],...(w.listed?{text:publicURL}:{})});}
        catch(e){if(e.name!=='AbortError')throw e;}
      },'button subtle'));
    }
    if(w.listed) {
      const txt='I was here when the Riemann Hypothesis was solved. Witness #'+n(id)+'. November 20, 2026.';
      const share=(label,url,style)=>{const a=link(label,url,style);a.target='_blank';a.rel='noopener noreferrer';return a;};
      buttons.prepend(share('Post to X','https://twitter.com/intent/tweet?'+new URLSearchParams({text:txt,url:publicURL}),'button mint-btn'));
      buttons.append(action('Copy badge link',b=>copyText(publicURL,b)));
      moreLinks.append(share('Bluesky','https://bsky.app/intent/compose?'+new URLSearchParams({text:txt+' '+publicURL}),'button subtle'),
        share('Reddit','https://www.reddit.com/submit?'+new URLSearchParams({url:publicURL,title:txt}),'button subtle'),link('View public badge',publicURL,'button subtle'));
    }else buttons.prepend(action('Make my badge public',()=>visibility(true),'button mint-btn'));
    async function visibility(listed){await request(priv,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({listed})});URL.revokeObjectURL(landscape);await owner(true);}
    const save=link('Download landscape PNG',landscape);save.download='riemann-witness-'+n(id)+'.png';
    downloads.append(save,action('Download portrait PNG',async()=>{const u=URL.createObjectURL(await png('portrait')),a=link('Download',u);a.download='riemann-witness-'+n(id)+'-portrait.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),20000);},'plain'));
    const panel=el('details',null,'owner-panel');panel.append(el('summary','Privacy and deletion'));
    if(w.listed)panel.append(action('Make my badge private',()=>visibility(false)));
    panel.append(action('Delete my entry',async()=>{if(!confirm('Permanently delete this entry and both badge images?'))return;
      await request(priv,{method:'DELETE',headers});try{localStorage.removeItem('riemann-owner');}catch{}
      URL.revokeObjectURL(landscape);history.replaceState(null,'','/manage');box.replaceChildren(el('p','Your entry has been deleted.'));}));
    box.replaceChildren(el('p','Witness #'+n(id)+' · '+w.name,'lede'),img,el('p',w.listed?'Your badge is public.':'Your badge is private. Publishing will show your name, note and badge to everyone.'),buttons,...(w.listed?[extras]:[]),downloads,
      action('Save private management link',b=>copyText(permanent,b)),el('p','Keep this link to change visibility or delete your entry.'),panel,status);
    if(visibilityChanged){status.textContent=w.listed?'Badge is now public.':'Badge is now private.';buttons.querySelector('a,button')?.focus();}
  }
  owner().catch(err=>{box.replaceChildren(el('p',err.message),link('Recover a badge','/recover'));});
}
