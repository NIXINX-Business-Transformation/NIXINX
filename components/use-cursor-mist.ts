'use client';
import {useEffect,type RefObject} from 'react';
// One lightweight layer, active only during movement of a desktop mouse.
export function useCursorMist(ref:RefObject<HTMLElement|null>){
 useEffect(()=>{
  const root=ref.current,el=root?.querySelector<HTMLElement>('.nx-cursor-mist');
  if(!root||!el||typeof window.matchMedia!=='function')return;
  const media=window.matchMedia('(min-width:1051px) and (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
  let timer=0,frame=0,x=0,y=0,attached=false;
  const hide=()=>{if(timer)window.clearTimeout(timer);if(frame)cancelAnimationFrame(frame);timer=frame=0;delete el.dataset.mist;};
  const move=(event:PointerEvent)=>{
   if(event.pointerType!=='mouse'||!(event.target instanceof Element)||event.target.closest('a,button,input,select,textarea,label,form,[contenteditable]')){hide();return;}
   x=event.clientX;y=event.clientY;
   if(!frame)frame=requestAnimationFrame(()=>{frame=0;el.style.transform='translate3d('+x+'px,'+y+'px,0)';el.dataset.mist='moving';});
   if(timer)window.clearTimeout(timer);timer=window.setTimeout(hide,140);
  };
  const stop=()=>{if(attached){root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',hide);window.removeEventListener('blur',hide);window.removeEventListener('scroll',hide);attached=false;}hide();};
  const sync=()=>{stop();if(media.matches&&navigator.maxTouchPoints<2){root.addEventListener('pointermove',move,{passive:true});root.addEventListener('pointerleave',hide);window.addEventListener('blur',hide);window.addEventListener('scroll',hide,{passive:true});attached=true;}};
  sync();if(typeof media.addEventListener==='function')media.addEventListener('change',sync);else media.addListener(sync);
  return ()=>{stop();if(typeof media.removeEventListener==='function')media.removeEventListener('change',sync);else media.removeListener(sync);};
 },[ref]);
}
