'use client';
import {useEffect,type RefObject} from 'react';

const singles=[
 '.hero-continuity > div:first-child','.vision > div',
 '.section-heading > div:first-child','.section-heading > p',
 '.arch-footer','.industry-copy > h2','.usecases > h2',
 '.assessment-promo > div','.business-note','.contact > div:first-child > h2',
].join(',');
const grids=[
 ['.stage-list','.stage-item'],['.capability-grid','.capability'],
 ['.architecture-flow','.flow-with-arrow'],['.usecase-grid','article'],['.revenue-grid','article'],
];
type Group={items:HTMLElement[];anchor:HTMLElement;shown:boolean;radar:boolean;threshold:number};
// Layout coordinates, not transformed visual rectangles: no feedback from motion.
function topOf(el:HTMLElement){let y=0;let node:HTMLElement|null=el;while(node){y+=node.offsetTop;node=node.offsetParent as HTMLElement|null;}return y;}
export function usePublicStory(ref:RefObject<HTMLElement|null>,locale:string){
 useEffect(()=>{
  const node=ref.current;
  if(!node||typeof window.matchMedia!=='function')return;
  const root:HTMLElement=node;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let groups:Group[]=[];let frame=0;let resizeFrame=0;let running=false;let lastY=window.scrollY;let width=window.innerWidth;
  const managed=new Set<HTMLElement>();
  function clear(){
   root.removeAttribute('data-story-ready');
   root.removeAttribute('data-story-hero');
   for(const el of managed){el.removeAttribute('data-story-state');el.removeAttribute('data-story-axis');el.style.removeProperty('--nx-story-delay');}
   managed.clear();groups=[];
  }
  function add(items:HTMLElement[],axis='up',radar=false,random=false){
   if(!items.length)return;
   const anchor=items[0];
   const shown=topOf(anchor)-window.scrollY<window.innerHeight*.88;
   const order=items.map((_,i)=>i);
   if(random){for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}if(order.every((v,i)=>v===i)&&order.length>1)order.push(order.shift()!);}
   items.forEach((el,i)=>{
    managed.add(el);el.dataset.storyAxis=axis;el.dataset.storyState=shown?'shown':'waiting';
    el.style.setProperty('--nx-story-delay',order.indexOf(i)*125+'ms');
   });
   groups.push({items,anchor,shown,radar,threshold:radar?.75:.78});
  }
  function setup(){
   clear();
   if(!running)return;
   for(const el of root.querySelectorAll<HTMLElement>(singles))add([el],el.matches('.vision > div:first-child')?'right':'up');
   for(const [container,selector] of grids){
    for(const grid of root.querySelectorAll(container)){
     const rows:HTMLElement[][]=[];
     for(const el of grid.querySelectorAll<HTMLElement>(selector)){
      const last=rows[rows.length-1];
      if(last&&Math.abs(topOf(last[0])-topOf(el))<4)last.push(el);else rows.push([el]);
     }
     for(const row of rows)add(row,container==='.architecture-flow'?'right':'up');
    }
   }
   for(const list of root.querySelectorAll<HTMLElement>('.industry-list')){
    const items=Array.from(list.querySelectorAll<HTMLElement>(':scope > div'));
    // Keep the actual semantic DOM order; randomize only the start times.
    if(window.innerHeight>=560)add(items,'left',false,true);
    else for(const el of items)add([el],'left');
   }
   const radar=root.querySelector<HTMLElement>('.radar');if(radar)add([radar],'orbit',true);
   lastY=window.scrollY;
   if(lastY>72)root.dataset.storyHero='exit';
   // Flush the static starting states before enabling timed transitions.
   void root.offsetHeight;root.dataset.storyReady='true';
  }
  function tick(){
   frame=0;if(!running)return;
   const y=window.scrollY,vh=window.innerHeight,down=y>=lastY;
   // A single threshold crossing switches state; CSS completes the sequence
   // without additional wheel events. Hysteresis prevents flicker at the line.
   const changes:Group[]=[];
   for(const group of groups){
    const top=topOf(group.anchor)-y;
    const focused=group.items.some(el=>el.matches(':focus-within'));
    const next=focused?true:group.shown?!( !down&&top>vh*.90):top<vh*group.threshold;
    if(next!==group.shown){group.shown=next;changes.push(group);}
   }
   if(y>72)root.dataset.storyHero='exit';else if(y<=12)delete root.dataset.storyHero;
   lastY=y;
   for(const group of changes)for(const el of group.items)el.dataset.storyState=group.shown?'shown':'waiting';
  }
  function schedule(){if(running&&!frame)frame=requestAnimationFrame(tick);}
  function resize(){if(window.innerWidth===width)return;width=window.innerWidth;if(resizeFrame)cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;setup();});}
  function stop(){
   running=false;if(frame)cancelAnimationFrame(frame);if(resizeFrame)cancelAnimationFrame(resizeFrame);frame=resizeFrame=0;
   window.removeEventListener('scroll',schedule);window.removeEventListener('resize',resize);
   root.removeEventListener('focusin',schedule);clear();
  }
  function start(){
   stop();
   if(motion.matches||typeof CSS==='undefined'||!CSS.supports('translate','0 1px')){root.dataset.storyMode='off';return;}
   running=true;width=window.innerWidth;root.dataset.storyMode='trigger';setup();
   window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',resize,{passive:true});root.addEventListener('focusin',schedule);
  }
  start();
  if(typeof motion.addEventListener==='function')motion.addEventListener('change',start);else motion.addListener(start);
  return ()=>{stop();delete root.dataset.storyMode;if(typeof motion.removeEventListener==='function')motion.removeEventListener('change',start);else motion.removeListener(start);};
 },[ref,locale]);
}
