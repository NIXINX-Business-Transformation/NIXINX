'use client';
import {useEffect,type RefObject} from 'react';

// Scroll is a starting signal, never an animation clock. Group visible rows
// so a single intersection starts their entire time-based stagger.
const singles=[
 '.hero-continuity > div:first-child','.vision > div',
 '.section-heading > div:first-child','.section-heading > p',
 '.arch-footer','.industry-copy > h2','.usecases > h2',
 '.assessment-promo > div','.business-note','.contact > div:first-child > h2',
].join(',');
const grids=[
 ['.stage-list','.stage-item'],['.capability-grid','.capability'],
 ['.architecture-flow','.flow-node'],['.industry-list',':scope > div'],
 ['.usecase-grid','article'],['.revenue-grid','article'],
];
export function usePublicStory(ref:RefObject<HTMLElement|null>,locale:string){
 useEffect(()=>{
  const root=ref.current;
  if(!root||typeof window.matchMedia!=='function')return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const consumed=new Set<HTMLElement>();
  const managed=new Set<HTMLElement>();
  const groups=new Map<HTMLElement,HTMLElement[]>();
  let observer:IntersectionObserver|undefined;
  let width=window.innerWidth;
  let running=false;
  const reset=(el:HTMLElement)=>{
   el.removeAttribute('data-story-state');el.style.removeProperty('--nx-story-delay');managed.delete(el);
  };
  const clear=()=>{
   observer?.disconnect();observer=undefined;groups.clear();
   for(const el of managed)reset(el);
  };
  const play=(group:HTMLElement[])=>{
   for(const el of group){
    consumed.add(el);
    if(el.matches(':focus-within'))reset(el);
    else el.dataset.storyState='running';
   }
  };
  const setup=()=>{
   clear();
   if(!running)return;
   const vh=window.innerHeight;
   const candidates:HTMLElement[][]=Array.from(root.querySelectorAll<HTMLElement>(singles),el=>[el]);
   for(const [container,selector] of grids){
    for(const grid of root.querySelectorAll(container)){
     const rows:HTMLElement[][]=[];
     for(const el of grid.querySelectorAll<HTMLElement>(selector)){
      const last=rows[rows.length-1];
      if(last&&Math.abs(last[0].getBoundingClientRect().top-el.getBoundingClientRect().top)<4)last.push(el);
      else rows.push([el]);
     }
     candidates.push(...rows);
    }
   }
   observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
     if(!entry.isIntersecting)continue;
     const anchor=entry.target as HTMLElement;
     const group=groups.get(anchor);
     if(!group)continue;
     observer?.unobserve(anchor);groups.delete(anchor);play(group);
    }
   },{rootMargin:'0px 0px -10% 0px',threshold:0.01});
   for(const row of candidates){
    // Do not reposition anything that was already visible on first paint,
    // on deep links, after a resize, or when motion preferences change.
    const group=row.filter(el=>!consumed.has(el)&&el.getBoundingClientRect().top>=vh);
    if(!group.length)continue;
    group.forEach((el,i)=>{
     el.style.setProperty('--nx-story-delay',Math.min(i,5)*125+'ms');
     managed.add(el);el.dataset.storyState='armed';
    });
    groups.set(group[0],group);observer.observe(group[0]);
   }
  };
  const heroExit=()=>{
   // Only a discrete threshold changes state. CSS owns the whole transition.
   if(window.scrollY>72)root.dataset.storyHero='exit';
   else if(window.scrollY<=12)delete root.dataset.storyHero;
  };
  const resize=()=>{if(window.innerWidth!==width){width=window.innerWidth;setup();}};
  const finished=(event:AnimationEvent)=>{
   if(event.animationName!=='nx-public-rise')return;
   if(event.target instanceof HTMLElement&&managed.has(event.target))reset(event.target);
  };
  const focus=(event:FocusEvent)=>{
   if(!(event.target instanceof Element))return;
   const el=event.target.closest<HTMLElement>('[data-story-state]');
   if(!el||!managed.has(el))return;
   for(const [anchor,group] of groups){
    if(!group.includes(el))continue;
    observer?.unobserve(anchor);groups.delete(anchor);
    for(const member of group){consumed.add(member);reset(member);}
    return;
   }
   consumed.add(el);reset(el);
  };
  const stop=()=>{
   running=false;clear();delete root.dataset.storyHero;
   window.removeEventListener('scroll',heroExit);window.removeEventListener('resize',resize);
   root.removeEventListener('animationend',finished);root.removeEventListener('animationcancel',finished);root.removeEventListener('focusin',focus);
  };
  const start=()=>{
   stop();
   if(motion.matches||typeof IntersectionObserver==='undefined'||typeof CSS==='undefined'||!CSS.supports('translate','0 1px')){root.dataset.storyMode='off';return;}
   running=true;width=window.innerWidth;setup();heroExit();
   window.addEventListener('scroll',heroExit,{passive:true});window.addEventListener('resize',resize,{passive:true});
   root.addEventListener('animationend',finished);root.addEventListener('animationcancel',finished);root.addEventListener('focusin',focus);
   root.dataset.storyMode='trigger';
  };
  start();
  if(typeof motion.addEventListener==='function')motion.addEventListener('change',start);
  else motion.addListener(start);
  return ()=>{stop();delete root.dataset.storyMode;if(typeof motion.removeEventListener==='function')motion.removeEventListener('change',start);else motion.removeListener(start);};
 },[ref,locale]);
}
