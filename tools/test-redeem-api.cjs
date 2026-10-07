const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{TextEncoder}=require('node:util');
class FakeFormData{constructor(){this.values=new Map();}append(key,value){this.values.set(key,String(value));}}
const requests=[];
const fetch=async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({err_code:40014,msg:'invalid code'})};};
const context={window:{},TextEncoder,Int32Array,Math,Set,FormData:FakeFormData,AbortController,setTimeout,clearTimeout,fetch,Date,encodeURIComponent};
vm.runInNewContext(fs.readFileSync('apps/redeem/protocol.js','utf8'),context,{filename:'protocol.js'});
vm.runInNewContext(fs.readFileSync('apps/redeem/api.js','utf8'),context,{filename:'api.js'});
const api=context.window.WOS_REDEEM_API;
(async()=>{
 assert.equal(api._md5(''),'d41d8cd98f00b204e9800998ecf8427e');
 assert.equal(api._md5('abc'),'900150983cd24fb0d6963f7d28e17f72');
 assert.equal(api._md5('message digest'),'f96b697d7cb7938d525a2f31aaf161d0');
 const signed=api._signed({fid:'123',kid:'7',cdk:'DEMO',time:1});
 assert.equal(signed.sign,'c3604cc900a53292af76ac6ec617882c');
 const checked=await api.checkPlayer('123','7');assert.equal(checked.ok,true);
 assert.equal(requests[0].url,'https://des-giftcode-proxy.shunya3624716.workers.dev/');
 assert.equal(requests[0].options.method,'POST');
 for(const key of ['sign','fid','kid','cdk','time'])assert.ok(requests[0].options.body.values.has(key));
 assert.equal(requests[0].options.body.values.get('cdk'),'ZZCHECKONLY0');
 console.log('PASS redeem direct API: MD5, signed multipart request and response mapping');
})().catch(error=>{console.error(error);process.exitCode=1;});
