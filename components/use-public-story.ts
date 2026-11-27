'use client';
import {useEffect,type RefObject} from 'react';

// Scroll-linked editorial motion on the public homepage, including Safari.
// A single passive listener schedules one frame; no React updates on scroll.
const selectors=[
 '.hero-continuity > div:first-child','.vision > div',
 '.section-heading > div:first-child','.section-heading > p',
 '.stage-item','.capability','.flow-node','.arch-footer',
 '.industry-copy > h2','.industry-list > div','.usecases > h2',
 '.usecase-grid article','.assessment-promo > div','.revenue-grid article',
 '.business-note','.contact > div:first-child > h2',
].join(',');
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function usePublicStory(ref:RefObject<HTMLElement|null>,locale:string){
 useEffect(()=>{
  const root=ref.current;
  if(!root||typeof window.matchMedia!=='function'||typeof window.requestAnimationFrame!=='function')return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero=root.querySelector<HTMLElement>('.executive-hero');
  const targets=Array.from(root.querySelectorAll<HTMLElement>(selectors)).map(el=>({el,y:0,progress:1}));
  let frame=0,running=false;
  const clear=()=>{
   targets.forEach(t=>{t.el.style.removeProperty('--nx-story-y');t.el.style.removeProperty('--nx-story-progress');t.y=0;t.progress=1;});
   root.style.removeProperty('--nx-hero-progress');
  };
  const update=()=>{
   frame=0;
   if(!running||motion.matches)return;
   const vh=window.innerHeight;
   const small=window.innerWidth<=750;
   const distance=small?34:64;
   const heroProgress=hero?clamp(-hero.getBoundingClientRect().top/Math.min(620,Math.max(240,hero.offsetHeight*.65))):0;
   // Read geometry before writing styles; compensate the preceding translation.
   const next=targets.map(t=>{
    const rect=t.el.getBoundingClientRect();
    const top=rect.top-t.y;
    const parent=t.el.parentElement;
    const grouped=t.el.matches('.stage-item,.capability,.usecase-grid article,.revenue-grid article,.flow-node,.industry-list > div');
    const item=t.el.matches('.flow-node')?parent:t.el;
    const index=grouped&&item?.parentElement?Array.prototype.indexOf.call(item.parentElement.children,item):0;
    const delay=small?0:Math.min(3,Math.max(0,index))*0.065;
    const progress=clamp((vh*.96-top)/(vh*.40)-delay);
    const p=t.el.matches(':focus-within')?1:progress;
    // Gentle easing, with a longer perceptible middle phase.
    const eased=p*p*(3-2*p);
    return {t,y:Math.round(distance*(1-eased)*100)/100,p:Math.round(eased*1000)/1000};
   });
   root.style.setProperty('--nx-hero-progress',String(heroProgress));
   for(const {t,y,p} of next){
    if(y!==t.y){t.el.style.setProperty('--nx-story-y',y+'px');t.y=y;}
    if(p!==t.progress){t.el.style.setProperty('--nx-story-progress',String(p));t.progress=p;}
   }
  };
  const schedule=()=>{if(running&&!frame)frame=window.requestAnimationFrame(update);};
  const stop=()=>{
   running=false;window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);
   root.removeEventListener('focusin',schedule);root.removeEventListener('focusout',schedule);
   if(frame)window.cancelAnimationFrame(frame);frame=0;clear();
  };
  const start=()=>{
   stop();
   if(motion.matches||typeof CSS==='undefined'||!CSS.supports('translate','0 1px')){root.dataset.storyMode='off';return;}
   running=true;
   root.dataset.storyMode='scroll';
   update();
   window.addEventListener('scroll',schedule,{passive:true});
   window.addEventListener('resize',schedule,{passive:true});
   root.addEventListener('focusin',schedule);root.addEventListener('focusout',schedule);
  };
  start();
  if(typeof motion.addEventListener==='function')motion.addEventListener('change',start);
  else motion.addListener(start);
  return ()=>{stop();delete root.dataset.storyMode;if(typeof motion.removeEventListener==='function')motion.removeEventListener('change',start);else motion.removeListener(start);};
 },[ref,locale]);
}
