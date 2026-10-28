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
const detailAreas={face:{target:[0,1.64,0],height:.48,width:.44},hat:{target:[.02,1.93,0],height:.57,width:.95},outfit:{target:[0,1.13,0],height:.73,width:.89},staff:{target:[.38,1.64,.056],height:.54,width:.38},waist:{target:[0,1.045,.08],height:.37,width:.55}};
let frame=0,last=0,visible=true,panelActive=window.WOS_PANEL_ACTIVE!==false,disposed=false,ready=false,contextLost=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function setAuto(value){auto=value;controls.autoRotate=value;$('auto').setAttribute('aria-pressed',String(value));$('auto-label').textContent=value?'回転を停止':'自動回転';}
function setView(value,reset=true){
  setAuto(false);angle=({front:0,side:Math.PI/2,back:Math.PI})[value]??0;
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
const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),45000);
try{
  $('loading-text').textContent='立体モデルを読み込んでいます';
  const modelFile='meshy-witch.glb';
  const response=await fetch('./assets/'+modelFile,{signal:abort.signal});
  if(!response.ok)throw Error('モデルファイルを取得できません（HTTP '+response.status+'）。');
  const total=Number(response.headers.get('content-length'));
  let data;
  if(response.body){const reader=response.body.getReader(),chunks=[];let bytes=0;
    while(true){const part=await reader.read();if(part.done)break;chunks.push(part.value);bytes+=part.value.length;if(total)$('load-progress').value=bytes/total*90;}
    data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    data=data.buffer;
  }else data=await response.arrayBuffer();
  clearTimeout(timeout);$('loading-text').textContent='質感と照明を仕上げています';
  const gltf=await new GLTFLoader().parseAsync(data,new URL('./assets/',location.href).href);model=gltf.scene;
  // Display-only normalization: retain the source GLB byte-for-byte.
  const originalBox=new THREE.Box3().setFromObject(model),originalSize=originalBox.getSize(new THREE.Vector3());
  if(!Number.isFinite(originalSize.y)||originalSize.y<=0)throw Error('モデルの大きさを読み取れません。');
  const scale=2.1/originalSize.y;model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);
  const scaledBox=new THREE.Box3().setFromObject(model),origin=scaledBox.getCenter(new THREE.Vector3());
  model.position.add(new THREE.Vector3(-origin.x,-scaledBox.min.y,-origin.z));
  model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=false;}});scene.add(model);
  ready=true;fit();$('load-progress').value=100;$('loading').hidden=true;actions.forEach(button=>button.disabled=false);
  let triangles=0,meshes=0;model.traverse(object=>{if(object.isMesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}});
  // Read-only diagnostics used by local automated verification.
  window.witchViewer={get ready(){return ready;},modelFile,renderStyle:'original-meshy-pbr',get panelActive(){return panelActive;},get rendering(){return frame!==0;},get materials(){const result=[];model.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))result.push({type:m.type,baseColor:!!m.map,normal:!!m.normalMap,roughness:!!m.roughnessMap,metalness:!!m.metalnessMap});});return result;},get focus(){return currentFocus;},get triangles(){return triangles;},get meshes(){return meshes;},get auto(){return auto;},get camera(){return camera.position.toArray();},get target(){return controls.target.toArray();},get bounds(){return new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray();}};
  resume();
}catch(error){console.error(error);clearTimeout(timeout);fail(error.name==='AbortError'?'読込がタイムアウトしました。接続とモデルファイルを確認して再試行してください。':String(error.message||'モデルの読込に失敗しました。'));}
addEventListener('pagehide',()=>{disposed=true;pause();observer.disconnect();visibility.disconnect();controls.dispose();scene.traverse(object=>{object.geometry?.dispose();if(object.material)for(const mat of [].concat(object.material)){for(const value of Object.values(mat))if(value?.isTexture)value.dispose();mat.dispose();}});environment.dispose();renderer.dispose();});
addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
