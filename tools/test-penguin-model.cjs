'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
function read(file){const bytes=fs.readFileSync(file),n=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);return {json:JSON.parse(bytes.toString('utf8',20,20+n)),binary:bytes.subarray(28+n),bytes};}
const fixed=read(path.resolve(__dirname,'../apps/karuro/assets/meshy-penguin.glb')),j=fixed.json;
const primitive=j.meshes[0].primitives[0],colours=j.accessors[primitive.attributes.COLOR_0],positions=j.accessors[primitive.attributes.POSITION];
assert.equal(j.meshes.length,1);assert.equal(j.meshes[0].primitives.length,1);assert.equal(positions.count,95004);
assert.equal(j.accessors[primitive.indices].count,521280);assert.equal(colours.count,positions.count);assert.equal(colours.componentType,5126);assert.equal(colours.type,'VEC3');
assert.equal(j.images.length,3);assert.ok(j.materials[0].pbrMetallicRoughness.baseColorTexture);assert.ok(j.materials[0].normalTexture);
const offset=a=>(j.bufferViews[a.bufferView].byteOffset||0)+(a.byteOffset||0),po=offset(positions),co=offset(colours);
let edited=0,protectedVertices=0,rearCore=0,blackCore=0;
for(let i=0;i<positions.count;i++){
  const x=fixed.binary.readFloatLE(po+i*12),y=fixed.binary.readFloatLE(po+i*12+4),z=fixed.binary.readFloatLE(po+i*12+8);
  const rgb=[0,4,8].map(c=>fixed.binary.readFloatLE(co+i*12+c));
  assert.ok(rgb.every(v=>Number.isFinite(v)&&v>=0&&v<=1));if(rgb.some(v=>v<.99999))edited++;
  if(z>=.001||y<=.009||y>=.080||Math.abs(x)>=.034){assert.deepEqual(rgb,[1,1,1]);protectedVertices++;}
  if(z<-.015&&y>.025&&y<.065&&Math.abs(x)<.022){rearCore++;if(rgb.some(v=>v<.1))blackCore++;}
}
assert.equal(edited,j.asset.extras.desPortalBackCorrection.editedVertices);assert.ok(edited>20000);assert.ok(protectedVertices>40000);
assert.ok(rearCore>1000);assert.ok(blackCore/rearCore>.9,'Rear torso must be recoloured');
if(process.argv[2]){
  const original=read(process.argv[2]);
  assert.equal(crypto.createHash('sha256').update(original.bytes).digest('hex'),j.asset.extras.desPortalBackCorrection.sourceSha256);
  assert.ok(fixed.binary.subarray(0,original.binary.length).equals(original.binary),'All original geometry, indices and embedded image bytes must remain identical');
  assert.deepEqual(j.materials,original.json.materials);assert.deepEqual(j.images,original.json.images);
}
console.log('PASS penguin back: dark rear vertex colours, protected front/feet/head, unchanged topology/materials/embedded textures');
