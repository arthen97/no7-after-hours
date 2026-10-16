import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
// Real, licensed assets. Preserve their scale ratios and settle from bounds.
export async function loadRoomAssets(scene){
 const loader=new GLTFLoader();loader.register(parser=>{parser.textureLoader=new T.TextureLoader(parser.options.manager);return{name:'ROOM_HTML_IMAGE_DECODE'};});
 const names=['coffee_table_round_01','modern_wooden_cabinet','vintage_radio_transceiver','vintage_oil_lamp','side_table_tall_01'];
 const loaded=await Promise.all(names.map(n=>loader.loadAsync(`/assets/environment/v8/${n}/${n}.gltf`)));
 const models=Object.fromEntries(names.map((n,i)=>[n,loaded[i].scene]));
 function place(name,width,x,y,z,rotation=0){const g=models[name].clone(true);g.rotation.y=rotation;g.updateMatrixWorld(true);let b=new T.Box3().setFromObject(g),size=b.getSize(new T.Vector3());g.scale.setScalar(width/size.x);g.updateMatrixWorld(true);b.setFromObject(g);const center=b.getCenter(new T.Vector3());g.position.set(x-center.x,y-b.min.y,z-center.z);g.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.userData.sharedAsset=true;}});scene.add(g);g.updateMatrixWorld(true);return g;}
 const table=place('coffee_table_round_01',1.13,1.5,.015,-.92);
 const cabinet=place('modern_wooden_cabinet',2.12,2.1,0,-3.1);
 const tableY=new T.Box3().setFromObject(table).max.y,cabinetY=new T.Box3().setFromObject(cabinet).max.y;
 // The radio asset includes accessories; the complete authored assembly is retained.
 const radio=place('vintage_radio_transceiver',.58,2.05,cabinetY,-3.08);
 const lamp=place('vintage_oil_lamp',.16,2.89,cabinetY,-3.1);
 lamp.traverse(o=>{if(o.isMesh&&/flame/i.test(o.material.name)){o.material=o.material.clone();o.material.emissive=new T.Color('#ffb15d');o.material.emissiveIntensity=2;}});
 const glow=new T.PointLight('#ffc185',1.1,3,2);glow.position.set(2.89,cabinetY+.37,-3.1);scene.add(glow);
 const stand=place('side_table_tall_01',.43,-2.96,0,-2.16),standY=new T.Box3().setFromObject(stand).max.y;
 const leftLamp=place('vintage_oil_lamp',.17,-2.96,standY,-2.16);
 leftLamp.traverse(o=>{if(o.isMesh&&/flame/i.test(o.material.name)){o.material=o.material.clone();o.material.emissive=new T.Color('#ffb15d');o.material.emissiveIntensity=2;}});
 const leftGlow=new T.PointLight('#ffc185',1.5,4,2);leftGlow.position.set(-2.96,standY+.39,-2.16);scene.add(leftGlow);
 return {table,cabinet,radio,lamp,stand,leftLamp,tableY,cabinetY};
}
