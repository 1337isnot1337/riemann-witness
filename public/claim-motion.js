const claim=document.querySelector('.hero a[href="#sign"]');
const submit=document.querySelector('#register .dark-btn');

if(claim){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const hover=matchMedia('(any-hover: hover)');
  const glyphs='ζ∑π∫σ∞∂½';
  const animations=new Map();
  let cancelArrival=()=>{};
  const enabled=()=>!reduced.matches && !document.hidden && document.documentElement.dataset.motion!=='off';

  function decode(button,preview=false){
    if(!enabled() || button.matches(':disabled'))return;
    if(preview && animations.has(button))return;
    animations.get(button)?.();
    const label=document.createElement('span'),readout=document.createElement('span');
    label.className='claim-decode-label';
    label.append(...button.childNodes);
    readout.className='claim-decode-readout';
    readout.setAttribute('aria-hidden','true');
    const text=button===claim?label.textContent.toUpperCase():label.textContent;
    readout.textContent=text;
    button.append(label,readout);
    button.classList.add('claim-decoding');
    if(preview)button.classList.add('claim-preview');

    // Hover traces the last word. Activation carries the notation across the full label.
    const chars=Array.from(text);
    const first=preview?chars.lastIndexOf(' ')+1:0;
    const windowSize=preview?2:6,duration=preview?280:440,start=performance.now();
    let frame;
    function stop(){
      cancelAnimationFrame(frame);
      button.classList.remove('claim-decoding','claim-preview');
      button.replaceChildren(...label.childNodes);
      animations.delete(button);
    }
    function render(now){
      const elapsed=now-start;
      if(elapsed>=duration || !enabled()){stop();return;}
      const edge=first+Math.floor((chars.length-first+windowSize-1)*elapsed/duration)-windowSize+1;
      const phase=Math.floor(elapsed/60);
      readout.textContent=chars.map((char,index)=>{
        if(!char.trim() || index<first || index<edge || index>=edge+windowSize)return char;
        return glyphs[((index-first)*3+phase)%glyphs.length];
      }).join('');
      frame=requestAnimationFrame(render);
    }
    animations.set(button,stop);
    frame=requestAnimationFrame(render);
  }

  function echoOnArrival(){
    cancelArrival();
    if(!submit)return;
    if(!('IntersectionObserver' in window)){decode(submit);return;}
    const observer=new IntersectionObserver(([entry])=>{
      if(cancelArrival!==stop || entry.intersectionRatio<.5)return;
      stop();
      decode(submit);
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

  function stopPreview(){
    if(claim.classList.contains('claim-preview'))animations.get(claim)?.();
  }
  claim.addEventListener('pointerenter',event=>{
    if(event.pointerType!=='touch' && hover.matches)decode(claim,true);
  });
  claim.addEventListener('pointerleave',stopPreview);
  claim.addEventListener('focus',()=>{
    if(claim.matches(':focus-visible'))decode(claim,true);
  });
  claim.addEventListener('blur',stopPreview);
  claim.addEventListener('click',event=>{
    if(event.defaultPrevented || event.button!==0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !enabled())return;
    decode(claim);
    echoOnArrival();
  });
  window.addEventListener('witness-motion-change',()=>{
    if(enabled())return;
    cancelArrival();
    for(const stop of animations.values())stop();
  });
}
