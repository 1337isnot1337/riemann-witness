const claim=document.querySelector('.hero a[href="#sign"]');
const submit=document.querySelector('#register .dark-btn');

if(claim){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const duration=440;
  const glyphs='01/+×=⌁∷≡';
  const animations=new Map();
  let cancelArrival=()=>{};
  const enabled=()=>!reduced.matches && !document.hidden && document.documentElement.dataset.motion!=='off';

  function decode(button){
    if(!enabled() || button.matches(':disabled'))return;
    animations.get(button)?.();
    const label=document.createElement('span'),readout=document.createElement('span');
    label.className='claim-decode-label';
    label.append(...button.childNodes);
    readout.className='claim-decode-readout';
    readout.setAttribute('aria-hidden','true');
    readout.textContent=label.textContent;
    button.append(label,readout);
    button.classList.add('claim-decoding');

    // A short window travels across the existing label, leaving the rest readable.
    const chars=Array.from(label.textContent);
    const windowSize=6,start=performance.now();
    let frame;
    function stop(){
      cancelAnimationFrame(frame);
      button.classList.remove('claim-decoding');
      button.replaceChildren(...label.childNodes);
      animations.delete(button);
    }
    function render(now){
      const elapsed=now-start;
      if(elapsed>=duration || !enabled()){stop();return;}
      const edge=Math.floor((chars.length+windowSize)*elapsed/duration)-windowSize;
      const phase=Math.floor(elapsed/60);
      readout.textContent=chars.map((char,index)=>{
        if(!char.trim() || index<edge || index>=edge+windowSize)return char;
        return glyphs[(index*3+phase)%glyphs.length];
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
