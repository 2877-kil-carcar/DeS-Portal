import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const $=id=>document.getElementById(id),stage=$('model-stage'),snow=$('snow'),context=snow.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const abort=new AbortController();
let renderer,controls,environment,model,camera,scene,raf=0,last=0,disposed=false,ready=false,phase='loading',renderFrames=0;
let flakes=[],width=innerWidth,height=innerHeight;
let boxSize=new THREE.Vector3(),center=new THREE.Vector3();
const clockStart=performance.now();
window.DES_ENTRANCE_VIEW={get ready(){return ready;},get phase(){return phase;},get rendering(){return raf!==0;},get frames(){return renderFrames;},get angle(){return controls?Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z):0;},get triangles(){let count=0;model?.traverse(n=>{if(n.isMesh)count+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;});return count;}};

function disposeObject(object){
  const resources=new Set();object?.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
  resources.forEach(resource=>resource.dispose());
}
function pause(){cancelAnimationFrame(raf);raf=0;last=0;}
function dispose(){
  if(disposed)return;disposed=true;ready=false;phase='disposed';abort.abort();pause();
  observer.disconnect();controls?.dispose();disposeObject(model);environment?.dispose();renderer?.dispose();renderer?.forceContextLoss();
  if(context)context.clearRect(0,0,width,height);
}
function resume(){if(!raf&&!disposed&&!document.hidden)raf=requestAnimationFrame(tick);}
function newFlake(){const depth=Math.random();return {x:Math.random()*width*1.6-width*.25,y:Math.random()*height,depth,size:.4+depth*1.8,speed:100+depth*230,length:1+depth*10,opacity:.10+depth*.43};}
function resize(){
  width=innerWidth;height=innerHeight;
  const ratio=Math.min(devicePixelRatio||1,1.5);snow.width=Math.round(width*ratio);snow.height=Math.round(height*ratio);context?.setTransform(ratio,0,0,ratio,0,0);
  flakes=Array.from({length:reduced.matches?75:width<700?170:340},newFlake);
  if(renderer){
    const w=stage.clientWidth,h=stage.clientHeight;if(w&&h){
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,w<700?1.35:1.75));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
      if(ready){
        const vertical=boxSize.y/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.86);
        const horizontal=boxSize.x/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*.94);
        const distance=Math.max(vertical,horizontal)*1.02,angle=controls.getAzimuthalAngle();
        controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(Math.sin(angle)*distance,distance*.025,Math.cos(angle)*distance));controls.update();
      }
    }
  }
  resume();
}
function drawSnow(delta){
  if(!context)return;context.clearRect(0,0,width,height);
  context.lineCap='round';
  for(const flake of flakes){
    if(!reduced.matches){flake.x-=delta*flake.speed*(1.1+flake.depth);flake.y+=delta*flake.speed*.48;if(flake.x< -30||flake.y>height+30){flake.x=width+Math.random()*width*.30;flake.y=Math.random()*height-height*.35;}}
    context.strokeStyle=`rgba(235,247,255,${flake.opacity})`;context.lineWidth=flake.size;context.beginPath();context.moveTo(flake.x,flake.y);context.lineTo(flake.x-flake.length,flake.y+flake.length*.42);context.stroke();
  }
}
function tick(now){
  raf=0;if(disposed||document.hidden)return;
  const delta=last?Math.min((now-last)/1000,.05):1/60;last=now;
  drawSnow(delta);
  if(renderer&&ready){controls.update(delta);renderer.render(scene,camera);renderFrames++;}
  if(!reduced.matches)raf=requestAnimationFrame(tick);
}
function fallback(error){
  if(disposed)return;ready=false;phase='error';stage.hidden=true;console.error('Entrance model:',error);
  $('loading').hidden=true;$('load-error').hidden=false;
  $('fallback-image').src='./assets/frozen-reference.jpg';$('fallback-image').hidden=false;
}
async function loadModel(){
  const timeout=setTimeout(()=>abort.abort(),60000);
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.setClearColor(0,0);
    renderer.domElement.setAttribute('aria-label','回転する雪山の3Dキャラクター');stage.append(renderer.domElement);
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(33,1,.01,100);
    controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableZoom=false;controls.enableDamping=!reduced.matches;controls.dampingFactor=.065;
    controls.autoRotate=!reduced.matches;controls.autoRotateSpeed=1.45;controls.rotateSpeed=.6;controls.minPolarAngle=Math.PI*.25;controls.maxPolarAngle=Math.PI*.69;
    controls.addEventListener('change',()=>{if(reduced.matches)resume();});
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),materials=new Set();
    room.traverse(n=>{if(n.isLight)n.intensity*=.68;if(n.isMesh)for(const m of [].concat(n.material))if(m.isMeshBasicMaterial)materials.add(m);});
    materials.forEach(m=>m.color.multiplyScalar(.68));environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xd9efff,0x425b74,.75));
    const key=new THREE.DirectionalLight(0xf5faff,2.15);key.position.set(-3,5,5);scene.add(key);
    const fill=new THREE.DirectionalLight(0x9fc9f3,.65);fill.position.set(4,2,2);scene.add(fill);
    const rim=new THREE.DirectionalLight(0xe0f5ff,2.2);rim.position.set(0,4,-4);scene.add(rim);
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();abort.abort();fallback(Error('WebGL context lost'));});
    resize();
    const response=await fetch('./assets/frozen-lord.glb?v=3.82',{signal:abort.signal});if(!response.ok)throw Error('Model HTTP '+response.status);
    const total=Number(response.headers.get('content-length'));let data;
    if(response.body){const reader=response.body.getReader(),chunks=[];let received=0;
      while(true){const part=await reader.read();if(part.done)break;received+=part.value.length;chunks.push(part.value);if(total){const percent=Math.min(90,received/total*90);$('loading-progress').value=percent;$('loading-label').textContent='雪山へ… '+Math.round(percent)+'%';}}
      const buffer=new Uint8Array(received);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}data=buffer.buffer;
    }else data=await response.arrayBuffer();
    if(disposed)return;
    clearTimeout(timeout);$('loading-label').textContent='もうまもなく…';
    const result=await new GLTFLoader().parseAsync(data,new URL('./assets/',location.href).href);
    if(disposed||phase==='error'){disposeObject(result.scene);return;}
    model=result.scene;
    const original=new THREE.Box3().setFromObject(model),originalHeight=original.getSize(new THREE.Vector3()).y;
    if(!Number.isFinite(originalHeight)||originalHeight<=0)throw Error('Invalid model bounds');
    model.scale.multiplyScalar(2.7/originalHeight);model.updateMatrixWorld(true);
    const scaled=new THREE.Box3().setFromObject(model),origin=scaled.getCenter(new THREE.Vector3());model.position.add(new THREE.Vector3(-origin.x,-scaled.min.y,-origin.z));
    const box=new THREE.Box3().setFromObject(model);box.getSize(boxSize);box.getCenter(center);scene.add(model);
    ready=true;phase='ready';resize();$('loading').hidden=true;stage.classList.add('ready');resume();
    stage.dataset.loadedMs=String(Math.round(performance.now()-clockStart));
  }catch(error){fallback(error);}finally{clearTimeout(timeout);}
}
$('enter-portal').addEventListener('click',event=>{
  if(parent===window)return;
  event.preventDefault();dispose();parent.postMessage({type:'des:portal-enter'},location.origin);
});
document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
reduced.addEventListener('change',()=>{if(controls){controls.autoRotate=!reduced.matches;controls.enableDamping=!reduced.matches;}resize();});
addEventListener('pagehide',dispose);
const observer=new ResizeObserver(resize);observer.observe(document.documentElement);
resize();loadModel();
