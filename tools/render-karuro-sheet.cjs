// Renders the actual approved GLB from six views, then lays out a reference sheet.
// No AI redraw, material changes, or alterations to the supplied model.
const {chromium}=require(process.env.WOS_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base=process.env.WOS_PORTAL_TEST_URL||'http://127.0.0.1:8798/DeS-Portal/';
const work=process.env.WOS_KARURO_SHEET_WORK||path.resolve(root,'../witch-3d-studio/renders/reporter-sheet');
async function run(){
 fs.mkdirSync(work,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:800,height:1100}});
  await page.goto(base+'apps/karuro/index.html?preview=1');
  await page.waitForFunction(()=>window.witchViewer);
  await page.locator('#next-model').click();
  await page.waitForFunction(()=>window.witchViewer?.ready&&witchViewer.modelId==='reporter',{},{timeout:60000});
  await page.addStyleTag({content:'.atelier{padding:0;max-width:none}.exhibition{height:100vh;min-height:0;max-height:none}.stage{inset:0;background:#e4dfd8}.stage canvas{transform:none}.title-block,.guide,.stage-actions,.viewport-controls,.detail-focus,.model-navigation,.reference-link{display:none}.stage::after{display:none}'});
  const files={};
  for(const [name,view,focus] of [['front','front','full'],['side-a','side','full'],['back','back','full'],['side-b','left','full'],['face','front','face'],['microphone','front','staff']]){
   await page.setViewportSize({width:800,height:focus==='full'?1100:800});
   await page.locator(`[data-focus=${focus}]`).evaluate(n=>n.click());
   await page.locator('[data-view=front]').evaluate((n,view)=>{n.dataset.view=view;n.click();n.dataset.view='front';},view);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const file=path.join(work,name+'.png');await page.screenshot({path:file});files[name]='data:image/png;base64,'+fs.readFileSync(file).toString('base64');
  }
  const sheet=await browser.newPage({viewport:{width:2000,height:1480},deviceScaleFactor:1});
  const views=[['front','正面'],['side-a','左側面'],['back','背面'],['side-b','右側面']];
  await sheet.setContent(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>かるろ キャラクターシート</title><style>*{box-sizing:border-box}body{margin:0;padding:48px 60px;background:#18141c;color:#f0e8db;font-family:system-ui,sans-serif}header{height:134px;border-bottom:1px solid #685444;margin-bottom:24px;display:flex;align-items:baseline;justify-content:space-between}small{font-size:18px;letter-spacing:.2em;color:#c29c77}h1{font-size:64px;font-weight:500;margin:16px 0}header p{font-size:22px;color:#b8a8ad}.views{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}figure{margin:0;background:#28212d;border:1px solid #514451;border-radius:12px;overflow:hidden}figcaption{padding:16px 20px;font-size:23px;color:#e4c7a7}.views img{width:100%;display:block}.details{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:24px}.detail{display:flex;height:420px}.detail img{width:55%;height:100%;object-fit:cover;object-position:center 46%;background:#e4dfd8}.detail div{padding:26px;display:flex;flex-direction:column;justify-content:center}.detail h2{font-size:30px;font-weight:500}.detail p{font-size:21px;line-height:1.8;color:#c2b3bb}footer{margin-top:24px;font-size:18px;color:#9f8c98}</style><header><div><small>02 — CHARACTER SHEET</small><h1>かるろ</h1></div><p>スーツ姿とマイク</p></header><section class="views">${views.map(([id,label])=>`<figure><figcaption>${label}</figcaption><img src="${files[id]}" alt="${label}"></figure>`).join('')}</section><section class="details"><figure class="detail"><img src="${files.face}" alt="顔の詳細"><div><small>FACE</small><h2>顔・髪型</h2><p>大きな楕円の目<br>短い黒髪<br>落ち着いた表情</p></div></figure><figure class="detail"><img src="${files.microphone}" alt="マイクの詳細"><div><small>DETAIL</small><h2>マイク・スーツ</h2><p>黒いハンドマイク<br>ダークスーツ<br>青緑のネクタイ</p></div></figure></section><footer>完成した3Dモデルを同じ照明で描画しています。</footer></html>`);
  await sheet.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
  const target=path.join(root,'apps/karuro/assets/reporter-sheet.png');await sheet.screenshot({path:target,fullPage:true});
  fs.copyFileSync(target,path.join(work,'reporter-sheet.png'));console.log('Rendered '+target);
 }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1});
