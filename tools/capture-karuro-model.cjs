// Capture the actual GLB from four directions for character-sheet authoring.
// Usage: node tools/capture-karuro-model.cjs model-id output-directory
'use strict';
const {chromium}=require(process.env.WOS_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const id=process.argv[2],out=path.resolve(process.argv[3]||'../../outputs/karuro-model-reference');
const base=process.env.WOS_PORTAL_TEST_URL||'http://127.0.0.1:8798/DeS-Portal/';
async function main(){
  if(!/^[a-z-]+$/.test(id||''))throw Error('Supply a model id.');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:800,height:1050}});
    await page.goto(base+'apps/karuro/index.html?preview=1');await page.waitForFunction(()=>window.witchViewer);
    for(let n=0;n<20&&await page.evaluate(()=>witchViewer.modelId)!==id;n++)await page.locator('#next-model').click();
    await page.waitForFunction(id=>witchViewer.ready&&witchViewer.modelId===id,id,{timeout:60000});
    await page.addStyleTag({content:'.atelier{padding:0;max-width:none}.exhibition{height:100vh;min-height:0;max-height:none}.stage{inset:0;background:#e4dfd8}.stage canvas{transform:none}.title-block,.guide,.stage-actions,.viewport-controls,.detail-focus,.model-navigation,.reference-link{display:none}.stage::after{display:none}'});
    const images=[];
    for(const [name,view] of [['front','front'],['left','side'],['back','back'],['right','left']]){
      await page.locator('[data-view=front]').evaluate((button,view)=>{button.dataset.view=view;button.click();button.dataset.view='front';},view);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const file=path.join(out,name+'.png');await page.screenshot({path:file});images.push([name,'data:image/png;base64,'+fs.readFileSync(file).toString('base64')]);
    }
    const sheet=await browser.newPage({viewport:{width:2000,height:1350}});
    await sheet.setContent('<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#18141c;color:#f4e9d8;font:22px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0}img{display:block;width:100%}figcaption{padding:14px 0}</style><h1>'+id+' — actual model reference</h1><main>'+images.map(([name,src])=>'<figure><img src="'+src+'"><figcaption>'+name+'</figcaption></figure>').join('')+'</main></html>');
    await sheet.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth));
    await sheet.screenshot({path:path.join(out,'model-reference.png'),fullPage:true});
    console.log('Captured '+id+' front/left/back/right to '+out);
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
