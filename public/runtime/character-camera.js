import * as T from '../vendor/three.module.js';

// User control stays in charge until an explicit cinematic preset is selected.
export function createCharacterCamera({camera,focus,actor,scene,canvas,takeControl}){
 const orbit=new T.Spherical(),pointers=new Map(),offset=new T.Vector3(),lastActor=new T.Vector3(Infinity,Infinity,Infinity);
 const ray=new T.Raycaster(),direction=new T.Vector3(),candidate=new T.Vector3();
 const obstacles=[];scene.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh)return;let p=o;while(p){if(p===actor)return;p=p.parent;}const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.some(m=>m&&!m.transparent))obstacles.push(o);});
 let enabled=false,pan=false,last=null;
 const clamp=T.MathUtils.clamp;
 function sync(){orbit.setFromVector3(camera.position.clone().sub(focus));offset.copy(focus).sub(actor.position);}
 function activate(){if(!enabled){sync();enabled=true;}takeControl();}
 function place(){
  orbit.radius=clamp(orbit.radius,.48,4.8);orbit.phi=clamp(orbit.phi,.22,Math.PI-.22);
  offset.y=clamp(offset.y,.12,1.95);offset.x=clamp(offset.x,-.75,.75);offset.z=clamp(offset.z,-.75,.75);
  focus.copy(actor.position).add(offset);candidate.setFromSpherical(orbit).add(focus);
  direction.copy(candidate).sub(focus);const distance=direction.length();ray.set(focus,direction.normalize());ray.near=.08;ray.far=distance;
  const hit=ray.intersectObjects(obstacles,false).find(x=>x.object.visible);
  if(hit)candidate.copy(focus).addScaledVector(direction,Math.max(.12,hit.distance-.10));
  candidate.y=Math.max(.09,candidate.y);camera.position.copy(candidate);lastActor.copy(actor.position);
 }
 function state(){const a=[...pointers.values()];if(a.length===1)return {x:a[0].x,y:a[0].y,d:0,n:1};const [p,q]=a;return {x:(p.x+q.x)/2,y:(p.y+q.y)/2,d:Math.hypot(p.x-q.x,p.y-q.y),n:a.length};}
 function movePan(dx,dy){const scale=orbit.radius*.0015;const right=new T.Vector3().setFromMatrixColumn(camera.matrix,0);offset.addScaledVector(right,-dx*scale);offset.y+=dy*scale;}
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0&&e.button!==2)return;activate();pan=e.button===2||e.shiftKey;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});last=state();canvas.setPointerCapture(e.pointerId);canvas.style.cursor=pan?'move':'grabbing';});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const now=state();if(last&&last.n===now.n){const dx=now.x-last.x,dy=now.y-last.y;if(now.n>1){if(now.d&&last.d)orbit.radius*=last.d/now.d;movePan(dx,dy);}else if(pan||e.shiftKey)movePan(dx,dy);else{orbit.theta-=dx*.006;orbit.phi-=dy*.005;}}last=now;place();});
 function release(e){pointers.delete(e.pointerId);last=pointers.size?state():null;if(!pointers.size)canvas.style.cursor='grab';}
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
 canvas.addEventListener('wheel',e=>{e.preventDefault();activate();const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);orbit.radius*=Math.exp(clamp(dy,-200,200)*.0018);place();},{passive:false});
 canvas.tabIndex=0;canvas.setAttribute('aria-label','3D character view. Drag to orbit, scroll to zoom, Shift-drag to pan. Arrow keys orbit, plus or minus zoom, Page Up and Page Down adjust height.');canvas.style.cursor='grab';
 canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','PageUp','PageDown','Home'].includes(e.key))return;e.preventDefault();activate();if(e.key==='ArrowLeft')orbit.theta+=.12;if(e.key==='ArrowRight')orbit.theta-=.12;if(e.key==='ArrowUp')orbit.phi-=.1;if(e.key==='ArrowDown')orbit.phi+=.1;if(e.key==='+'||e.key==='=')orbit.radius*=.88;if(e.key==='-')orbit.radius*=1.12;if(e.key==='PageUp')offset.y+=.08;if(e.key==='PageDown')offset.y-=.08;if(e.key==='Home')preset('full');place();});
 function preset(kind){activate();offset.set(0,kind==='portrait'?1.5:kind==='detail'?1.05:.95,0);orbit.set(kind==='portrait'?.85:kind==='detail'?1.15:2.8,Math.PI/2-.06,actor.rotation.y);place();}
 return {preset,setHeight(value){activate();offset.y=value;place();},release(){enabled=false;pointers.clear();last=null;canvas.style.cursor='grab';},update(){if(enabled&&!lastActor.equals(actor.position))place();},get active(){return enabled;},snapshot(){return {mode:enabled?'free':'cinematic',height:offset.y,distance:orbit.radius};}};
}
