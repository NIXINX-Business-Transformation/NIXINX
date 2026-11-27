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
   await page.locator('.public-story[data-story-mode="scroll"]').waitFor();
   const initial=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').offsetHeight,nav:document.querySelector('.site-header').offsetHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,head:document.querySelector('h1').textContent}));
   assert.equal(await page.locator('.site-header .nav-login').count(),1);
   await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,220)});
   await page.waitForFunction(()=>Number(document.querySelector('.public-story').style.getPropertyValue('--nx-hero-progress'))>0);
   const facade=await page.locator('.hero-facade').evaluate((el,small)=>getComputedStyle(el,small?'::after':null).scale,width<=750);
   assert.ok(parseFloat(facade)<1&&parseFloat(facade)>=.90,'visible facade recession '+facade);
   const stages=page.locator('.stage-item').first();
   const position=async fraction=>page.evaluate(({fraction})=>{const el=document.querySelector('.stage-item');const y=parseFloat(el.style.getPropertyValue('--nx-story-y'))||0;window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-y-innerHeight*fraction)},{fraction});
   const state=()=>stages.evaluate(el=>({y:parseFloat(el.style.getPropertyValue('--nx-story-y')),top:el.getBoundingClientRect().top/innerHeight}));
   await position(.72);
   await page.waitForFunction(()=>{const e=document.querySelector('.stage-item'),y=parseFloat(e.style.getPropertyValue('--nx-story-y'));return y>20&&e.getBoundingClientRect().top/innerHeight<.9});
   const first=await state();
   await position(.50);
   await page.waitForFunction(previous=>{const e=document.querySelector('.stage-item'),y=parseFloat(e.style.getPropertyValue('--nx-story-y'));return y>8&&y<previous-5},first.y);
   const middle=await state();
   assert.ok(first.top<.9&&middle.top<.7&&middle.y>8,'motion persists inside viewport');
   await position(.15);
   await page.waitForFunction(()=>parseFloat(document.querySelector('.stage-item').style.getPropertyValue('--nx-story-y'))===0);
   await position(.72);
   await page.waitForFunction(()=>parseFloat(document.querySelector('.stage-item').style.getPropertyValue('--nx-story-y'))>20);
   const entry=first.y;
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.public-story[data-story-mode="off"]').waitFor();
   assert.equal(await stages.evaluate(el=>el.style.getPropertyValue('--nx-story-y')),'');
   await page.evaluate(()=>window.scrollTo(0,0));
   const end=await page.evaluate(()=>({hero:document.querySelector('.executive-hero').offsetHeight,nav:document.querySelector('.site-header').offsetHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,head:document.querySelector('h1').textContent}));
   assert.equal(initial.hero,end.hero);assert.equal(initial.nav,end.nav);assert.equal(initial.head,end.head);
   assert.ok(initial.overflow<=1,'horizontal overflow '+locale+' '+width+': '+initial.overflow);
   assert.ok(end.overflow<=1,'horizontal overflow reduced motion');
   await page.emulateMedia({reducedMotion:'no-preference'});
   console.log('PASS',engine.name(),locale,width,height,'motion',entry);
  }
  await ctx.close();
 }
 }finally{await browser.close();}
}
