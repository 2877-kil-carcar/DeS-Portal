// Checks the integrated portal and embedded real GLB; remote services are blocked.
const {chromium}=require(process.env.WOS_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.WOS_PORTAL_TEST_URL||'http://127.0.0.1:8798/DeS-Portal/';
const out=process.env.WOS_KARURO_TEST_OUTPUT||path.resolve(__dirname,'../../witch-3d-studio/renders');
async function run(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 try{
  for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
   const errors=[],modelRequests=[];
   await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('request',request=>{if(request.url().endsWith('.glb'))modelRequests.push(request.url());});
   await page.goto(base+'?preview=1#notes');
   await page.locator('#view-notes').waitFor({state:'visible'});
   const order=await page.locator('#navigation [data-nav]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.nav,label:n.textContent})));
   const notes=order.findIndex(n=>n.id==='notes');assert.equal(order[notes+1].id,'karuro');assert.ok(order[notes+1].label.includes('禁断のかるろ'));
   assert.equal(modelRequests.length,0,'Other menus must not download the 63MB model');
   if(width<600)await page.locator('#menu-toggle').click();
   await page.locator('#navigation [data-nav=karuro]').click();
   await page.locator('#view-karuro').waitFor({state:'visible'});
   const iframe=await page.locator('#view-karuro iframe').elementHandle(),frame=await iframe.contentFrame();
   await frame.waitForFunction(()=>window.witchViewer?.ready,{},{timeout:60000});
   assert.ok(frame.url().startsWith(base+'apps/karuro/'));
   assert.equal(await frame.locator('#error').isHidden(),true);
   const stats=await frame.evaluate(()=>({triangles:witchViewer.triangles,materials:witchViewer.materials,style:witchViewer.renderStyle}));
   assert.equal(stats.triangles,1884666);assert.equal(stats.style,'original-meshy-pbr');
   assert.ok(stats.materials.every(m=>m.baseColor&&m.normal&&m.roughness&&m.metalness));
   assert.equal(await frame.locator('#wire').count(),0);assert.equal(await frame.locator('.masthead').count(),0);
   assert.equal(await frame.locator('.title-block .eyebrow').innerText(),'01 — halloween witch かるろ');
   await frame.locator('[data-view=back]').click();await frame.locator('[data-view=front]').click();
   await frame.locator('[data-focus=face]').click();await frame.locator('#reset').click();
   await frame.locator('#zoom-in').click();await frame.locator('#auto').click();
   await frame.locator('#reference').click();assert.equal(await frame.locator('#reference-dialog').evaluate(n=>n.open),true);await frame.locator('#reference-close').click();
   await frame.locator('#auto').click();
   await frame.locator('#reset').click();
   await page.screenshot({path:path.join(out,`portal-karuro-${label}.png`)});
   await page.evaluate(()=>location.hash='notes');
   await frame.waitForFunction(()=>!witchViewer.panelActive&&!witchViewer.rendering);
   await page.evaluate(()=>location.hash='karuro');
   await frame.waitForFunction(()=>witchViewer.panelActive&&witchViewer.rendering);
   assert.equal(await page.locator('#view-karuro iframe').count(),1);
   assert.equal(modelRequests.length,1,'Returning to the menu should reuse the loaded model');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.deepEqual(errors,[]);
   results.push({label,menuAfterNotes:true,lazyModel:true,oneGLBDownload:true,resumesAfterNavigation:true,...stats});
   console.log('PASS '+label+': menu placement, lazy GLB, PBR, controls, dialog, pause/resume, no duplicate frames');
   await context.close();
  }
  fs.writeFileSync(path.join(out,'portal-karuro-test-report.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1});
