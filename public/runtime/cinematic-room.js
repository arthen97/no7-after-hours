import * as T from '../vendor/three.module.js';
import {solveSupport,settleBody} from './surface-physics.js';
import {EffectComposer} from '../vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from '../vendor/addons/postprocessing/OutputPass.js';
import {ShaderPass} from '../vendor/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from '../vendor/addons/shaders/FXAAShader.js';
import {RectAreaLightUniformsLib} from '../vendor/addons/lights/RectAreaLightUniformsLib.js';
export function createCinema(renderer,scene,camera){
 RectAreaLightUniformsLib.init();renderer.info.autoReset=false;
 const area=new T.RectAreaLight('#ffdfc2',3.4,2.2,2.7);area.position.set(-1.8,2.25,1.35);area.lookAt(-.45,1.05,-1.35);scene.add(area);
 const windowLight=new T.RectAreaLight('#93b8d9',2.2,1.65,1.75);windowLight.position.set(2.3,4.5,-5.1);windowLight.lookAt(-.2,1,-1);scene.add(windowLight);
 const bounce=new T.RectAreaLight('#d0b3a0',.65,3,2);bounce.position.set(.8,1.4,2);bounce.lookAt(-.5,.8,-1.5);scene.add(bounce);
 const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:true});target.samples=2;
 const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
 const bloom=new UnrealBloomPass(new T.Vector2(1,1),.22,.38,1.35);composer.addPass(bloom);const aa=new ShaderPass(FXAAShader);composer.addPass(aa);composer.addPass(new OutputPass());
 let width=1,height=1,quality=1.25,enabled=true;
 return {render(){renderer.info.reset();composer.render()},resize(w,h){width=w;height=h;renderer.setPixelRatio(Math.min(devicePixelRatio,quality));renderer.setSize(w,h);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);aa.uniforms.resolution.value.set(1/(w*renderer.getPixelRatio()),1/(h*renderer.getPixelRatio()));},setQuality(q){quality=q;this.resize(width,height);},setBloom(v){enabled=v;bloom.enabled=v;},setLighting(v){area.intensity=3.4*v.key;bounce.intensity=.65*v.fill;windowLight.intensity=2.2*v.rim;area.color.setRGB(1,.42+.1*(1-v.warmth),.62);},dim(v){area.intensity=v?2.2:3.4;windowLight.intensity=v?1.5:2.2;},diagnostics:()=>({bloom:enabled,bloomThreshold:bloom.threshold,renderScale:renderer.getPixelRatio(),pipeline:'HDR → threshold bloom → FXAA → ACES/sRGB',dlss:false})};
}
// Continuous seeded value noise. Placement density follows an fBm field, then exclusion/spacing checks.
export function valueNoise(x,y,seed=7){const hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(seed,1274126177);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,s=u*u*(3-2*u),t=v*v*(3-2*v);return T.MathUtils.lerp(T.MathUtils.lerp(hash(i,j),hash(i+1,j),s),T.MathUtils.lerp(hash(i,j+1),hash(i+1,j+1),s),t);}
export function roomPlacements(seed=7){const out=[];for(const zone of [{id:'sideboard',x:2.45,z:-1.9,w:.92,d:.4,y:.918},{id:'table',x:1.35,z:-1.18,w:.82,d:.60,y:.698}]){for(let i=0;i<75&&out.filter(p=>p.zone===zone.id).length<5;i++){const x=zone.x+(valueNoise(i*3.73,11,seed)-.5)*zone.w,z=zone.z+(valueNoise(i*7.13,28,seed)-.5)*zone.d,n=.65*valueNoise(x*6,z*6,seed)+.35*valueNoise(x*13,z*13,seed+31);if(n<.45)continue;if(zone.id==='sideboard'&&Math.abs(x-2.45)<.37&&Math.abs(z+1.9)<.19)continue;if(zone.id==='table'&&((Math.hypot(x-1.18,z+1.2)<.15)||(Math.hypot(x-1.53,z+1.2)<.15)||(Math.abs(x-1.25)<.22&&Math.abs(z+.92)<.17)))continue;if(out.some(p=>Math.hypot(p.x-x,p.z-z)<.12))continue;out.push({zone:zone.id,x,y:zone.y,z,rotation:valueNoise(i,5,seed)*6.28,scale:.8+valueNoise(i,9,seed)*.35,type:out.length%3});}}return out;}
export function addDressing(scene,seed=7,candleTemplate=null,supports=[]){
 const group=new T.Group();group.name='Supported room details';scene.add(group);
 let placements=[],bodies=[],rejected=0;
 const brass=new T.MeshStandardMaterial({color:'#98754e',metalness:.7,roughness:.47}),paper=new T.MeshStandardMaterial({color:'#ad9879',roughness:.9});
 function regenerate(next){
  seed=next;for(const o of [...group.children]){o.traverse(m=>{if(!m.userData.sharedAsset)m.geometry?.dispose()});group.remove(o);}
  placements=[];bodies=[];rejected=0;
  const occupied=supports.flatMap(s=>s.obstacles.map(o=>new T.Box3().setFromObject(o)));
  for(const support of supports){
   const surfaceBox=new T.Box3().setFromObject(support.mesh),size=surfaceBox.getSize(new T.Vector3());let accepted=0;
   for(let i=0;i<100&&accepted<3;i++){
    const x=surfaceBox.min.x+valueNoise(i*3.73,11,seed)*size.x,z=surfaceBox.min.z+valueNoise(i*7.13,28,seed)*size.z;
    if(valueNoise(x*6,z*6,seed)<.35)continue;
    const type=candleTemplate?0:accepted%3,item=new T.Group();item.position.set(x,0,z);item.rotation.y=valueNoise(i,5,seed)*Math.PI*2;item.scale.setScalar(.85+valueNoise(i,9,seed)*.2);
    if(type===0&&candleTemplate)item.add(candleTemplate.clone(true));
    else {const mesh=new T.Mesh(type===1?new T.BoxGeometry(.14,.025,.10):new T.CylinderGeometry(.04,.032,.018,24),type===1?paper:brass);item.add(mesh);}
    item.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});group.add(item);
    const solution=solveSupport(item,support.mesh,occupied);
    if(!solution){group.remove(item);item.traverse(m=>{if(!m.userData.sharedAsset)m.geometry?.dispose()});rejected++;continue;}
    item.position.y=solution.y+.06;occupied.push(solution.bounds);bodies.push({object:item,y:solution.y,velocity:0,sleeping:false});
    placements.push({zone:support.id,x,z,y:solution.y,supportY:solution.supportY,rotation:item.rotation.y,scale:item.scale.x,type,bounds:{min:solution.bounds.min.toArray(),max:solution.bounds.max.toArray()}});accepted++;
   }
  }
 }
 regenerate(seed);
 return {regenerate,update(dt){for(const body of bodies)settleBody(body,dt);},diagnostics:()=>({seed,method:'fBm proposals; rotated bounds + four surface raycasts + obstacle rejection + gravity settling',physics:'static support solver, not general rigid-body simulation',gravity:9.81,rejected,settled:bodies.every(b=>b.sleeping),candleSource:'Poly Haven Brass Candleholders · CC0',placements,contactErrors:bodies.map(b=>b.object.position.y-b.y)})};
}
