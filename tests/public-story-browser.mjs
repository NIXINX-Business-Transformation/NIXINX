import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='http://127.0.0.1:3100';
const browser=await chromium.launch({headless:true});
const sizes=[[320,568],[375,667],[390,844],[430,932],[844,390],[768,1024],[820,1180],[1024,768],[1280,800],[1440,900],[1920,1080]];
try{
 for(const locale of ['en','es','fr']){
  const ctx=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference'});
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===base&&!route.request().url().includes('/api/')?route.continue():route.abort());
  const page=await ctx.newPage();
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});
   await page.goto(base+'/'+locale);
   await page.locator('.public-story').waitFor();
   await page.locator('.hero-copy h1').waitFor();
   await page.waitForFunction(()=>document.readyState==='complete');
   const start=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').getBoundingClientRect().height,nav:document.querySelector('.site-header').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,head:document.querySelector('h1').textContent,sections:[...document.querySelectorAll('.public-story > *')].map(e=>e.className),heroMotion:document.querySelector('.hero-copy').hasAttribute('data-story-enter')}));
   assert.equal(start.heroMotion,false);
   assert.equal(await page.locator('.site-header .nav-login').count(),1);
   const card=page.locator('.capability').first();
   await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,document.querySelector('.capabilities').offsetTop-60);});
   await card.waitFor({state:'visible'});
   await page.waitForTimeout(800);
   assert.equal(await card.evaluate(el=>getComputedStyle(el).opacity),'1');
   assert.equal(await card.evaluate(el=>el.hasAttribute('data-story-enter')),false);
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>document.querySelectorAll('[data-story-enter]').length===0);
   await page.evaluate(()=>window.scrollTo(0,0));
   const end=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').getBoundingClientRect().height,nav:document.querySelector('.site-header').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,head:document.querySelector('h1').textContent,sections:[...document.querySelectorAll('.public-story > *')].map(e=>e.className),active:document.querySelectorAll('[data-story-enter]').length}));
   assert.equal(end.active,0);
   assert.equal(start.hero,end.hero);
   assert.equal(start.nav,end.nav);
   assert.equal(start.head,end.head);
   assert.deepEqual(start.sections,end.sections);
   assert.ok(end.overflow<=start.overflow+1,'reduced motion geometry changed');
   assert.ok(start.overflow<=1,'horizontal overflow '+locale+' '+width+': '+start.overflow);
   await page.emulateMedia({reducedMotion:'no-preference'});
   console.log('PASS',locale,width,height);
  }
  await ctx.close();
 }
 // Verify an offscreen target actually animates and cleanup is one-shot.
 const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===base&&!r.request().url().includes('/api/')?r.continue():r.abort());
 const page=await ctx.newPage();await page.goto(base+'/en');
 await page.waitForFunction(()=>document.readyState==='complete');
 // Hydration signal: the mobile menu is not used; wait for React effect setup.
 await page.waitForTimeout(500);
 await page.locator('.stage-item').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.stage-item')?.getAttribute('data-story-enter')==='true',{},{timeout:2500});
 assert.equal(await page.locator('.stage-item').first().evaluate(el=>getComputedStyle(el).animationName),'nx-public-enter');
 await page.waitForTimeout(850);
 assert.equal(await page.locator('.stage-item').first().evaluate(el=>el.hasAttribute('data-story-enter')),false);
 await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0)});
 await page.locator('.stage-item').first().scrollIntoViewIfNeeded();
 await page.waitForTimeout(150);
 assert.equal(await page.locator('.stage-item').first().evaluate(el=>el.hasAttribute('data-story-enter')),false);
 await ctx.close();
 console.log('PASS once-only entrance and cleanup');
}finally{await browser.close();}
