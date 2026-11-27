import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='http://127.0.0.1:3100';
const sizes=[[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[820,1180],[1024,768],[1280,800],[1440,900],[1920,1080]];
for(const engine of [chromium,webkit]){
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
   if(width>=1051){
    await page.mouse.move(width/2,height/2);
    const eligible=await page.evaluate(()=>matchMedia('(min-width:1051px) and (hover:hover) and (pointer:fine)').matches&&navigator.maxTouchPoints<2);
    if(eligible){await page.evaluate(()=>{document.querySelector('.public-story').dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:350,clientY:300,bubbles:true}));});await page.locator('.nx-cursor-mist[data-mist="moving"]').waitFor({state:'attached'});await page.locator('.nx-cursor-mist[data-mist="moving"]').waitFor({state:'detached'});}
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.public-story[data-story-mode="off"]').waitFor();
   assert.equal(await page.locator('[data-story-state]').count(),0);
   assert.equal(await page.locator('.nx-cursor-mist').evaluate(el=>getComputedStyle(el).display),'none');
   await page.evaluate(()=>window.scrollTo(0,0));
   const end=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').offsetHeight,nav:document.querySelector('.site-header').offsetHeight,head:document.querySelector('h1').textContent,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
   assert.equal(initial.hero,end.hero);assert.equal(initial.nav,end.nav);assert.equal(initial.head,end.head);assert.ok(end.overflow<=1,'horizontal overflow');
   await page.emulateMedia({reducedMotion:'no-preference'});
   console.log('PASS',engine.name(),locale,width,height,'reversible autonomous motion');
  }
  await ctx.close();
 }
 }finally{await browser.close();}
}
