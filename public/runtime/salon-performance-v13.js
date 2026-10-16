import * as T from '../vendor/three.module.js';
import {aimBone} from './character-performance.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const angle=a=>T.MathUtils.euclideanModulo(a+Math.PI,2*Math.PI)-Math.PI;

// This controller only transports the actor and aims the head within limits.
// Skin weights, fingers, limb poses and corrective morphs come from the same GLB.
export function createSalonPerformance(root,actor,clips,{camera,seatY,onView=()=>{},sofaBounds}){
 const mixer=new T.AnimationMixer(root);
 const actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)]));
 for(const name of ['relaxed','walk','walk_back','talk','greet','sit_enter','sit_exit','sit_idle','sit_talk']){
  if(!actions[name])throw Error(`Mira preview is missing the ${name} animation`);
 }
 for(const name of ['sit_enter','sit_exit','greet']){
  actions[name].setLoop(T.LoopOnce,1);actions[name].clampWhenFinished=true;
 }
 const speed=.62,backSpeed=.23;
 actions.walk.setEffectiveTimeScale(speed/1.0268479638);
 actions.walk_back.setEffectiveTimeScale(backSpeed/(1.0268479638*.35));
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 const head=bones.get('Head'),tip=bones.get('headfront');
 actor.updateMatrixWorld(true);
 // Identify actual body primitives, then measure the seated posterior surface,
 // including its authored corrective morph. Empty semantic parent nodes are ignored.
 const sensors=[];
 root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||mesh.morphTargetDictionary?.Seated===undefined)return;
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
   const p=actor.worldToLocal(mesh.getVertexPosition(i,V()).applyMatrix4(mesh.matrixWorld));
   if(p.y>.76&&p.y<.92&&Math.abs(p.x)<.15&&p.z<-.025)sensors.push({mesh,index:i});
  }
 });
 if(!sensors.length||!Number.isFinite(seatY))throw Error('Mira seat calibration unavailable');
 actions.sit_idle.play();mixer.update(0);actor.updateMatrixWorld(true);
 const points=sensors.map(({mesh,index})=>actor.worldToLocal(mesh.getVertexPosition(index,V()).applyMatrix4(mesh.matrixWorld)));
 const bottom=Math.min(...points.map(p=>p.y));
 const contact=points.filter(p=>p.y<bottom+.025);
 const center=contact.reduce((sum,p)=>sum.add(p),V()).divideScalar(contact.length);
 const seatOffset=seatY+.005-bottom;
 if(!Number.isFinite(seatOffset)||Math.abs(seatOffset)>.25)throw Error('Mira seat height outside preview calibration range');
 actions.sit_idle.stop();
 const seat=V(-.72-center.x,seatOffset,-2.4-center.z);
 const front=(sofaBounds?.max.z??-2.13)+.43;
 const preSeat=V(seat.x,0,front),staging=V(seat.x,0,Math.max(front+.3,-1.30));
 const home=V(0,0,-.7);
 let current=null,action=null,stage=null,plan=[],callback=null,queued=null;
 let phase='idle',posture='standing',speaking=false,paused=false,elapsed=0;
 let headAuthored=null,gazeError=0,gazeLimited=false;
 function restoreHead(){if(headAuthored&&head){head.quaternion.copy(headAuthored);headAuthored=null;}}
 function choose(name,fade=.18){
  const a=actions[name];if(current===a)return;
  a.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if(current)current.fadeOut(fade);current=a;
 }
 function rest(){choose(posture==='seated'?(speaking?'sit_talk':'sit_idle'):(speaking?'talk':'relaxed'));}
 choose('relaxed',0);mixer.update(0);
 function next(){
  stage=plan.shift();elapsed=0;
  if(!stage){
   action=null;phase=posture==='seated'?'seated':'idle';rest();
   const cb=callback;callback=null;cb?.();
   if(queued){const q=queued;queued=null;motion(q.id,q.done);}
   return;
  }
  phase=stage.kind;stage.origin=actor.position.clone();stage.startYaw=actor.rotation.y;
  if(stage.kind==='orient'){
   if(stage.dest){const d=stage.dest.clone().sub(actor.position);stage.yaw=Math.atan2(d.x,d.z)+(stage.backwards?Math.PI:0);}
   choose('relaxed');
  }
  if(stage.kind==='walk'){
   stage.duration=actor.position.distanceTo(stage.dest)/(stage.backwards?backSpeed:speed);
   choose(stage.backwards?'walk_back':'walk');
  }
  if(stage.kind==='sit'){stage.duration=actions.sit_enter.getClip().duration;choose('sit_enter',.10);onView('together');}
  if(stage.kind==='rise'){stage.duration=actions.sit_exit.getClip().duration;choose('sit_exit',.10);}
  if(stage.kind==='gesture'){stage.duration=actions[stage.clip].getClip().duration;choose(stage.clip);}
 }
 function navigation(dest,{backwards=false,finalYaw=0}={}){
  return [{kind:'orient',dest,backwards,duration:.55},{kind:'walk',dest,backwards},{kind:'orient',yaw:finalYaw,duration:.45}];
 }
 function motion(id,done){
  if(!['sit','stand','approach','stepback','beside','comfort','wave'].includes(id))return false;
  if(action&&!paused)return false;
  if(paused){
   paused=false;mixer.timeScale=1;
   if(stage&&['sit','rise'].includes(stage.kind)){
    queued={id,done};plan=[];callback=null;phase=stage.kind;return true;
   }
  }
  queued=null;action=id;callback=done;plan=[];
  if(id==='sit'){
   if(posture!=='seated')plan.push(...navigation(staging),...navigation(preSeat,{backwards:true}),{kind:'sit'});
   else onView('together');
  }else if(posture==='seated'&&['comfort','wave'].includes(id)){
   plan.push({kind:'gesture',clip:'sit_talk'});
  }else{
   if(posture==='seated')plan.push({kind:'rise'},...navigation(staging));
   if(id==='approach')plan.push(...navigation(V(0,0,.6)));
   if(id==='stepback')plan.push(...navigation(home));
   if(id==='beside'){plan.push(...navigation(V(.58,0,.38),{finalYaw:-.24}));onView('beside');}
   if(id==='comfort')plan.push({kind:'gesture',clip:'talk'});
   if(id==='wave')plan.push({kind:'gesture',clip:'greet'});
  }
  next();return true;
 }
 function stop(){
  if(!action)return;paused=true;mixer.timeScale=0;phase='paused';callback=null;queued=null;plan=[];
 }
 function update(dt){
  if(!Number.isFinite(dt)||dt<0)return;
  dt=Math.min(dt,.1);restoreHead();let finished=false;
  if(!paused&&stage){
   elapsed+=dt;const u=Math.min(1,elapsed/Math.max(stage.duration,.0001));
   if(stage.kind==='orient')actor.rotation.y=stage.startYaw+angle(stage.yaw-stage.startYaw)*smooth(u);
   if(stage.kind==='walk')actor.position.lerpVectors(stage.origin,stage.dest,u);
   if(stage.kind==='sit')actor.position.lerpVectors(stage.origin,seat,smooth(u));
   if(stage.kind==='rise')actor.position.lerpVectors(stage.origin,preSeat,smooth(u));
   finished=u>=1;
  }
  if(!paused&&!stage){rest();if(posture==='standing'){
   const yaw=Math.atan2(camera.position.x-actor.position.x,camera.position.z-actor.position.z);
   actor.rotation.y+=angle(yaw-actor.rotation.y)*(1-Math.exp(-dt*2.5));
  }}
  mixer.update(paused?0:dt);actor.updateMatrixWorld(true);
  gazeLimited=false;
  if(head&&tip){
   headAuthored=head.quaternion.clone();const origin=head.getWorldPosition(V());
   const bodyQ=actor.getWorldQuaternion(new T.Quaternion());
   const requested=camera.position.clone().sub(origin).normalize();
   const local=requested.clone().applyQuaternion(bodyQ.clone().invert());
   const yaw=Math.atan2(local.x,local.z),pitch=Math.atan2(local.y,Math.hypot(local.x,local.z));
   const cy=T.MathUtils.clamp(yaw,-.46,.46),cp=T.MathUtils.clamp(pitch,-.18,.18);
   gazeLimited=Math.abs(yaw-cy)>.025||Math.abs(pitch-cp)>.025;
   if(!['walk','orient','sit','rise'].includes(phase)){
    const direction=V(Math.sin(cy)*Math.cos(cp),Math.sin(cp),Math.cos(cy)*Math.cos(cp)).applyQuaternion(bodyQ);
    aimBone(head,tip,origin.clone().add(direction),1);
   }
   actor.updateMatrixWorld(true);
   gazeError=T.MathUtils.radToDeg(tip.getWorldPosition(V()).sub(origin).normalize().angleTo(requested));
  }else{gazeLimited=true;gazeError=180;}
  if(finished){
   if(stage.kind==='sit')posture='seated';
   if(stage.kind==='rise')posture='standing';
   next();
  }
 }
 return {motion,stop,update,setSpeaking(value){speaking=!!value;},diagnostics(){return {
  posture,phase,action,paused,speaking,clip:current?.getClip().name,
  gazeLimited,gazeErrorDegrees:gazeError,position:actor.position.toArray(),
  animationSource:'embedded-v13-bones-and-corrective-morphs',clipCount:clips.length,
  seatOffset,seatAnchor:seat.toArray(),preview:true,
  knownIssues:['seating-transition-intersections','garment-simulation-pending','seated-foot-contact-pending'],
 };}};
}
