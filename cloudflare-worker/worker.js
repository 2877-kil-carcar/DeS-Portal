const UPSTREAM='https://wos-giftcode-api.centurygame.com/api/gift_code';
const OFFICIAL='https://wos-giftcode.centurygame.com';
const ALLOWED_ORIGINS=new Set(['https://2877-kil-carcar.github.io','http://127.0.0.1:8766','http://127.0.0.1:8791','http://localhost:8766','http://localhost:8791']);
function cors(origin){return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'};}
function json(origin,status,value){return new Response(JSON.stringify(value),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
function valid(value,pattern,max){return typeof value==='string'&&value.length>0&&value.length<=max&&pattern.test(value);}
export default {async fetch(request){
  const origin=request.headers.get('Origin')||'';
  if(!ALLOWED_ORIGINS.has(origin))return new Response('Forbidden',{status:403});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(request.method==='GET')return json(origin,200,{ok:true,service:'des-giftcode-proxy'});
  if(request.method!=='POST')return json(origin,405,{ok:false,msg:'Method not allowed'});
  let input;try{input=await request.formData();}catch{return json(origin,400,{ok:false,msg:'Invalid form data'});}
  const values={sign:String(input.get('sign')||''),fid:String(input.get('fid')||''),kid:String(input.get('kid')||''),cdk:String(input.get('cdk')||''),time:String(input.get('time')||'')};
  if(!valid(values.sign,/^[a-f0-9]{32}$/i,32)||!valid(values.fid,/^[0-9]+$/,20)||!valid(values.kid,/^[0-9]+$/,10)||!valid(values.cdk,/^[ -~]+$/,256)||!valid(values.time,/^[0-9]+$/,13))return json(origin,400,{ok:false,msg:'Invalid request'});
  const body=new FormData();for(const [key,value]of Object.entries(values))body.append(key,value);
  try{const upstream=await fetch(UPSTREAM,{method:'POST',headers:{'Origin':OFFICIAL,'Referer':OFFICIAL+'/','Accept':'application/json','User-Agent':'Mozilla/5.0'},body});const response=new Response(upstream.body,{status:upstream.status,headers:upstream.headers});for(const [key,value]of Object.entries(cors(origin)))response.headers.set(key,value);response.headers.set('Cache-Control','no-store');return response;}
  catch{return json(origin,502,{ok:false,msg:'Upstream unavailable'});}
}};
