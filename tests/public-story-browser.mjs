import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='http://127.0.0.1:3100';
const sizes=[[320,568],[568,320],[375,667],[667,375],[390,844],[844,390],[430,932],[932,430],[768,1024],[1024,768],[820,1180],[1180,820],[1024,1366],[1366,1024],[1280,800],[1440,900],[1920,1080]];
const engines=process.env.NX_QA_ENGINE==='chromium'?[chromium]:process.env.NX_QA_ENGINE==='webkit'?[webkit]:[chromium,webkit];
for(const engine of engines){
 const browser=await engine.launch({headless:true});
 try{
 for(const locale of ['en','es','fr']){
  const ctx=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference'});
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===base&&!route.request().url().includes('/api/')?route.continue():route.abort());
  const page=await ctx.newPage();
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});await page.goto(base+'/'+locale);
   await page.locator('.public-story[data-story-ready="true"]').waitFor();
   const initial=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').offsetHeight,nav:document.querySelector('.site-header').offsetHeight,head:document.querySelector('h1').textContent}));
   assert.equal(await page.locator('.site-header .nav-login').count(),1);
   const move=async(selector,fraction)=>page.evaluate(({selector,fraction})=>{let e=document.querySelector(selector),y=0;while(e){y+=e.offsetTop;e=e.offsetParent;}document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,y-innerHeight*fraction)},{selector,fraction});
   const first=page.locator('.stage-item').first();
   assert.equal(await first.getAttribute('data-story-state'),'waiting');
   await move('.stage-item',.55);
   await page.waitForFunction(()=>document.querySelector('.stage-item').dataset.storyState==='shown');
   const scroll=await page.evaluate(()=>window.scrollY);
   const sample=()=>first.evaluate(el=>{const v=getComputedStyle(el).translate;return v==='none'?0:parseFloat(v.split(' ')[1]||'0')});
   await page.waitForFunction(()=>{const v=getComputedStyle(document.querySelector('.stage-item')).translate;return parseFloat(v.split(' ')[1]||'0')>5});
   const start=await sample();
   await page.waitForFunction(p=>{const v=getComputedStyle(document.querySelector('.stage-item')).translate;return parseFloat(v.split(' ')[1]||'0')<p-3},start);
   await page.waitForFunction(()=>{const v=getComputedStyle(document.querySelector('.stage-item')).translate;return v==='none'||Math.abs(parseFloat(v.split(' ')[1]||'0'))<.1});
   assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-scroll)<1,'autonomous completion at fixed scroll');
   if(width>750){assert.equal(await page.locator('.stage-item').nth(1).getAttribute('data-story-state'),'shown');assert.equal(await page.locator('.stage-item').nth(1).evaluate(el=>el.style.getPropertyValue('--nx-story-delay')),'125ms');}
   await move('.stage-item',1.05);
   await page.waitForFunction(()=>document.querySelector('.stage-item').dataset.storyState==='waiting');
   await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.stage-item')).translate.split(' ')[1]||'0')>20);
   await move('.stage-item',.55);
   await page.waitForFunction(()=>document.querySelector('.stage-item').dataset.storyState==='shown');
   await move('.radar',.5);
   await page.waitForFunction(()=>document.querySelector('.radar').dataset.storyState==='shown');
   assert.deepEqual(await page.locator('.orbit-label').allTextContents(),['Apps','MI','PM']);
   assert.equal(await page.locator('.vision > div').first().getAttribute('data-story-axis'),'right');
   assert.equal(await page.locator('.flow-with-arrow').first().getAttribute('data-story-axis'),'right');
   assert.equal(await page.locator('.industry-list > div').first().getAttribute('data-story-axis'),'left');
   await page.mouse.move(width/2,height/2);
   assert.equal(await page.locator('.nx-cursor-mist').count(),0,'cursor effect removed');
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.public-story[data-story-mode="off"]').waitFor();
   assert.equal(await page.locator('[data-story-state]').count(),0);
   assert.equal(await page.locator('.nx-cursor-mist').count(),0);
   await page.evaluate(()=>window.scrollTo(0,0));
   const end=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').offsetHeight,nav:document.querySelector('.site-header').offsetHeight,head:document.querySelector('h1').textContent,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
   assert.equal(initial.hero,end.hero);assert.equal(initial.nav,end.nav);assert.equal(initial.head,end.head);assert.ok(end.overflow<=1,'horizontal overflow');
   const outside=await page.evaluate(()=>[...document.querySelectorAll('.nav-wrap > *, .hero-copy, .hero-pillars, .stage-item,.capability,.flow-with-arrow,.industry-list > div,.orbit-badge,.usecase-grid article,.revenue-grid article,.lead-form')].filter(el=>el.getClientRects().length).map(el=>({name:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})).filter(r=>r.left< -1||r.right>document.documentElement.clientWidth+1));
   assert.deepEqual(outside,[],'settled elements remain inside viewport');
   await page.emulateMedia({reducedMotion:'no-preference'});
   console.log('PASS',engine.name(),locale,width,height,'reversible autonomous motion');
  }
  await ctx.close();
 }
 // Rotate a real touch-enabled browser context without reloading; keep nav and motion functional.
 for(const [pw,ph] of [[390,844],[820,1180],[1024,1366]]){
  const touch=await browser.newContext({viewport:{width:pw,height:ph},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'no-preference'});
  await touch.route('**/*',r=>new URL(r.request().url()).origin===base&&!r.request().url().includes('/api/')?r.continue():r.abort());
  const page=await touch.newPage();await page.goto(base+'/es');await page.locator('.public-story[data-story-ready="true"]').waitFor();
  for(const [w,h] of [[pw,ph],[ph,pw],[pw,ph]]){
   await page.setViewportSize({width:w,height:h});
   await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0)});
   await page.waitForFunction(()=>document.querySelector('.public-story').dataset.storyReady==='true'&&window.scrollY===0);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.evaluate(()=>innerWidth),w);
   const outside=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert.ok(outside<=1,'rotation overflow');
   await page.evaluate(()=>document.querySelector('.public-story').dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',clientX:150,clientY:150,bubbles:true})));
   assert.equal(await page.locator('.nx-cursor-mist').count(),0,'cursor effect absent on touch');
   await page.evaluate(()=>{let e=document.querySelector('.stage-item'),y=0;while(e){y+=e.offsetTop;e=e.offsetParent;}window.scrollTo(0,y-innerHeight*.55)});
   await page.waitForFunction(()=>document.querySelector('.stage-item').dataset.storyState==='shown');
   console.log('PASS',engine.name(),'touch rotation',w,h);
  }
  await touch.close();
 }
 }finally{await browser.close();}
}
