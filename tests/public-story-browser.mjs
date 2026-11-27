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
   await page.setViewportSize({width,height});
   await page.goto(base+'/'+locale);
   await page.locator('.public-story[data-story-mode="trigger"]').waitFor();
   const initial=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').offsetHeight,nav:document.querySelector('.site-header').offsetHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,head:document.querySelector('h1').textContent}));
   assert.equal(await page.locator('.site-header .nav-login').count(),1);
   await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,100)});
   await page.locator('.public-story[data-story-hero="exit"]').waitFor();
   await page.waitForFunction(small=>parseFloat(getComputedStyle(document.querySelector('.hero-facade'),small?'::after':null).scale)<.98,width<=750);
   const first=page.locator('.stage-item').first();
   assert.equal(await first.getAttribute('data-story-state'),'armed');
   await page.evaluate(()=>{const el=document.querySelector('.stage-item');window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-innerHeight*.65)});
   await page.waitForFunction(()=>document.querySelector('.stage-item')?.getAttribute('data-story-state')==='running');
   const snapshot=()=>page.evaluate(()=>{const el=document.querySelector('.stage-item');return {scroll:window.scrollY,dy:el.getBoundingClientRect().top,translate:parseFloat(getComputedStyle(el).translate.split(' ')[1]||'0'),row:[...document.querySelectorAll('.stage-item')].map(x=>({state:x.getAttribute('data-story-state'),delay:getComputedStyle(x).animationDelay}))};});
   const start=await snapshot();
   if(width>750){
    assert.equal(start.row[1].state,'running','same row launched by one trigger');
    assert.ok(parseFloat(start.row[1].delay)>parseFloat(start.row[0].delay),'stagger');
   }
   await page.waitForFunction(previous=>{const e=document.querySelector('.stage-item');return parseFloat(getComputedStyle(e).translate.split(' ')[1]||'0')<previous-8},start.translate);
   const middle=await snapshot();
   assert.ok(Math.abs(middle.scroll-start.scroll)<1,'scroll remained fixed during animation');
   assert.ok(middle.dy<start.dy-8,'visible autonomous motion');
   await page.waitForFunction(()=>!document.querySelector('.stage-item').hasAttribute('data-story-state'));
   const done=await snapshot();
   assert.ok(Math.abs(done.scroll-start.scroll)<1,'animation finished without further scrolling');
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.waitForFunction(()=>!document.querySelector('.public-story').hasAttribute('data-story-hero'));
   assert.equal(await first.getAttribute('data-story-state'),null,'one-shot');
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.public-story[data-story-mode="off"]').waitFor();
   assert.equal(await page.locator('[data-story-state]').count(),0);
   const end=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').offsetHeight,nav:document.querySelector('.site-header').offsetHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,head:document.querySelector('h1').textContent}));
   assert.equal(initial.hero,end.hero);assert.equal(initial.nav,end.nav);assert.equal(initial.head,end.head);
   assert.ok(initial.overflow<=1,'horizontal overflow '+locale+' '+width+': '+initial.overflow);
   assert.ok(end.overflow<=1,'horizontal overflow reduced motion');
   await page.emulateMedia({reducedMotion:'no-preference'});
   console.log('PASS',engine.name(),locale,width,height,'autonomous motion at fixed scroll');
  }
  await ctx.close();
 }
 }finally{await browser.close();}
}
