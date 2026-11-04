// Recolour the rear torso through native glTF vertex colours. No image pixels,
// positions, normals, UVs, indices or original materials are rewritten.
// Usage: node tools/blacken-penguin-back.cjs original.glb output.glb
// Set WOS_SHARP_MODULE to the installed sharp package path if needed.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require(process.env.WOS_SHARP_MODULE||'sharp');
async function main(){
  const [input,output]=process.argv.slice(2);
  if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('Supply distinct input and output GLB paths.');
  const source=fs.readFileSync(input);
  if(source.readUInt32LE(0)!==0x46546c67||source.readUInt32LE(4)!==2)throw Error('Expected GLB 2.0.');
  const jsonLength=source.readUInt32LE(12),document=JSON.parse(source.toString('utf8',20,20+jsonLength));
  const binaryOffset=28+jsonLength,binary=source.subarray(binaryOffset,binaryOffset+source.readUInt32LE(20+jsonLength));
  if(document.meshes.length!==1||document.meshes[0].primitives.length!==1)throw Error('Expected the original one-primitive penguin model.');
  const primitive=document.meshes[0].primitives[0],positions=document.accessors[primitive.attributes.POSITION],uvs=document.accessors[primitive.attributes.TEXCOORD_0];
  if(primitive.attributes.COLOR_0!==undefined||positions.componentType!==5126||uvs.componentType!==5126)throw Error('Unexpected source attributes.');
  function accessorOffset(accessor){return (document.bufferViews[accessor.bufferView].byteOffset||0)+(accessor.byteOffset||0);}
  const po=accessorOffset(positions),uo=accessorOffset(uvs),ps=document.bufferViews[positions.bufferView].byteStride||12,us=document.bufferViews[uvs.bufferView].byteStride||8;
  const texture=document.materials[primitive.material].pbrMetallicRoughness.baseColorTexture;
  const image=document.images[document.textures[texture.index].source],view=document.bufferViews[image.bufferView];
  const {data,info}=await sharp(binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const linear=value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;};
  function sample(u,v,channel){
    const x=Math.max(0,Math.min(info.width-1,u*info.width-.5)),y=Math.max(0,Math.min(info.height-1,v*info.height-.5));
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,info.width-1),y1=Math.min(y0+1,info.height-1),fx=x-x0,fy=y-y0;
    const at=(a,b)=>linear(data[(b*info.width+a)*info.channels+channel]);
    return (at(x0,y0)*(1-fx)+at(x1,y0)*fx)*(1-fy)+(at(x0,y1)*(1-fx)+at(x1,y1)*fx)*fy;
  }
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  const colours=Buffer.alloc(positions.count*12),black=.006;let edited=0;
  for(let i=0;i<positions.count;i++){
    const x=binary.readFloatLE(po+i*ps),y=binary.readFloatLE(po+i*ps+4),z=binary.readFloatLE(po+i*ps+8);
    // Blend only across the rear half of the torso, staying above the orange feet.
    // Already-dark flippers retain their colour and all original reflectance maps.
    const weight=(1-smooth(-.003,.001,z))*smooth(.009,.014,y)*(1-smooth(.074,.080,y))*(1-smooth(.028,.034,Math.abs(x)));
    const u=binary.readFloatLE(uo+i*us),v=binary.readFloatLE(uo+i*us+4);let changed=false;
    for(let c=0;c<3;c++){
      const factor=weight?Math.min(1,black/Math.max(sample(u,v,c),1e-6)):1;
      const value=1+weight*(factor-1);colours.writeFloatLE(value,i*12+c*4);if(value<.99999)changed=true;
    }
    if(changed)edited++;
  }
  if(edited<3000||edited>positions.count*.75)throw Error('Unexpected rear selection; refusing to replace the model.');
  const padding=Buffer.alloc((4-binary.length%4)%4),colourOffset=binary.length+padding.length;
  const colourView=document.bufferViews.push({buffer:0,byteOffset:colourOffset,byteLength:colours.length,target:34962})-1;
  primitive.attributes.COLOR_0=document.accessors.push({bufferView:colourView,componentType:5126,count:positions.count,type:'VEC3'})-1;
  const bin=Buffer.concat([binary,padding,colours]);document.buffers[0].byteLength=bin.length;
  document.asset.extras={...document.asset.extras,desPortalBackCorrection:{version:1,method:'rear-torso-vertex-colour',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),editedVertices:edited,blackLinear:black}};
  const json=Buffer.from(JSON.stringify(document)),jsonPadded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(jsonPadded);
  const binPadded=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(binPadded);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonPadded.length+binPadded.length,8);header.writeUInt32LE(jsonPadded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binPadded.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jsonPadded,binHeader,binPadded]));
  console.log(JSON.stringify(document.asset.extras.desPortalBackCorrection));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
