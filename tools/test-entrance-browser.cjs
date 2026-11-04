// Real Chromium; local static source only. All external calls and gift operations are blocked.
'use strict';
const {chromium}=require(process.env.WOS_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.WOS_PORTAL_TEST_URL||'http://127.0.0.1:8798/DeS-Portal/';
const output=process.env.WOS_ENTRANCE_QA_DIR||path.resolve(__dirname,'../../outputs/entrance-review');
async function main(){
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
  const results=[];
  async function context(options={}){
    const ctx=await browser.newContext(options);
    await ctx.route('**/*',route=>{
      const url=route.request().url();
      if(!url.startsWith(base))return route.abort();
      if(url.includes('/apps/redeem/index.html'))return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><h1>ギフトコード</h1>'});
      return route.continue();
    });return ctx;
  }
  async function open(ctx){
    const page=await ctx.newPage();await page.goto(base+'?preview=1&entrance=1');
    await page.locator('#portal-entrance iframe').waitFor();
    const frame=await(await page.locator('#portal-entrance iframe').elementHandle()).contentFrame();
    return {page,frame};
  }
  async function enter(page,frame){
    const history=await page.evaluate(()=>window.history.length);
    await page.evaluate(()=>{window.entranceQA=document.querySelector('#portal-entrance iframe').contentWindow.DES_ENTRANCE_VIEW||null;});
    await frame.locator('#enter-portal').click();
    await page.waitForFunction(()=>!window.DES_PORTAL_ENTRANCE.active&&location.hash==='#redeem');
    assert.equal(await page.locator('#portal-entrance iframe').count(),0);
    assert.equal(await page.evaluate(()=>window.history.length),history,'Entry must not add a return-to-entrance history step');
    assert.equal(await page.locator('#view-redeem iframe').count(),1);
    assert.equal(await page.locator('.workspace').evaluate(n=>n.inert),false);
    if(await page.evaluate(()=>Boolean(window.entranceQA))){
      assert.equal(await page.evaluate(()=>entranceQA.phase),'disposed');
      assert.equal(await page.evaluate(()=>entranceQA.rendering),false);
    }
  }
  try{
    for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844],['small-mobile',320,568],['landscape',844,390]]){
      const ctx=await context({viewport:{width,height},isMobile:width<700,hasTouch:width<700});
      const {page,frame}=await open(ctx),errors=[];page.on('pageerror',error=>errors.push(error.message));
      assert.equal(await page.locator('.module-frame').count(),0,'No portal tool should start before entry');
      assert.equal(await page.locator('.workspace').evaluate(n=>n.inert),true);
      await page.evaluate(()=>window.postMessage({type:'des:portal-enter'},location.origin));
      assert.equal(await page.evaluate(()=>DES_PORTAL_ENTRANCE.active),true,'Only the entrance frame may open the portal');
      await frame.waitForFunction(()=>window.DES_ENTRANCE_VIEW?.ready&&parseFloat(getComputedStyle(document.getElementById('model-stage')).opacity)>.99,{},{timeout:60000});
      assert.equal(await frame.evaluate(()=>DES_ENTRANCE_VIEW.triangles),1546746);
      const angle=await frame.evaluate(()=>DES_ENTRANCE_VIEW.angle);
      await frame.waitForFunction(value=>Math.abs(DES_ENTRANCE_VIEW.angle-value)>.035,angle);
      const button=await frame.locator('#enter-portal').boundingBox();assert.ok(button.y>=0&&button.y+button.height<=height+1,label+' entry button must fit');
      assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal((await frame.locator('h1').innerText()).replace(/\s/g,''),'ようこそDeSポータルへ');
      await page.screenshot({path:path.join(output,label+'.png')});
      await enter(page,frame);
      await page.reload();assert.equal(await page.locator('#portal-entrance iframe').count(),0,'Refresh after entry must stay inside the portal');
      assert.deepEqual(errors,[]);results.push({label,rotation:true,entry:true,noBackgroundTools:true,noOverflow:true});
      console.log('PASS entrance '+label+': real model rotation, responsive title/button, entry, disposal, refresh');await ctx.close();
    }
    {
      const ctx=await context({viewport:{width:390,height:844}});let release;
      await ctx.route('**/frozen-lord.glb*',async route=>{await new Promise(resolve=>release=resolve);try{await route.abort();}catch{}});
      const {page,frame}=await open(ctx);await frame.locator('#enter-portal').waitFor();
      await enter(page,frame);release?.();await ctx.close();
      results.push({enterBeforeModelLoaded:true});console.log('PASS entrance: enter immediately during model download');
    }
    for(const failure of ['model404','noWebGL']){
      const ctx=await context({viewport:{width:390,height:844}});
      if(failure==='model404')await ctx.route('**/frozen-lord.glb*',route=>route.fulfill({status:404,body:'missing'}));
      else await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};});
      const {page,frame}=await open(ctx);
      await frame.locator('#load-error').waitFor({state:'visible'});assert.equal(await frame.locator('#fallback-image').isVisible(),true);
      await enter(page,frame);await ctx.close();results.push({failure,entryStillWorks:true});console.log('PASS entrance fallback: '+failure);
    }
    {
      const ctx=await context({viewport:{width:390,height:844},reducedMotion:'reduce'}),{page,frame}=await open(ctx);
      await frame.waitForFunction(()=>window.DES_ENTRANCE_VIEW?.ready,{},{timeout:60000});
      const angle=await frame.evaluate(()=>DES_ENTRANCE_VIEW.angle);await page.waitForTimeout(250);
      assert.equal(await frame.evaluate(()=>DES_ENTRANCE_VIEW.angle),angle);await enter(page,frame);await ctx.close();
      results.push({reducedMotion:true});console.log('PASS entrance: reduced motion disables automatic rotation');
    }
    {
      const ctx=await context(),page=await ctx.newPage();
      await ctx.route('**/frozen-lord.glb*',route=>route.fulfill({status:404,body:'not loaded for route test'}));
      await page.goto(base+'?v=qa');await page.locator('#portal-entrance iframe').waitFor();
      assert.equal(await page.evaluate(()=>DES_PORTAL_ENTRANCE.active),true,'The normal public URL must show the entrance');
      assert.equal(await page.locator('.module-frame').count(),0);
      await page.evaluate(()=>location.hash='notes');
      await page.locator('#view-notes').waitFor({state:'visible'});assert.equal(await page.locator('#portal-entrance iframe').count(),0);
      await ctx.close();results.push({normalRootAndHashNavigation:true});console.log('PASS entrance: normal public root and navigation during entrance');
    }
    {
      const ctx=await context(),page=await ctx.newPage();let models=0;page.on('request',request=>{if(request.url().includes('frozen-lord.glb'))models++;});
      for(const url of ['?preview=1#notes','?preview=1','?preview=1#karuro','standalone.html?entrance=1']){
        await page.goto(base+url);assert.equal(await page.locator('#portal-entrance iframe').count(),0,url);
      }
      assert.equal(models,0);await ctx.close();results.push({deepLinksPreviewStandalone:true});console.log('PASS entrance: deep links, preview and standalone bypass the entrance');
    }
    fs.writeFileSync(path.join(output,'test-report.json'),JSON.stringify(results,null,2));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
