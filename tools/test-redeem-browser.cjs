// Real mobile browser, local source only. No Discord/Firebase/gift-code requests.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WOS_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const mock=`
window.qa={badges:[],calls:[],state:{kingdom:'2856',players:[{fid:'123',name:'成功した人'},{fid:'456',name:'条件未達の人'},{fid:'789',name:'混雑した人'},{fid:'999',name:'あとから追加した人'}],history:{}},
current:{code:'MOBILE123',status:'failed',summary:{total:3,success:1,failed:2,unknown:0},targets:[{fid:'123',name:'成功した人',status:'done',msg:'交換成功'},{fid:'456',name:'条件未達の人',status:'failed',msg:'交換条件を満たしていません',result:{err_code:40017}},{fid:'789',name:'混雑した人',status:'failed',msg:'サーバービジー'}]}};
const nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>ms===8000?(qa.poll=fn,-1):nativeTimeout(fn,ms,...args);
window.WOS_REDEEM_CLOUD={connect:async(_old,onState)=>onState(qa.state)};
window.WOS_REDEEM_API={redeem:async()=>{throw Error('A browser must not directly exchange a gift')},checkPlayer:async()=>({ok:true})};
window.WOS_REDEEM_JOBS={available:async()=>true,list:async()=>({jobs:[qa.current]}),get:async()=>({job:qa.current}),start:async(code,retry,ack)=>{
qa.calls.push({code,retry,ack});qa.current={...qa.current,status:'pending',targets:[...qa.current.targets,{fid:'999',name:'あとから追加した人',status:'pending'}]};return {job:qa.current,added:1,duplicate:true};}};
`;
async function main(){
  const server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(target)]||'text/plain');
    response.end(fs.readFileSync(target));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;const errors=[];
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const width of [320,390,960]){
      const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600});
      await context.addInitScript({content:mock});
      await context.route('**/*',route=>{
        const url=route.request().url();
        if(url.startsWith('https://www.gstatic.com/firebasejs/')||/\/apps\/redeem\/(?:api|cloud|jobs)\.js/.test(url))return route.fulfill({contentType:'text/javascript',body:'/* mocked external adapter */'});
        if(url.startsWith(base+'/'))return route.continue();
        errors.push('Unexpected external request: '+url);return route.abort();
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
      await page.goto(base+'/apps/redeem/index.html');
      await page.locator('#job-summary-counts').filter({hasText:'失敗1／未確認0／条件未達1'}).waitFor();
      assert.ok((await page.locator('#job-failures').innerText()).includes('混雑した人'));
      assert.ok(!(await page.locator('#job-failures').innerText()).includes('条件未達の人'));
      assert.ok((await page.locator('#job-conditions').innerText()).includes('条件未達の人'));
      assert.equal(await page.locator('#resumeBtn').innerText(),'失敗した1人だけ再実行');
      await page.locator('#startBtn').click();await page.waitForFunction(()=>qa.calls.length===1);
      assert.deepEqual(await page.evaluate(()=>qa.calls[0]),{code:'MOBILE123',retry:false,ack:false});
      await page.evaluate(async()=>{qa.current.status='failed';qa.current.targets[3].status='done';qa.current.targets[3].msg='交換成功';await qa.poll();});
      assert.ok((await page.locator('#job-summary-counts').innerText()).includes('成功2／失敗1／未確認0／条件未達1'));
      await page.evaluate(async()=>{qa.current.status='completed';qa.current.targets[2].status='done';await qa.poll();});
      assert.equal(await page.locator('#resumeBtn').isHidden(),true);
      assert.ok((await page.locator('#job-summary-counts').innerText()).includes('成功3／失敗0／未確認0／条件未達1'));
      assert.equal(await page.locator('#job-summary').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(245, 248, 250)');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(process.env.WOS_REDEEM_QA_DIR){fs.mkdirSync(process.env.WOS_REDEEM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WOS_REDEEM_QA_DIR,`redeem-${width}.png`),fullPage:true});}
      console.log(`PASS redeem browser ${width}px: late-user manual submission, separate conditions, accurate failures, neutral completion, no horizontal overflow`);
      await context.close();
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
