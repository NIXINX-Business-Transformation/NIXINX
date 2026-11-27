'use client';
import {useEffect,type RefObject} from 'react';

// Only the public homepage participates. No scroll handlers, timers, initial
// hidden content, dependencies, layout changes or animation of interactive controls.
const targets=[
 '.hero-continuity > div:first-child',
 '.vision > div',
 '.section-heading > div:first-child',
 '.section-heading > p',
 '.stage-item',
 '.capability',
 '.flow-node',
 '.flow-arrow',
 '.arch-footer',
 '.industry-copy > h2',
 '.industry-list > div',
 '.usecases > h2',
 '.usecase-grid article',
 '.assessment-promo > div',
 '.revenue-grid article',
 '.business-note',
 '.contact > div:first-child > h2',
].join(',');

export function usePublicStory(ref:RefObject<HTMLElement|null>,locale:string){
 useEffect(()=>{
  const root=ref.current;
  if(!root||typeof IntersectionObserver==='undefined'||typeof window.matchMedia!=='function')return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let observer:IntersectionObserver|undefined;
  const active=new Set<Element>();
  const clear=()=>{observer?.disconnect();observer=undefined;active.forEach(el=>el.removeAttribute('data-story-enter'));active.clear();};
  const start=()=>{
   clear();
   if(motion.matches)return;
   const vh=window.innerHeight;
   observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
     if(!entry.isIntersecting)continue;
     observer?.unobserve(entry.target);
     // An anchor jump or deep link should not animate a section already visible.
     if(entry.boundingClientRect.top<0||entry.target.matches(':focus-within'))continue;
     active.add(entry.target);
     entry.target.setAttribute('data-story-enter','true');
    }
   },{rootMargin:'0px 0px -7% 0px',threshold:0.01});
   root.querySelectorAll(targets).forEach(el=>{
    const rect=el.getBoundingClientRect();
    // Preserve first paint and the currently visible content exactly.
    if(rect.top>=vh)observer?.observe(el);
   });
  };
  const ended=(event:AnimationEvent)=>{
   if(event.animationName!=='nx-public-enter'&&event.animationName!=='nx-public-flow')return;
   const el=event.target;
   if(el instanceof Element&&active.delete(el))el.removeAttribute('data-story-enter');
  };
  root.addEventListener('animationend',ended);
  start();
  if(typeof motion.addEventListener==='function')motion.addEventListener('change',start);
  else motion.addListener(start);
  return ()=>{clear();root.removeEventListener('animationend',ended);if(typeof motion.removeEventListener==='function')motion.removeEventListener('change',start);else motion.removeListener(start);};
 },[ref,locale]);
}
