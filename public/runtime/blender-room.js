import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';

// Source: S05_full_room_review_v014.blend. The manifest preserves Blender's
// measured transforms and seeded rainfall; the character has a separate gate.
export function rainPosition(drop,time){
 const y=5-((5-drop.phase+time*drop.speed)%5);
 return [drop.position[0]+(drop.phase-y)*.055,y,drop.position[2]];
}
export async function loadBlenderRoom(scene){
 const loader=new GLTFLoader();
 loader.register(parser=>{parser.textureLoader=new T.TextureLoader(parser.options.manager);return {name:'BLENDER_ROOM_IMAGE_DECODE'};});
 const [asset,response]=await Promise.all([
  loader.loadAsync('/assets/environment/v10/room-architecture.glb'),
  fetch('/assets/environment/v10/room-manifest.json')
 ]);
 if(!response.ok)throw new Error('Blender room manifest unavailable');
 const manifest=await response.json(),room=asset.scene;room.name='Blender validated environment';
 room.traverse(o=>{
  if(!o.isMesh)return;
  const glass=/Rain glass/.test(o.name),city=/Distant/.test(o.name);
  o.castShadow=!glass&&!city;o.receiveShadow=!glass&&!city;
  const materials=Array.isArray(o.material)?o.material:[o.material];
  for(const m of materials){
   if(m.map)m.map.anisotropy=4;
   if(glass){m.thickness=.008;m.envMapIntensity=.25;}
  }
 });
 scene.add(room);
 const material=new T.MeshStandardMaterial({color:'#667e91',roughness:.2,metalness:0,emissive:'#182c40',emissiveIntensity:.12});
 const rain=new T.InstancedMesh(new T.SphereGeometry(1,6,4),material,manifest.rain.length);
 rain.name='Blender rain · continuous world-space fall';rain.frustumCulled=false;rain.instanceMatrix.setUsage(T.DynamicDrawUsage);rain.visible=false;scene.add(rain);
 const dummy=new T.Object3D();let elapsed=0;
 function update(time){
  elapsed=time;
  manifest.rain.forEach((drop,i)=>{
   dummy.position.fromArray(rainPosition(drop,time));dummy.scale.set(drop.radius,drop.length/2,drop.radius);dummy.rotation.z=.07;dummy.updateMatrix();rain.setMatrixAt(i,dummy.matrix);
  });rain.instanceMatrix.needsUpdate=true;
 }
 update(0);
 return {update,diagnostics:()=>({version:manifest.version,source:manifest.source_blend,sourceHash:manifest.source_sha256,batches:manifest.batches,rainCount:manifest.rain.length,elapsed,characterImported:false,sofaImported:false,method:'Native Blender geometry and UV export; glass beads, depth-separated city, seeded continuous rainfall'})};
}
