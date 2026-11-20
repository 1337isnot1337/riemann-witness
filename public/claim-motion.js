const claim=document.querySelector('.hero a[href="#sign"]');
const submit=document.querySelector('#register .dark-btn');

if(claim){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const hover=matchMedia('(any-hover: hover)');
  const glyphs='ζ∑π∫σ∞∂½';
  const claimNotation='ζΓ∫π∂ ∞ρ∏λ ∮ℜση∇ ∑ξ θβ∀⊕√φμ';
  // Glyph, position within the button, and travel from that position in pixels.
  const impressions=[
    ['ζ',12,17,-7,-25], ['∑',33,16,-3,-28], ['ℜ',58,17,4,-26],
    ['½',83,18,15,-27], ['∞',97,43,27,-8], ['∂',5,52,-22,-1],
    ['π',96,74,37,11], ['λ',70,16,9,-26]
  ];
  const animations=new Map();
  let cancelArrival=()=>{};
  let hoverPointer=null,keyboardFocused=false;
  const enabled=()=>!reduced.matches && !document.hidden && document.hasFocus() && document.documentElement.dataset.motion!=='off';

  function decorate(button){
    const label=document.createElement('span'),readout=document.createElement('span');
    label.className='claim-decode-label';
    label.append(...button.childNodes);
    readout.className='claim-decode-readout';
    readout.setAttribute('aria-hidden','true');
    button.append(label,readout);
    button.classList.add('claim-decoding');
    function restore(){
      button.classList.remove('claim-decoding','claim-preview');
      button.replaceChildren(...label.childNodes);
      animations.delete(button);
    }
    return {label,readout,restore};
  }

  function projectClaim(preview){
    animations.get(claim)?.();
    const {readout,restore}=decorate(claim);
    readout.textContent=claimNotation;
    if(preview)claim.classList.add('claim-preview');
    const plate=document.createElement('span');
    plate.className='claim-impressions';
    plate.setAttribute('aria-hidden','true');
    for(const [glyph,x,y,dx,dy] of impressions.slice(0,preview?6:impressions.length)){
      const impression=document.createElement('span');
      impression.textContent=glyph;
      impression.style.left=x+'%';
      impression.style.top=y+'%';
      impression.style.setProperty('--claim-x',dx+'px');
      impression.style.setProperty('--claim-y',dy+'px');
      plate.append(impression);
    }
    claim.append(plate);
    const timeout=preview?undefined:setTimeout(()=>{stop();syncPreview();},600);
    function stop(){
      clearTimeout(timeout);
      restore();
    }
    animations.set(claim,stop);
  }

  function echoAtSubmit(){
    if(!enabled() || submit.matches(':disabled'))return;
    animations.get(submit)?.();
    const {label,readout,restore}=decorate(submit);
    readout.textContent=label.textContent;
    const chars=Array.from(label.textContent);
    const windowSize=6,duration=440,start=performance.now();
    let frame;
    function stop(){
      cancelAnimationFrame(frame);
      restore();
    }
    function render(now){
      const elapsed=now-start;
      if(elapsed>=duration || !enabled()){stop();return;}
      const edge=Math.floor((chars.length+windowSize-1)*elapsed/duration)-windowSize+1;
      const phase=Math.floor(elapsed/60);
      readout.textContent=chars.map((char,index)=>{
        if(!char.trim() || index<edge || index>=edge+windowSize)return char;
        return glyphs[(index*3+phase)%glyphs.length];
      }).join('');
      frame=requestAnimationFrame(render);
    }
    animations.set(submit,stop);
    frame=requestAnimationFrame(render);
  }

  function echoOnArrival(){
    cancelArrival();
    if(!submit)return;
    if(!('IntersectionObserver' in window)){echoAtSubmit();return;}
    const observer=new IntersectionObserver(([entry])=>{
      if(cancelArrival!==stop || entry.intersectionRatio<.5)return;
      stop();
      echoAtSubmit();
    },{threshold:.5});
    const expiry=setTimeout(stop,1600);
    function stop(){
      observer.disconnect();
      clearTimeout(expiry);
      if(cancelArrival===stop)cancelArrival=()=>{};
    }
    cancelArrival=stop;
    observer.observe(submit);
  }

  function syncPreview(){
    const hovered=hoverPointer!==null && hover.matches && claim.matches(':hover');
    const focused=keyboardFocused && claim.matches(':focus-visible');
    if(enabled() && (hovered || focused)){
      if(!animations.has(claim))projectClaim(true);
    }else if(claim.classList.contains('claim-preview'))animations.get(claim)?.();
  }
  function trackHover(event){
    if(event.pointerType==='touch' || hoverPointer===event.pointerId || !hover.matches)return;
    hoverPointer=event.pointerId;
    syncPreview();
  }
  function endHover(event){
    if(hoverPointer!==event.pointerId)return;
    hoverPointer=null;
    syncPreview();
  }
  claim.addEventListener('pointerenter',trackHover);
  claim.addEventListener('pointermove',trackHover,{passive:true});
  claim.addEventListener('pointerleave',endHover);
  claim.addEventListener('pointercancel',endHover);
  claim.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch')return;
    hoverPointer=null;
    keyboardFocused=false;
    syncPreview();
  });
  claim.addEventListener('focus',()=>{
    keyboardFocused=claim.matches(':focus-visible');
    syncPreview();
  });
  claim.addEventListener('blur',()=>{
    keyboardFocused=false;
    syncPreview();
  });
  claim.addEventListener('click',event=>{
    if(event.defaultPrevented || event.button!==0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !enabled())return;
    projectClaim(false);
    echoOnArrival();
  });
  function syncMotion(){
    if(enabled()){syncPreview();return;}
    if(document.hidden || !document.hasFocus())hoverPointer=null;
    cancelArrival();
    for(const stop of animations.values())stop();
  }
  window.addEventListener('witness-motion-change',syncMotion);
  window.addEventListener('focus',syncMotion);
  window.addEventListener('blur',syncMotion);
  document.addEventListener('visibilitychange',syncMotion);
  reduced.addEventListener('change',syncMotion);
  hover.addEventListener('change',syncPreview);
}
