const $ = selector => document.querySelector(selector);
const api = $('meta[name="registry-api"]')?.content || location.origin;
const n = id => String(id).padStart(6,'0');
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
const ownerUrl = (id,key) => api+'/manage#'+id+'.'+key;
const ownerFragment = /^([1-9]\d*)\.([a-f0-9]{64})$/;
const el = (tag,text,cls) => {const node=document.createElement(tag);if(text!=null) node.textContent=text;if(cls)node.className=cls;return node;};
function link(label,href,cls) {const a=el('a',label,cls);a.href=href;return a;}
async function transport(path,options) {
  try{return await fetch(api+path,{signal:AbortSignal.timeout?.(30000),...options,credentials:'omit'});}
  catch(err){throw new Error(err.name==='TimeoutError'?'The registry took too long to respond. Please try again.':'Could not reach the registry. Check your connection and try again.');}
}
async function request(path, options={}) {
  const response=await transport(path,options);
  const result=await response.json().catch(()=>null);
  if(!response.ok || !result || typeof result!=='object'){
    throw new Error(result?.error||'The registry returned an unexpected response. Please try again.');
  }
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
  const status=form.querySelector('.status'),button=form.querySelector('button');
  let busy=false;
  const prime=()=>prepareChallenge(form).catch(err=>{if(!busy)status.textContent=err.message;});
  form.addEventListener('focusin',prime,{once:true});
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(([item])=>{if(item.isIntersecting){observer.disconnect();prime();}},{rootMargin:'100px'});observer.observe(form);
  }else prime();
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy)return;
    busy=true;button.disabled=true;status.textContent='Working…';
    let sent=false;
    try {
      await prepareChallenge(form);
      const data=new FormData(form);
      if(!data.get('challenge'))throw new Error('Finish the spam check, then submit again.');
      sent=true;
      status.replaceChildren(...await task(data));
    }
    catch(err){
      status.textContent=err.message;
      if(err.message.includes('reword'))form.elements.message?.focus();
    }
    finally {
      const widget=form.querySelector('.challenge');
      try{if(sent && widget?.dataset.widget!==undefined)window.turnstile?.reset(widget.dataset.widget);}catch{}
      busy=false;button.disabled=false;
    }
  });
  form.querySelector('[data-form-fields]')?.removeAttribute('disabled');
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
  if(!/^[a-f0-9]{64}$/.test(key||''))key=secret();
  try{sessionStorage.setItem('riemann-pending',key);}catch{}
  try{
    const previous=ownerFragment.exec(sessionStorage.getItem('riemann-recent-owner')||'');
    if(previous)register.querySelector('.status').append(link('Open the badge from this browser tab',ownerUrl(previous[1],previous[2])));
  }catch{}
  formTask(register,async data=>{
    const row=await request('/api/register',post({...Object.fromEntries(data),listed:data.has('listed'),firstPass,key}));
    if(!Number.isSafeInteger(row.id) || row.id<1)throw new Error('Could not confirm your witness number. Please try again.');
    try{
      sessionStorage.setItem('riemann-recent-owner',row.id+'.'+key);
      sessionStorage.removeItem('riemann-pending');sessionStorage.removeItem('riemann-first');
    }catch{}
    const badge=ownerUrl(row.id,key);
    try{location.assign(badge);}catch{}
    return ['Your witness number is ready. ',link('Open my badge',badge)];
  });
  const search=$('#search'),field=$('#q'),box=$('#entries'),more=$('#more'),plot=$('#signatures-plot');
  const order=$('#registry-order'),archive=$('.registry-archive');
  const searchStatus=el('p',null,'status');searchStatus.setAttribute('role','status');
  box.removeAttribute('aria-live');box.before(searchStatus);
  const emptyRegister='The register is open. The first public signature will appear here.';
  let page,version=0,seenCounts;
  async function live(){
    try{const {total,public:listed,private:unlisted}=await request('/api/count');
      $('[data-count]').textContent=total.toLocaleString()+(total===1?' witness has signed':' witnesses have signed');
      if(Number.isSafeInteger(listed) && Number.isSafeInteger(unlisted)){
        $('#registry-total').replaceChildren(el('strong',listed.toLocaleString()),' public',el('i','·'),el('strong',unlisted.toLocaleString()),' private');
      }
      const counts=total+'/'+listed;
      const changed=seenCounts!==undefined && counts!==seenCounts;
      seenCounts=counts;
      if(changed)refreshPublic();
    }catch{$('[data-count]').textContent='View the witness register';}
  }
  function signature(row){
    const line=el('div',null,'signature'),a=link('',api+'/w/'+n(row.id)),details=el('div'),name=el('strong',row.name);
    details.append(name);if(row.message)details.append(el('small',row.message));
    a.append(el('span','#'+n(row.id),'serial'),details);
    const time=el('time',row.created_at.slice(0,10)+' · '+row.created_at.slice(11,16)+' UTC');time.dateTime=row.created_at;time.title=row.created_at;
    line.append(a,time);return {row,line};
  }
  const plotTrack=$('#signature-plot-track'),plotRange=$('#signature-plot-range'),plotMarks=$('#signature-plot-marks');
  const plotGuide=el('span',null,'signature-plot-guide'),plotName=$('#signature-plot-name');
  const plotNumber=$('#signature-plot-number'),plotWhen=$('#signature-plot-when');
  const plotEarlier=$('#signature-plot-earlier'),plotLater=$('#signature-plot-later');
  let points=[],selectedPoint=-1;
  const utcLabel=stamp=>new Date(stamp).toISOString().replace('T',' ').replace(/(?:\.000)?Z$/,'');

  function selectPoint(index){
    if(index===selectedPoint || !points[index])return;
    points[selectedPoint]?.mark.removeAttribute('data-selected');
    selectedPoint=index;
    const {row,stamp,x,mark}=points[index];
    const number='#'+n(row.id),when=utcLabel(stamp);
    mark.setAttribute('data-selected','');
    plotGuide.style.left=x*100+'%';
    plotName.textContent=row.name;
    plotName.href=api+'/w/'+n(row.id);
    plotNumber.textContent=number;
    plotWhen.dateTime=new Date(stamp).toISOString();
    plotWhen.textContent=when+' UTC';
    plotRange.value=String(index+1);
    plotRange.setAttribute('aria-valuetext',row.name+', witness '+number+', '+when+' UTC');
    plotEarlier.disabled=index===0;
    plotLater.disabled=index===points.length-1;
  }

  function inspectPlot(event){
    const {left,top,width,height}=plotMarks.getBoundingClientRect();
    let nearest=0,distance=Infinity;
    for(let index=0;index<points.length;index++){
      const {x,y}=points[index];
      const candidate=(left+x*width-event.clientX)**2+(top+y*height-event.clientY)**2;
      if(candidate<distance){nearest=index;distance=candidate;}
    }
    selectPoint(nearest);
  }

  plotTrack.addEventListener('pointermove',event=>{
    if(event.pointerType!=='touch')inspectPlot(event);
  },{passive:true});
  plotTrack.addEventListener('click',inspectPlot);
  plotRange.addEventListener('input',()=>selectPoint(Number(plotRange.value)-1));
  plotEarlier.addEventListener('click',()=>selectPoint(selectedPoint-1));
  plotLater.addEventListener('click',()=>selectPoint(selectedPoint+1));

  function updatePlot(rows){
    const selectedId=points[selectedPoint]?.row.id;
    const timed=rows.map(row=>({row,stamp:Date.parse(row.created_at)}))
      .filter(({stamp})=>Number.isFinite(stamp))
      .sort((a,b)=>a.stamp-b.stamp || a.row.id-b.row.id);
    selectedPoint=-1;
    plot.hidden=!timed.length;
    if(!timed.length){points=[];plotMarks.replaceChildren();return;}

    const count=timed.length,start=timed[0].stamp,end=timed.at(-1).stamp;
    points=timed.map(({row,stamp},index)=>{
      const x=end===start ? .5 : (stamp-start)/(end-start);
      const y=count===1 ? .5 : 1-index/(count-1);
      const mark=el('span',null,'signature-plot-mark');
      mark.style.left=x*100+'%';
      mark.style.top=y*100+'%';
      return {row,stamp,x,y,mark};
    });
    plotMarks.replaceChildren(plotGuide,...points.map(({mark})=>mark));
    plotRange.max=String(count);
    $('#signature-plot-count').textContent=count.toLocaleString();
    $('#signature-plot-first-count').hidden=count===1;
    const first=$('#first-signature'),last=$('#last-signature');
    first.dateTime=new Date(start).toISOString();
    first.textContent=utcLabel(start);
    last.dateTime=new Date(end).toISOString();
    last.textContent=end===start?'':utcLabel(end);
    const retained=points.findIndex(({row})=>row.id===selectedId);
    selectPoint(retained<0?count-1:retained);
  }
  function updatePage(q,sort,records,hasMore,paginated){
    const last=records.at(-1)?.row;
    page={q,sort,records,last,more:Boolean(hasMore && last),paginated};
    more.hidden=!page.more;
    archive.href=api+'/registry'+(sort==='oldest'?'?order=oldest':'');
  }
  function publicPageVisible(){
    if(!page || page.q || page.paginated || field.value.trim() || more.disabled || document.hidden)return false;
    const rect=box.getBoundingClientRect();
    return rect.bottom>0 && rect.top<window.innerHeight;
  }
  async function refreshPublic(){
    if(!publicPageVisible())return;
    const current=page,run=version;
    try{
      const data=await request('/api/registry?q=&order='+current.sort);
      if(run!==version || page!==current || !publicPageVisible())return;
      const old=new Map(current.records.map(record=>[record.row.id,record]));
      const records=data.entries.map(row=>{
        const previous=old.get(row.id);
        if(previous && previous.row.name===row.name && previous.row.message===row.message && previous.row.created_at===row.created_at)return previous;
        return signature(row);
      });
      const hasMore=Boolean(data.more && records.length);
      if(records.length===current.records.length && records.every((record,i)=>record===current.records[i]) && hasMore===current.more)return;
      const retained=new Set(records.map(({line})=>line));
      const focused=document.activeElement;
      if((focused===more && !hasMore) || (box.contains(focused) && !records.some(({line})=>line.contains(focused))))return;
      for(const {line} of current.records)if(!retained.has(line))line.remove();
      const coveredSince=current.more?current.last.id:0;
      records.forEach(({row,line},i)=>{
        if(current.sort==='newest' && !old.has(row.id) && row.id>coveredSince){
          line.classList.add('just-added');
          setTimeout(()=>line.classList.remove('just-added'),1500);
        }
        if(box.children[i]!==line)box.insertBefore(line,box.children[i]||null);
      });
      updatePage('',current.sort,records,hasMore,false);
      updatePlot(data.entries);
      if(!records.length)searchStatus.textContent=emptyRegister;
      else if(searchStatus.textContent===emptyRegister)searchStatus.textContent='';
    }catch{} // Keep the current list available when a background request fails.
  }
  async function entries(append=false) {
    if(append && (!page?.more || more.disabled))return;
    const run=++version,q=append?page.q:field.value.trim(),sort=append?page.sort:order.value;
    more.disabled=true;
    box.setAttribute('aria-busy','true');
    searchStatus.textContent=append?'Loading more signatures…':page?'Loading signatures…':'';
    const params=new URLSearchParams({q,order:sort});
    if(append)params.set(sort==='oldest'?'after':'before',page.last.id);
    try{const data=await request('/api/registry?'+params);
      if(run!==version)return;
      if(!Array.isArray(data.entries))throw new Error('Could not read the signatures. Please try again.');
      const records=data.entries.map(signature),lines=records.map(({line})=>line);
      if(append)box.append(...lines);else box.replaceChildren(...lines);
      const displayed=append?page.records.concat(records):records;
      updatePage(q,sort,displayed,data.more,append);
      updatePlot(displayed.map(record=>record.row));
      const count=data.entries.length, label=count===1?'signature':'signatures';
      if(!count && !append)searchStatus.textContent=q?'No matching public signatures.':emptyRegister;
      else searchStatus.textContent=append?count+' more '+label+' loaded.':q?count+' '+label+' found.':'';
    }catch(err){
      if(run!==version)return;
      if(!page)box.replaceChildren();
      else order.value=page.sort;
      searchStatus.textContent=err.message+(page?' Previous results are still shown.':'');
    }
    finally{if(run===version){more.disabled=false;box.setAttribute('aria-busy','false');}}
  }
  search.addEventListener('submit',e=>{e.preventDefault();entries();});
  order.addEventListener('change',()=>entries());
  more.onclick=()=>entries(true);
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){observer.disconnect();if(!version)entries();}},{rootMargin:'200px'});observer.observe($('#registry'));}else entries();
  live();setInterval(()=>{if(!document.hidden)live();},90000);
}
async function copyText(value,button) {
  const existing=button.nextElementSibling?.matches('[data-copy-value]')?button.nextElementSibling:null;
  try{await navigator.clipboard.writeText(value);button.textContent='Copied';existing?.remove();}
  catch{
    const input=existing||el('input');input.value=value;input.readOnly=true;
    input.setAttribute('data-copy-value','');input.setAttribute('aria-label',button.textContent);
    if(!existing)button.after(input);
    input.focus();input.select();
  }
}
document.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=()=>copyText(btn.dataset.copy,btn));
if($('#recover')){
  try{if(localStorage.getItem('riemann-owner'))$('#recover').before(link('Open my badge saved on this device','/manage','button subtle'));}catch{}
}
if($('#recover'))formTask($('#recover'),async data=>{
  const matches=$('#matches');matches.replaceChildren();
  const rows=await request('/api/recover',post(Object.fromEntries(data)));
  if(!Array.isArray(rows) || !rows.length || rows.some(row=>typeof row?.name!=='string' || !ownerFragment.test(row.id+'.'+row.key))){
    throw new Error('Could not recover a badge. Please try again.');
  }
  matches.replaceChildren(...rows.map(row=>link('Open #'+n(row.id)+' · '+row.name,ownerUrl(row.id,row.key),'button subtle')));
  return [rows.length===1?'Found one badge. Open it below.':'Found '+rows.length+' badges. Choose one below.'];
});
if($('#owner')) {
  const box=$('#owner');
  let value=location.hash.slice(1);
  try{if(!value)value=localStorage.getItem('riemann-owner')||'';}catch{}
  const match=ownerFragment.exec(value);
  let switchingOwner=false;
  const newOwnerInFragment=()=>{
    const next=location.hash.slice(1);
    return next!==value && ownerFragment.test(next);
  };
  const leavingOwner=()=>switchingOwner || newOwnerInFragment();
  window.addEventListener('hashchange',()=>{
    if(switchingOwner || !newOwnerInFragment())return;
    switchingOwner=true;
    box.replaceChildren(el('p','Opening your private management link…'));
    location.reload();
  });
  if(!match)box.replaceChildren(link('Recover a badge','/recover','button mint-btn'));
  else {
    const [,id,key]=match,path='/w/'+n(id),priv='/api/manage/'+id;
    const headers={Authorization:'Bearer '+key};
    // The private key stays in the fragment of the saved management link.
    const permanent=ownerUrl(id,key),publicURL=api+path;
    const status=el('p',null,'status');status.setAttribute('role','status');
    const preview=el('div');
    const previewStatus=el('p',null,'status');previewStatus.setAttribute('role','status');
    const img=el('img',null,'badge');img.width=1200;img.height=630;
    const filename='riemann-witness-'+n(id);
    let landscape,nativeFile,save,nativeShare,deleted=false,changing=false;

    function action(label,fn,cls='button subtle'){
      const b=el('button',label,cls);b.type='button';
      b.onclick=async()=>{
        if(b.disabled || leavingOwner())return;
        b.disabled=true;status.textContent='';
        try{await fn(b);}catch(err){status.textContent=err.message;}
        finally{b.disabled=false;}
      };
      return b;
    }
    const backup=()=>action('Save private management link',b=>copyText(permanent,b));
    async function png(p){
      const response=await transport(path+'/'+p+'.png',{headers});
      if(!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png'))throw new Error('Badge image unavailable. Please try again.');
      return response.blob();
    }
    async function loadPreview(focus=false){
      previewStatus.textContent='Loading your badge image…';
      preview.replaceChildren(previewStatus);
      try{
        const blob=await png('social');
        if(deleted || leavingOwner())return;
        landscape=URL.createObjectURL(blob);
        img.src=landscape;
        nativeFile=new File([blob],filename+'.png',{type:'image/png'});
        save.href=landscape;save.hidden=false;
        nativeShare.hidden=!navigator.canShare?.({files:[nativeFile]});
        preview.replaceChildren(img);
        if(focus){img.tabIndex=-1;img.focus();}
      }catch(err){
        if(deleted || leavingOwner())return;
        previewStatus.textContent=err.message;
        preview.append(action('Retry badge image',()=>loadPreview(true)));
      }
    }
    function render(w,visibilityChanged=false) {
      img.alt='Commemorative badge for '+w.name+', witness #'+n(id);
      const buttons=el('div',null,'actions'),downloads=el('div',null,'downloads');
      const extras=el('details',null,'share-options'),moreLinks=el('div',null,'actions');
      extras.append(el('summary','More ways to share'),moreLinks);
      nativeShare=action('Share certificate',async()=>{
        try{await navigator.share({files:[nativeFile],...(w.listed?{text:publicURL}:{})});}
        catch(e){if(e.name!=='AbortError')throw e;}
      });
      nativeShare.hidden=!nativeFile || !navigator.canShare?.({files:[nativeFile]});
      buttons.append(nativeShare);
      if(w.listed) {
        const txt='I was here when the Riemann Hypothesis was solved. Witness #'+n(id)+'. November 20, 2026.';
        const share=(label,url,style)=>{const a=link(label,url,style);a.target='_blank';a.rel='noopener noreferrer';return a;};
        buttons.prepend(share('Post to X','https://twitter.com/intent/tweet?'+new URLSearchParams({text:txt,url:publicURL}),'button mint-btn'));
        buttons.append(action('Copy badge link',b=>copyText(publicURL,b)));
        moreLinks.append(share('Bluesky','https://bsky.app/intent/compose?'+new URLSearchParams({text:txt+' '+publicURL}),'button subtle'),
          share('Reddit','https://www.reddit.com/submit?'+new URLSearchParams({url:publicURL,title:txt}),'button subtle'),link('View public badge',publicURL,'button subtle'));
      }else buttons.prepend(action('Make my badge public',()=>visibility(true),'button mint-btn'));
      async function visibility(listed){
        if(changing)return;
        changing=true;
        try{
          await request(priv,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({listed})});
          if(!leavingOwner())render({...w,listed},true);
        }finally{changing=false;}
      }
      save=link('Download landscape PNG',landscape||'#');save.download=filename+'.png';save.hidden=!landscape;
      downloads.append(save,action('Download portrait PNG',async()=>{
        const u=URL.createObjectURL(await png('portrait')),a=link('Download',u);
        a.download=filename+'-portrait.png';document.body.append(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(u),20000);
      },'plain'));
      const panel=el('details',null,'owner-panel');panel.append(el('summary','Privacy and deletion'));
      if(w.listed)panel.append(action('Make my badge private',()=>visibility(false)));
      panel.append(action('Delete my entry',async()=>{
        if(changing || !confirm('Permanently delete this entry and both badge images?'))return;
        changing=true;
        try{
          await request(priv,{method:'DELETE',headers});
          if(leavingOwner())return;
          deleted=true;
          try{if(localStorage.getItem('riemann-owner')===value)localStorage.removeItem('riemann-owner');}catch{}
          if(landscape)URL.revokeObjectURL(landscape);
          history.replaceState(null,'','/manage');
          status.textContent='Your entry has been deleted.';
          box.replaceChildren(status);
        }finally{changing=false;}
      }));
      box.replaceChildren(el('p','Witness #'+n(id)+' · '+w.name,'lede'),preview,el('p',w.listed?'Your badge is public.':'Your badge is private. Publishing will show your name, note and badge to everyone.'),buttons,...(w.listed?[extras]:[]),downloads,
        backup(),el('p','Keep this link to change visibility or delete your entry.'),panel,status);
      if(visibilityChanged){
        status.textContent=w.listed?'Badge is now public.':'Badge is now private.';
        buttons.querySelector(':not([hidden]):is(a,button)')?.focus();
      }
    }
    async function openOwner(){
      status.textContent='Opening your private management link…';
      box.replaceChildren(status,backup());
      try{
        const w=await request(priv,{headers});
        if(leavingOwner())return;
        if(w.id!==Number(id) || typeof w.name!=='string')throw new Error('Could not open this witness badge. Please try again.');
        try{
          localStorage.setItem('riemann-owner',value);
          if(location.hash && localStorage.getItem('riemann-owner')===value)history.replaceState(null,'',location.pathname+location.search);
        }catch{}
        status.textContent='';
        render(w);
        loadPreview();
      }catch(err){
        if(leavingOwner())return;
        status.textContent=err.message;
        const actions=el('div',null,'actions');
        actions.append(action('Try again',openOwner,'button mint-btn'),backup(),link('Recover a badge','/recover','button subtle'));
        box.replaceChildren(status,actions);
      }
    }
    openOwner();
  }
}
