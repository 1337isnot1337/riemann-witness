const hero=document.querySelector('.hero');
if(hero){
  const button=hero.querySelector('[data-motion-switch]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const root=document.documentElement;
  let paused=false,visible=false,frame=0,x=0,y=0;
  try{paused=localStorage.getItem('witness-motion')==='off';}catch{}

  function paintPosition(){
    frame=0;
    hero.style.setProperty('--yaw',(x*3.8).toFixed(2)+'deg');
    hero.style.setProperty('--pitch',(-y*2.4).toFixed(2)+'deg');
    hero.style.setProperty('--chart-x',(x*5).toFixed(2)+'px');
    hero.style.setProperty('--chart-y',(y*3).toFixed(2)+'px');
    hero.style.setProperty('--title-x',(-x*7).toFixed(2)+'px');
    hero.style.setProperty('--title-y',(-y*4).toFixed(2)+'px');
  }
  function center(){
    cancelAnimationFrame(frame);x=0;y=0;paintPosition();
  }
  function sync(){
    const enabled=!paused && !reduced.matches;
    root.dataset.motion=enabled?'on':'off';
    hero.toggleAttribute('data-moving',enabled && visible && !document.hidden);
    button.hidden=reduced.matches;
    button.ariaLabel=paused?'Play animation':'Pause animation';
    button.title=button.ariaLabel;
    if(!hero.hasAttribute('data-moving'))center();
    window.dispatchEvent(new Event('witness-motion-change'));
  }
  button.addEventListener('click',()=>{
    paused=!paused;
    try{localStorage.setItem('witness-motion',paused?'off':'on');}catch{}
    sync();
  });
  hero.addEventListener('pointermove',event=>{
    if(!hero.hasAttribute('data-moving') || !finePointer.matches || event.pointerType==='touch')return;
    const bounds=hero.getBoundingClientRect();
    x=Math.max(-1,Math.min(1,2*(event.clientX-bounds.left)/bounds.width-1));
    y=Math.max(-1,Math.min(1,2*(event.clientY-bounds.top)/bounds.height-1));
    if(!frame)frame=requestAnimationFrame(paintPosition);
  },{passive:true});
  hero.addEventListener('pointerleave',center);
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();});
    observer.observe(hero);
  }else visible=true;
  sync();
}
