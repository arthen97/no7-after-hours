import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {createSalonPerformance} from './salon-performance.js?v=52';

const HOSTS = ['mira', 'hana', 'lin', 'yue'];

function fairSkin(material){
 const map=material.map,image=map&&map.image;
 if(!image||!image.width)return;
 const canvas=document.createElement('canvas');
 canvas.width=image.width;canvas.height=image.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0);
 const frame=ctx.getImageData(0,0,canvas.width,canvas.height),d=frame.data;
 for(let i=0;i<d.length;i+=4){
  const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),delta=mx-mn,v=mx,s=mx>1e-4?delta/mx:0;
  let h=0;
  if(delta>1e-6){if(mx===r)h=((g-b)/delta)%6;else if(mx===g)h=(b-r)/delta+2;else h=(r-g)/delta+4;if(h<0)h+=6;}
  const hd=h*60;
  if(!(hd>=6&&hd<=32&&s>=.16&&s<=.58&&v>=.5&&(r-g)>.08&&(r-b)>.12&&g/Math.max(r,.001)<.8))continue;
  const shade=(v-.7)*.34,k=.8;
  const tr=Math.min(1,Math.max(0,.995+shade)),tg=Math.min(1,Math.max(0,.84+shade*.65)),tb=Math.min(1,Math.max(0,.82+shade*.5));
  d[i]=Math.round((k*tr+(1-k)*r)*255);d[i+1]=Math.round((k*tg+(1-k)*g)*255);d[i+2]=Math.round((k*tb+(1-k)*b)*255);
 }
 ctx.putImageData(frame,0,0);
 map.image=canvas;map.needsUpdate=true;
 material.roughness=.26;material.envMapIntensity=.9;material.needsUpdate=true;
}

function dress(root){
 root.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){m.metalness=Math.min(m.metalness,.08);}});
}

// The poster photograph, feathered to a soft oval so the rim dissolves into
// the hair instead of reading as a card or a ball.
function posterFace(texture){
 const image=texture.image;
 const canvas=document.createElement('canvas');
 const w=512,h=640;
 canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0,w,h);
 const frame=ctx.getImageData(0,0,w,h),d=frame.data;
 for(let y=0;y<h;y++){
  const ey=(y/(h-1)-.5)*2;
  for(let x=0;x<w;x++){
   const ex=(x/(w-1)-.5)*2;
   const r=Math.sqrt(ex*ex+ey*ey);
   let a=r<=.9?1:Math.max(0,1-(r-.9)/.12);
   const v=y/(h-1);
   if(v>.78)a*=Math.max(0,1-(v-.78)/.22);
   d[(y*w+x)*4+3]=Math.round(a*255);
  }
 }
 ctx.putImageData(frame,0,0);
 const map=new T.CanvasTexture(canvas);
 map.colorSpace=T.SRGBColorSpace;
 map.anisotropy=8;
 map.needsUpdate=true;
 return map;
}

// Body stays the Meshy mesh. A separate face patch, parented to Head, carries
// the poster. The patch covers the mesh face; its edge fades out.
export function attachLikenessHead(root, texture){
 let mesh=null, head=null;
 root.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o; if(o.isBone&&o.name==='Head')head=o;});
 if(!mesh||!head||!mesh.geometry.index)return;
 root.updateWorldMatrix(true,true);
 const geo=mesh.geometry, pos=geo.attributes.position, skinI=geo.attributes.skinIndex, skinW=geo.attributes.skinWeight;
 const bones=mesh.skeleton.bones, idx=geo.index.array;
 const headIds=new Set(bones.map((b,i)=>/head/i.test(b.name)?i:-1).filter(i=>i>=0));
 const skinned=new T.Vector3(), world=new T.Vector3();
 const onHead=[];
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(let i=0;i<pos.count;i++){
  let w=0;
  for(let k=0;k<4;k++) if(headIds.has(skinI.getComponent(i,k))) w+=skinW.getComponent(i,k);
  if(w<.45){onHead.push(false);continue;}
  onHead.push(true);
  mesh.getVertexPosition(i, skinned);
  world.copy(skinned).applyMatrix4(mesh.matrixWorld);
  if(world.x<minX)minX=world.x; if(world.x>maxX)maxX=world.x;
  if(world.y<minY)minY=world.y; if(world.y>maxY)maxY=world.y;
  if(world.z<minZ)minZ=world.z; if(world.z>maxZ)maxZ=world.z;
 }
 const zCut=minZ+(maxZ-minZ)*.48;
 const yLow=minY+(maxY-minY)*.06;
 const yHigh=minY+(maxY-minY)*.72;
 const xLow=minX+(maxX-minX)*.18;
 const xHigh=minX+(maxX-minX)*.82;
 const face=new Array(pos.count).fill(false);
 let minFX=Infinity,maxFX=-Infinity,minFY=Infinity,maxFY=-Infinity,count=0;
 for(let i=0;i<pos.count;i++){
  if(!onHead[i])continue;
  mesh.getVertexPosition(i, skinned);
  world.copy(skinned).applyMatrix4(mesh.matrixWorld);
  if(world.z<zCut||world.y<yLow||world.y>yHigh||world.x<xLow||world.x>xHigh)continue;
  face[i]=true; count++;
  if(world.x<minFX)minFX=world.x; if(world.x>maxFX)maxFX=world.x;
  if(world.y<minFY)minFY=world.y; if(world.y>maxFY)maxFY=world.y;
 }
 if(count<40)return;
 const hs=new T.Vector3();
 head.matrixWorld.decompose(new T.Vector3(), new T.Quaternion(), hs);
 const coverLow=Math.min(minFY, minY+(maxY-minY)*.04);
 const coverHigh=Math.max(maxFY, minY+(maxY-minY)*.76);
 const width=Math.max(.04, maxFX-minFX)/hs.x*1.2;
 const height=Math.max(.05, coverHigh-coverLow)/hs.y;
 const depth=width*.1;
 const segX=64, segY=80, positions=[], uvs=[], indices=[];
 for(let iy=0; iy<=segY; iy++){
  const v=iy/segY, fy=(v-.5)*height;
  for(let ix=0; ix<=segX; ix++){
   const u=ix/segX, fx=(u-.5)*width;
   const ex=fx/(width*.5), ey=fy/(height*.5);
   const r=Math.min(1, ex*ex*.85+ey*ey);
   positions.push(fx, fy, Math.cos(r*Math.PI*.5)*depth);
   uvs.push(u, v);
  }
 }
 const row=segX+1;
 const inside=(ix,iy)=>{const ex=(ix/segX-.5)*2, ey=(iy/segY-.5)*2; return ex*ex+ey*ey<=1.02;};
 for(let iy=0; iy<segY; iy++) for(let ix=0; ix<segX; ix++){
  if(!inside(ix+.5,iy+.5))continue;
  const a=iy*row+ix;
  indices.push(a, a+1, a+row, a+1, a+row+1, a+row);
 }
 const shellGeo=new T.BufferGeometry();
 shellGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
 shellGeo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
 shellGeo.setIndex(indices);
 shellGeo.computeVertexNormals();
 const map=posterFace(texture);
 const shell=new T.Mesh(shellGeo, new T.MeshBasicMaterial({map, transparent:true, alphaTest:.08, depthWrite:true, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4, side:T.FrontSide}));
 const origin=new T.Vector3();
 head.getWorldPosition(origin);
 const localOrigin=head.worldToLocal(origin.clone());
 const ahead=origin.clone(); ahead.z+=1;
 const forward=head.worldToLocal(ahead).sub(localOrigin).normalize();
 const upPoint=origin.clone(); upPoint.y+=1;
 const up=head.worldToLocal(upPoint).sub(localOrigin.clone()).normalize();
 const right=new T.Vector3().crossVectors(up, forward).normalize();
 const yAxis=new T.Vector3().crossVectors(forward, right).normalize();
 shell.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right, yAxis, forward));
 const midY=(coverLow+coverHigh)/2;
 const center=head.worldToLocal(new T.Vector3((minFX+maxFX)/2, midY, maxZ));
 shell.position.copy(center);
 shell.position.addScaledVector(forward, .4);
 shell.name='likeness-head';
 shell.userData.face={minFX,maxFX,minFY,maxFY,maxZ,minZ,minY,maxY,width,height};
 shell.frustumCulled=false;
 shell.renderOrder=4;
 shell.castShadow=false;
 head.add(shell);
}

export async function loadSelectedMira(onStatus){
 onStatus('Loading the four hosts…');
 const loader=new GLTFLoader();
 loader.register(parser=>{parser.textureLoader=new T.TextureLoader(parser.options.manager);return{name:'MIRA_HTML_IMAGE_DECODE'};});
 const bodies={},motions={};
 for(const id of HOSTS){
  onStatus('Loading '+id+'…');
  const asset=await loader.loadAsync('./assets/hosts/'+id+'.glb?v=43');
  dress(asset.scene);
  bodies[id]=asset.scene;
  const response=await fetch('./assets/host-motion-'+id+'.json?v=44');
  if(!response.ok)throw Error('Host motion library unavailable');
  motions[id]=await response.json();
 }
 return {bodies,createPerformance(id,root,actor,options){return createSalonPerformance(root,actor,motions[id],{...options,stableRig:true});},version:'meshy-v41',rig:'meshy-native'};
}
