(function(root){
 'use strict';
 const sizes={player:2,food:2,trap:3,base:3,mine:3,flag:1};
 const overlap=(a,b)=>a.x<b.x+b.size&&b.x<a.x+a.size&&a.y<b.y+b.size&&b.y<a.y+a.size;
 function planPlacement(objects,type,memberId,pos,cols=48,rows=27){
  if(!(type in sizes)||!pos||!Number.isInteger(pos.x)||!Number.isInteger(pos.y))throw Error('配置情報が不正です。');
  if(type==='player'&&!memberId)throw Error('同盟員を選択してください。');
  const size=sizes[type],x=pos.x,y=pos.y-size+1;
  if(x<1||y<1||x+size>cols||y+size>rows)throw Error('マップの外には配置できません。元の配置は維持されます。');
  const existing=type==='player'?objects.find(o=>o.type===type&&o.memberId===memberId):objects.find(o=>o.type===type&&o.x===x&&o.y===y);
  if(type==='base'&&objects.some(o=>o.type==='base'&&o!==existing))throw Error('本部は1つまでです。');
  if(type==='trap'&&objects.filter(o=>o.type==='trap'&&o!==existing).length>=2)throw Error('熊罠は2つまでです。');
  const next={type,memberId:memberId??null,x,y,size};
  if(objects.some(o=>o!==existing&&overlap(o,next)))throw Error('ほかの配置と重なります。元の配置は維持されます。');
  return {previous:existing||null,next};
 }
 const api={sizes,overlap,planPlacement};root.WOS_PLACEMENT=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
