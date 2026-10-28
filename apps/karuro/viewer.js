import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const $=id=>document.getElementById(id),host=$('stage');
const actions=[...document.querySelectorAll('.viewport-controls button,.stage-actions button,.detail-focus button')];
actions.forEach(button=>button.disabled=true);
const fail=message=>{$('loading').hidden=true;$('error').hidden=false;$('error-message').textContent=message;};
const dialog=$('reference-dialog');
$('reference').onclick=()=>dialog.showModal();$('reference-close').onclick=()=>dialog.close();
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});

let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}
catch(error){console.error(error);fail('WebGLを利用できません。ブラウザのハードウェアアクセラレーションを確認するか、別のブラウザをお試しください。');throw error;}
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
renderer.shadowMap.enabled=host.clientWidth>=700;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setClearColor(0,0);host.append(renderer.domElement);
renderer.domElement.setAttribute('aria-label','回転・拡大縮小できる立体キャラクター');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.01,100);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=true;controls.screenSpacePanning=true;
controls.maxPolarAngle=Math.PI*.90;controls.minPolarAngle=.08;
controls.autoRotateSpeed=1.0;controls.zoomSpeed=.85;controls.rotateSpeed=.65;
controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
// Preserve all imported Meshy PBR materials and embedded textures.
// The neutral studio environment supplies reflections without tinting the design.
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
const studioMaterials=new Set();
room.traverse(object=>{if(object.isLight)object.intensity*=.75;if(object.isMesh)for(const material of [].concat(object.material))if(material.isMeshBasicMaterial)studioMaterials.add(material);});
studioMaterials.forEach(material=>material.color.multiplyScalar(.75));
const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;
room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x53505a,.35));
const key=new THREE.DirectionalLight(0xffffff,1.5);key.position.set(-2.4,4,4);key.castShadow=true;
key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-1.5;key.shadow.camera.right=1.5;key.shadow.camera.top=2.7;key.shadow.camera.bottom=-.3;key.shadow.camera.near=.1;key.shadow.camera.far=12;key.shadow.normalBias=.015;key.shadow.bias=-.0001;scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,.55);fill.position.set(3,2,1);scene.add(fill);
const rim=new THREE.DirectionalLight(0xffffff,1);rim.position.set(1,2,-3);scene.add(rim);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:0x08030a,opacity:.26}));floor.rotation.x=-Math.PI/2;floor.position.y=-.003;floor.receiveShadow=true;scene.add(floor);
let model,center=new THREE.Vector3(0,1,0),distance=4.5,angle=0,auto=false,light=false;
let currentFocus='full';
const witchAreas={face:{target:[0,1.64,0],height:.48,width:.44},hat:{target:[.02,1.93,0],height:.57,width:.95},outfit:{target:[0,1.13,0],height:.73,width:.89},staff:{target:[.38,1.64,.056],height:.54,width:.38},waist:{target:[0,1.045,.08],height:.37,width:.55}};
const models=[
  {id:'witch',file:'meshy-witch.glb',name:'halloween witch かるろ',eyebrow:'01 — halloween witch かるろ',title:'Halloween<br><span class="title-line"><em>Witch</em><span class="character-name">かるろ</span></span>',reference:'reference.png',referenceDescription:'提供された魔女のキャラクターシートです。',areas:witchAreas,propLabel:'杖の束'},
  {id:'reporter',file:'meshy-reporter.glb',name:'かるろ',eyebrow:'02 — かるろ',title:'かるろ',reference:'reporter-character-sheet.png',referenceDescription:'全身3方向・細部・表情・360°ビューをまとめたキャラクターイラスト資料です。',areas:{face:{target:[0,1.82,0],height:.48,width:.45},outfit:{target:[0,1.15,0],height:.95,width:.75},staff:{target:[-.24,1.53,.10],height:.57,width:.42}},propLabel:'マイク'},
  {id:'penguin',file:'meshy-penguin.glb',name:'でんぴー',eyebrow:'03 — でんぴー',title:'でんぴー',reference:'penguin-character-sheet.png',referenceDescription:'全身3方向・細部・表情・360°ビューをまとめたペンギンのキャラクターシートです。',areas:{face:{target:[-.06,1.48,.10],height:.70,width:.80},outfit:{target:[-.04,.77,.12],height:.94,width:.84}},outfitLabel:'お腹'}
];
let currentIndex=0,detailAreas=models[0].areas,loadSequence=0,activeAbort=null;
const modelCache=new Map();
let frame=0,last=0,visible=true,panelActive=window.WOS_PANEL_ACTIVE!==false,disposed=false,ready=false,contextLost=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function setAuto(value){auto=value;controls.autoRotate=value;$('auto').setAttribute('aria-pressed',String(value));$('auto-label').textContent=value?'回転を停止':'自動回転';}
function setView(value,reset=true){
  setAuto(false);angle=({front:0,side:Math.PI/2,back:Math.PI,left:-Math.PI/2})[value]??0;
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===value)));
  if(reset)controls.target.copy(center);
  camera.position.copy(controls.target).add(new THREE.Vector3(Math.sin(angle)*distance,distance*.055,Math.cos(angle)*distance));
  controls.update();
}
function fit(){
  if(!model)return;
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());box.getCenter(center);
  const detail=detailAreas[currentFocus];
  if(detail){center.fromArray(detail.target);size.y=detail.height;size.x=detail.width;}
  const mobile=host.clientWidth<600;
  // Reserve space for the mobile title and the two-row bottom control bar.
  const available=mobile?(host.clientWidth<360?.46:.50):.74;
  const vertical=size.y/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*available);
  const horizontal=size.x/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*.85);
  distance=Math.max(vertical,horizontal)*1.04;
  controls.minDistance=size.y*.30;controls.maxDistance=distance*2.0;
  controls.target.copy(center);
  if(mobile)controls.target.y+=size.y*.070;
  setView('front',false);controls.saveState();
}
function resize(){
  const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio,w<600?1.5:2));renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  if(ready)fit();
}
const observer=new ResizeObserver(resize);observer.observe(host);resize();
function loop(time){
  frame=0;if(disposed||document.hidden||!visible||!panelActive||contextLost)return;
  const delta=last?Math.min((time-last)/1000,.05):1/60;last=time;
  controls.update(delta);renderer.render(scene,camera);frame=requestAnimationFrame(loop);
}
function resume(){last=0;if(!frame&&!disposed&&!document.hidden&&visible&&panelActive&&!contextLost)frame=requestAnimationFrame(loop);}
function pause(){cancelAnimationFrame(frame);frame=0;last=0;}
document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
window.addEventListener('wos:visibility',event=>{panelActive=event.detail.active;panelActive?resume():pause();});
const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visible?resume():pause();});visibility.observe(host);
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;pause();fail('描画接続が中断されました。「もう一度読み込む」で復帰できます。');});
renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;$('error').hidden=true;resume();});
controls.addEventListener('start',()=>{setAuto(false);document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));});
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
function focusDetail(id){currentFocus=detailAreas[id]?id:'full';document.querySelector('.exhibition').classList.toggle('detail-view',currentFocus!=='full');document.querySelectorAll('[data-focus]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.focus===currentFocus)));fit();}
document.querySelectorAll('[data-focus]').forEach(button=>button.onclick=()=>focusDetail(button.dataset.focus));
$('auto').onclick=()=>setAuto(!auto);$('reset').onclick=()=>{focusDetail('full');setAuto(false);};
function zoom(factor){const offset=camera.position.clone().sub(controls.target);const r=THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.setLength(r));controls.update();}
$('zoom-in').onclick=()=>zoom(.82);$('zoom-out').onclick=()=>zoom(1.22);
$('theme').onclick=()=>{light=!light;document.body.classList.toggle('light',light);$('theme').setAttribute('aria-pressed',String(light));};
reduced.addEventListener('change',()=>{if(reduced.matches)setAuto(false);});
host.addEventListener('keydown',event=>{if(!ready)return;if(['+','=','-','0','ArrowLeft','ArrowRight',' '].includes(event.key))event.preventDefault();if(event.key==='+'||event.key==='=')zoom(.85);if(event.key==='-')zoom(1.18);if(event.key==='0')fit();if(event.key===' ')setAuto(!auto);if(event.key==='ArrowLeft'||event.key==='ArrowRight'){const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),event.key==='ArrowLeft'?-.15:.15);camera.position.copy(controls.target).add(offset);controls.update();setAuto(false);}});
function disposeModel(object){
  const resources=new Set();
  object.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
  resources.forEach(resource=>resource.dispose());
}
function normalizeModel(object){
  const box=new THREE.Box3().setFromObject(object),height=box.getSize(new THREE.Vector3()).y;
  if(!Number.isFinite(height)||height<=0)throw Error('モデルの大きさを読み取れません。');
  object.scale.multiplyScalar(2.1/height);object.updateMatrixWorld(true);
  const scaled=new THREE.Box3().setFromObject(object),origin=scaled.getCenter(new THREE.Vector3());
  object.position.add(new THREE.Vector3(-origin.x,-scaled.min.y,-origin.z));
  object.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=false;}});
  return object;
}
function updateModelContent(entry){
  document.querySelector('.title-block .eyebrow').textContent=entry.eyebrow;
  $('title').innerHTML=entry.title;document.title=entry.name+' | 禁断のかるろ';
  host.setAttribute('aria-label',entry.name+'の3Dモデル。ドラッグで回転、ピンチで拡大縮小。');
  $('reference-image').src='./assets/'+entry.reference;$('reference-image').alt=entry.name+'のキャラクターシート';
  $('reference-description').textContent=entry.referenceDescription;$('reference-title').textContent=entry.name+' — キャラクターシート';
  detailAreas=entry.areas;
  document.querySelectorAll('[data-focus]').forEach(button=>{
    button.hidden=button.dataset.focus!=='full'&&!detailAreas[button.dataset.focus];
    if(button.dataset.focus==='staff'&&entry.propLabel)button.textContent=entry.propLabel;
    if(button.dataset.focus==='outfit')button.textContent=entry.outfitLabel||'衣装';
  });
  $('previous-model').setAttribute('aria-label','前のモデル：'+models[(currentIndex+models.length-1)%models.length].name);
  $('next-model').setAttribute('aria-label','次のモデル：'+models[(currentIndex+1)%models.length].name);
}
async function selectModel(index){
  if(disposed)return;
  const sequence=++loadSequence;activeAbort?.abort();activeAbort=null;
  currentIndex=(index+models.length)%models.length;const entry=models[currentIndex];
  ready=false;setAuto(false);pause();controls.enabled=false;
  if(model)scene.remove(model);model=null;
  if(!contextLost&&panelActive)renderer.render(scene,camera);
  actions.forEach(button=>button.disabled=true);dialog.close();updateModelContent(entry);
  $('error').hidden=true;$('loading').hidden=false;$('load-progress').value=0;$('loading-text').textContent=entry.name+'を読み込んでいます';
  const abort=new AbortController();activeAbort=abort;const timeout=setTimeout(()=>abort.abort(),45000);
  try{
    let object=modelCache.get(entry.id);
    if(!object){
      const response=await fetch('./assets/'+entry.file,{signal:abort.signal});
      if(!response.ok)throw Error('モデルファイルを取得できません（HTTP '+response.status+'）。');
      const total=Number(response.headers.get('content-length'));let data;
      if(response.body){const reader=response.body.getReader(),chunks=[];let bytes=0;
        while(true){const part=await reader.read();if(part.done)break;chunks.push(part.value);bytes+=part.value.length;if(total&&sequence===loadSequence)$('load-progress').value=bytes/total*90;}
        data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}data=data.buffer;
      }else data=await response.arrayBuffer();
      if(sequence!==loadSequence||disposed)return;
      clearTimeout(timeout);$('loading-text').textContent='質感と照明を仕上げています';
      const gltf=await new GLTFLoader().parseAsync(data,new URL('./assets/',location.href).href);
      if(sequence!==loadSequence||disposed){disposeModel(gltf.scene);return;}
      object=normalizeModel(gltf.scene);modelCache.set(entry.id,object);
    }
    if(sequence!==loadSequence||disposed)return;
    model=object;scene.add(model);ready=true;controls.enabled=true;focusDetail('full');
    $('load-progress').value=100;$('loading').hidden=true;actions.forEach(button=>button.disabled=false);
    $('model-announcement').textContent=entry.eyebrow+'、'+(currentIndex+1)+' / '+models.length;
    resume();
  }catch(error){
    if(sequence!==loadSequence||disposed)return;
    console.error(error);fail(error.name==='AbortError'?'読込がタイムアウトしました。再試行するか、矢印で別のモデルに切り替えてください。':String(error.message||'モデルの読込に失敗しました。'));
  }finally{clearTimeout(timeout);if(sequence===loadSequence)activeAbort=null;}
}
$('previous-model').onclick=()=>selectModel(currentIndex-1);$('next-model').onclick=()=>selectModel(currentIndex+1);
$('retry').onclick=()=>selectModel(currentIndex);
// Read-only diagnostics for checking the active model and its original materials.
window.witchViewer={get ready(){return ready;},get modelFile(){return models[currentIndex].file;},get modelId(){return models[currentIndex].id;},get modelIndex(){return currentIndex;},get cachedModels(){return [...modelCache.keys()];},renderStyle:'original-meshy-pbr',get panelActive(){return panelActive;},get rendering(){return frame!==0;},get materials(){const result=[];model?.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))result.push({type:m.type,baseColor:!!m.map,normal:!!m.normalMap,roughness:!!m.roughnessMap,metalness:!!m.metalnessMap});});return result;},get focus(){return currentFocus;},get triangles(){let n=0;model?.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return n;},get meshes(){let n=0;model?.traverse(o=>{if(o.isMesh)n++;});return n;},get auto(){return auto;},get camera(){return camera.position.toArray();},get target(){return controls.target.toArray();},get bounds(){return model?new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray():[0,0,0];}};
selectModel(0);
addEventListener('pagehide',()=>{disposed=true;++loadSequence;activeAbort?.abort();pause();observer.disconnect();visibility.disconnect();controls.dispose();for(const object of modelCache.values()){scene.remove(object);disposeModel(object);}modelCache.clear();floor.geometry.dispose();floor.material.dispose();environment.dispose();renderer.dispose();});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
