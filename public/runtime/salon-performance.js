import * as T from '../vendor/three.module.js';
import {aimBone,solveJoint} from './character-performance.js';
const smooth=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
const V=(x,y,z)=>new T.Vector3(x,y,z);
const wrap=a=>T.MathUtils.euclideanModulo(a+Math.PI,Math.PI*2)-Math.PI;
/** Explicit furniture anchors and authored clips. Idle adds a bounded living posture overlay. */
export function createSalonPerformance(root,actor,data,{camera,seatY,onView,sofaBounds,obstacles=[],stableRig=false}){
 const clips=data.clips.map(c=>{const clip=T.AnimationClip.parse(c);clip.uuid=c.uuid||T.MathUtils.generateUUID();return clip;});
 if(new Set(clips.map(c=>c.uuid)).size!==clips.length)throw Error('Animation IDs must be unique');
 const mixer=new T.AnimationMixer(root),actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)]));
 for(const name of ['sit_enter','sit_exit','greet']){actions[name].setLoop(T.LoopOnce,1);actions[name].clampWhenFinished=true;}
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o)});
 for(const name of ['host-apron','host-necklace']){const prop=root.getObjectByName(name);if(prop)actor.add(prop);}
 actor.updateMatrixWorld(true);
 const home=V(0,0,-.7),seat=V(-.72,0,-2.18),staging=V(-.72,0,-1.38),preSeat=V(-.72,0,-2.0),beside=V(.58,0,.38);
 const sensors={seat:[],feet:[[],[]]};
 root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const p=mesh.geometry.attributes.position,w=mesh.geometry.attributes.skinWeight,ix=mesh.geometry.attributes.skinIndex;
  const soles=[[],[]];for(let i=0;i<p.count;i++){
   const v=mesh.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(p,i)).applyMatrix4(mesh.matrixWorld);
   const local=actor.worldToLocal(v.clone());if(local.y>.75&&local.y<.89&&Math.abs(local.x)<.17&&local.z<-.035)sensors.seat.push({mesh,index:i,legacy:local.y>.75&&local.y<.89&&Math.abs(local.x)<.17&&local.z<-.035});
   for(let side=0;side<2;side++){let weight=0;for(let j=0;j<4;j++){const n=mesh.skeleton.bones[ix.array[i*4+j]]?.name;if(n===(side?'RightFoot':'LeftFoot')||n===(side?'RightToeBase':'LeftToeBase'))weight+=w.array[i*4+j];}if(weight>.7)soles[side].push({mesh,index:i,y:v.y});}
  }
  for(let side=0;side<2;side++){const low=Math.min(...soles[side].map(v=>v.y));sensors.feet[side].push(...soles[side].filter(v=>v.y<low+.022).filter((_,i)=>i%3===0));}
 });
 let maxHandClearance=0,gazeYaw=0,gazePitch=0,gazeLimited=false,gazeWeight=0;
 const point=s=>s.mesh.applyBoneTransform(s.index,new T.Vector3().fromBufferAttribute(s.mesh.geometry.attributes.position,s.index)).applyMatrix4(s.mesh.matrixWorld);
 // Calibrate the sitting contact against the loaded cushion, using the actual skinned surface.
 actions.sit_idle.play();mixer.update(0);actor.updateMatrixWorld(true);
 const seatYs=sensors.seat.map(s=>point(s).y);const bottom=seatYs.length?Math.min(...seatYs):seatY;const seatOffset=T.MathUtils.clamp(seatY+.012-bottom,-.75,.20);
 const seatedFeet=['Left','Right'].map((side,i)=>{const bone=bones.get(side+'Foot'),p=actor.worldToLocal(bone.getWorldPosition(new T.Vector3()));const ys=sensors.feet[i].map(s=>point(s).y);return {p,soleOffset:ys.length?bone.getWorldPosition(new T.Vector3()).y-Math.min(...ys):.02,q:bone.getWorldQuaternion(new T.Quaternion())};});
 actions.sit_idle.stop();let current=actions.relaxed;current.play();mixer.update(0);
 const standingFeet=['Left','Right'].map(side=>{const b=bones.get(side+'Foot');actor.updateMatrixWorld(true);return {p:actor.worldToLocal(b.getWorldPosition(V())),q:b.getWorldQuaternion(new T.Quaternion()).premultiply(actor.getWorldQuaternion(new T.Quaternion()).invert())};});
 const speed=.42,authoredSpeed=data.report.find(r=>r.clip==='walk').authoredSpeedMps,backSpeed=.23;actions.walk.timeScale=speed/authoredSpeed;if(actions.walk_back)actions.walk_back.timeScale=backSpeed/(authoredSpeed*.35);
 const people={mira:{idle:'relaxed',tempo:.92,wave:'greet',pour:'greet',sing:'talk'},hana:{idle:'idle',tempo:.64,wave:'relaxed',pour:'greet',sing:'relaxed'},lin:{idle:'idle',tempo:.48,wave:'talk',pour:'talk',sing:'talk'},yue:{idle:'talk',tempo:1.36,wave:'greet',pour:'talk',sing:'greet'}};
 let person=people.mira,action=null,phase='idle',posture='standing',phaseTime=0,seatedAmount=0,speaking=false,listening=false,paused=false,callback=null,plan=[],stage=null,interruption=null,total=0,comfort=0,footPins=null,blockedMoves=0,maxFootReachError=0,lifeStand=1,lifeSit=0,armLife=.66,walkLife=0,armPhase=0,armCarry=0,gaitDistance=0;const carried=new Map();
 const restored=new Map();const restore=()=>{for(const[b,s]of restored){b.quaternion.copy(s.q);b.position.copy(s.p);}restored.clear();};
 const spin=(bone,axis,angle)=>{if(bone&&Math.abs(angle)>1e-5){bone.quaternion.multiply(new T.Quaternion().setFromAxisAngle(axis,angle));bone.updateWorldMatrix(false,true);}};
 const choose=(name,fade=.3)=>{const a=actions[name]||actions.relaxed;if(current===a)return;a.reset().setEffectiveWeight(1).fadeIn(fade).play();current.fadeOut(fade);current=a;};
 function idleName(){return posture==='seated'?'sit_idle':person.idle;}
 function next(){stage=plan.shift();phaseTime=stage?.elapsed||0;if(!stage){action=null;phase=posture==='seated'?'seated':'idle';choose(idleName());const cb=callback;callback=null;cb?.();return;}phase=stage.kind;stage.start=actor.rotation.y;
  if(stage.kind==='orient'&&stage.dest){const delta=stage.dest.clone().sub(actor.position);stage.yaw=Math.atan2(delta.x,delta.z)+(stage.backwards?Math.PI:0);}
  if(stage.kind==='walk'){stage.origin=actor.position.clone();choose(stage.backwards&&actions.walk_back?'walk_back':'walk',.14);}
  if(stage.kind==='sit'){stage.origin??=actor.position.clone();if(!footPins){actor.updateMatrixWorld(true);footPins=['Left','Right'].map((side,i)=>{const bone=bones.get(side+'Foot'),from=bone.getWorldPosition(new T.Vector3()),sample=seatedFeet[i],p=sample.p.clone().add(seat);p.y=.018+sample.soleOffset;return {p,from,fromQ:bone.getWorldQuaternion(new T.Quaternion()),q:sample.q.clone()};});}choose('sit_enter',.24);onView('together');}
  if(stage.kind==='rise'){stage.origin??=actor.position.clone();choose('sit_exit',.24);}
  if(stage.kind==='gesture')choose(stage.clip||'relaxed');
 }
 function navigation(dest,finalYaw=0,backwards=false){return [{kind:'orient',dest,backwards,duration:.5},{kind:'walk',dest,backwards,finalYaw},{kind:'orient',yaw:finalYaw,duration:.4}];}
 function hitsSofa(p){
  const intersects=(box,r)=>{const x=T.MathUtils.clamp(p.x,box.min.x,box.max.x),z=T.MathUtils.clamp(p.z,box.min.z,box.max.z);return Math.hypot(p.x-x,p.z-z)<r;};
  if(obstacles.some(box=>intersects(box,.22)))return true;
  if(!sofaBounds)return false;
  const seating=(action==='sit'||action==='drink')&&stage?.backwards&&Math.abs(p.x-preSeat.x)<.08&&p.z>=preSeat.z;
  const distance=position=>Math.hypot(position.x-T.MathUtils.clamp(position.x,sofaBounds.min.x,sofaBounds.max.x),position.z-T.MathUtils.clamp(position.z,sofaBounds.min.z,sofaBounds.max.z));
  const exiting=distance(p)>distance(actor.position)+.0001;
  return !seating&&!exiting&&intersects(sofaBounds,.22);
 }

 // Enter lands on standing idle at home, facing the camera. From there:
 // approach, stepback, beside, stand, pour and sing turn, walk, then an optional gesture, then idle.
 // sit and drink walk to the sofa, play sit, then seated idle. stand and the other moves rise first.
 // Each clip crossfades. A gesture holds its pose for a fixed time, then the next stage starts.
 function motion(id,done){
  if(action&&!paused)return false;
  if(!['approach','stepback','beside','sit','stand','comfort','wave','pour','drink','sing'].includes(id))return false;
  if(paused){paused=false;mixer.timeScale=1;}
  action=id;callback=done;plan=[];
  if(interruption){plan.push(interruption);interruption=null;}
  if(id==='pour'||id==='sing'){
   if(posture==='seated')plan.push({kind:'rise'});
   const dest=id==='pour'?V(.55,0,-.55):V(-.2,0,-1.15);
   const yaw=id==='pour'?Math.atan2(.77,-.36):Math.atan2(-2.22,-1.2);
   const clip=id==='pour'?'pour':'sing';
   plan.push(...navigation(dest,yaw),{kind:'gesture',clip,duration:(actions[clip]||actions.relaxed).getClip().duration});
  }else if(id==='drink'){
   if(posture!=='seated')plan.push(...navigation(staging,0),...navigation(preSeat,0,true),{kind:'sit'});
  }else if(id==='sit'){
   if(posture!=='seated')plan.push(...navigation(staging,0),...navigation(preSeat,0,true),{kind:'sit'});else onView('sofa');
  }else if(id==='comfort'&&posture==='seated'){plan.push({kind:'comfort',duration:4.5});}
  else if(id==='wave'&&posture==='seated'){plan.push({kind:'comfort',duration:2.8});}
  else{
   if(posture==='seated')plan.push({kind:'rise'});
   if(id==='stand')plan.push(...navigation(V(-.72,0,-1.6),0));
   if(id==='approach')plan.push(...navigation(V(0,0,.6),0));
   if(id==='stepback')plan.push(...navigation(home,0));
   if(id==='beside'){plan.push(...navigation(beside,-.24));onView('beside');}
   if(id==='comfort'){plan.push(...navigation(V(0,0,.42),0),{kind:'comfort',duration:4.5});}
   if(id==='wave')plan.push({kind:'gesture',clip:'greet',duration:(actions.greet||actions.relaxed).getClip().duration});
  }
  next();return true;
 }
 function stop(){if(phase==='sit'||phase==='rise'){paused=true;mixer.timeScale=0;interruption={...stage,elapsed:phaseTime};callback=null;plan=[];action=null;return;}paused=false;mixer.timeScale=1;interruption=null;callback=null;plan=[];action=null;stage=null;if(posture!=='seated'){posture='standing';seatedAmount=0;}phase=posture==='seated'?'seated':'idle';choose(idleName());}
 function update(dt){if(paused)return;restore();total+=dt;let pace=1;
  if(stage&&action){phaseTime+=dt;
   if(stage.kind==='orient'){choose(posture==='seated'?'sit_idle':'relaxed');const delta=wrap(stage.yaw-stage.start);actor.rotation.y=stage.start+delta*smooth(phaseTime/stage.duration);if(phaseTime>=stage.duration)next();}
   else if(stage.kind==='walk'){const delta=stage.dest.clone().sub(actor.position);delta.y=0;const dist=delta.length();const travelYaw=Math.atan2(delta.x,delta.z)+(stage.backwards?Math.PI:0);const face=travelYaw;actor.rotation.y+=wrap(face-actor.rotation.y)*(1-Math.exp(-dt*5.5));if(dist<.04){actor.position.x=stage.dest.x;actor.position.z=stage.dest.z;next();}else{const span=Math.max(.08,stage.origin.distanceTo(stage.dest)),u=T.MathUtils.clamp(1-dist/span,0,1);pace=span<.4?1:u<.1?.78+.22*(u/.1):u>.9?.78+.22*((1-u)/.1):1;const candidate=actor.position.clone().addScaledVector(delta.normalize(),Math.min(dist,(stage.backwards?backSpeed:speed)*pace*dt));if(hitsSofa(candidate)){blockedMoves++;stop();}else {gaitDistance+=actor.position.distanceTo(candidate);actor.position.copy(candidate);}}}
   else if(stage.kind==='sit'){seatedAmount=smooth(phaseTime/actions.sit_enter.getClip().duration);actor.position.x=T.MathUtils.lerp(stage.origin.x,seat.x,seatedAmount);actor.position.z=T.MathUtils.lerp(stage.origin.z,seat.z,seatedAmount);if(seatedAmount>=1){posture='seated';next();}}
   else if(stage.kind==='rise'){seatedAmount=1-smooth(phaseTime/actions.sit_exit.getClip().duration);actor.position.x=T.MathUtils.lerp(preSeat.x,stage.origin.x,seatedAmount);actor.position.z=T.MathUtils.lerp(preSeat.z,stage.origin.z,seatedAmount);if(seatedAmount<=0){posture='standing';footPins=null;next();}}
   else if(phaseTime>=stage.duration)next();
  }
  if(!action)choose(idleName());
  if(posture==='standing'&&actions[person.idle])actions[person.idle].setEffectiveTimeScale(person.tempo);
  actions.walk.setEffectiveTimeScale(speed/authoredSpeed*(phase==='walk'&&stage&&!stage.backwards?pace:1));
  if(actions.walk_back)actions.walk_back.setEffectiveTimeScale(backSpeed/(authoredSpeed*.35)*(phase==='walk'&&stage?.backwards?pace:1));
  mixer.update(dt);actor.position.y=seatOffset*seatedAmount;
  for(const b of bones.values())restored.set(b,{q:b.quaternion.clone(),p:b.position.clone()});actor.updateMatrixWorld(true);
  // Licensed idle is a drill stance. Layer a quiet salon weight shift on top:
  // heels down, knees left to the clip, small hip drop, upright chest, breath.
  // Walking replaces the clip's same-side arm swing with an opposite-leg swing.
  const moving=['walk','sit','rise'].includes(phase);
  lifeStand=T.MathUtils.damp(lifeStand,posture==='standing'&&!moving?1:0,4.4,dt);
  lifeSit=T.MathUtils.damp(lifeSit,posture==='seated'&&phase!=='rise'?1:0,4.4,dt);
  walkLife=T.MathUtils.damp(walkLife,phase==='walk'?1:0,6,dt);
  const breath=Math.sin(total*1.55),shift=Math.sin(total*.7),sway=Math.sin(total*.46+.8);
  if(lifeStand>.001&&stableRig){
   const w=lifeStand;
   spin(bones.get('Spine'),V(1,0,0),w*(.012+.014*breath));
   spin(bones.get('Spine01'),V(1,0,0),w*(.008+.01*breath));
   spin(bones.get('Hips'),V(0,0,1),w*(.014*shift));
   spin(bones.get('neck'),V(0,1,0),w*(.03*sway));
   if(speaking)spin(bones.get('Head'),V(0,1,0),Math.sin(total*2.6)*.045);
  }
  if(lifeStand>.001&&!stableRig){
   const w=lifeStand;
   spin(bones.get('Hips'),V(0,0,1),w*(.015+.006*shift));
   spin(bones.get('Hips'),V(1,0,0),w*(-.004+.004*breath));
   spin(bones.get('Hips'),V(0,1,0),w*(.008+.004*sway));
   spin(bones.get('Spine'),V(0,0,1),w*(-.008-.002*shift));
   spin(bones.get('Spine01'),V(0,0,1),w*(-.006));
   spin(bones.get('Spine02'),V(0,0,1),w*(-.004));
   spin(bones.get('Spine'),V(1,0,0),w*(.012+.01*breath));
   spin(bones.get('Spine01'),V(1,0,0),w*(.01+.012*breath));
   spin(bones.get('Spine02'),V(1,0,0),w*(.008+.012*breath));
   spin(bones.get('neck'),V(0,0,1),w*(-.015+.01*sway));
   spin(bones.get('LeftShoulder'),V(1,0,0),w*(.004*breath));
   if(!stableRig)spin(bones.get('RightShoulder'),V(0,0,1),w*.95);
   spin(bones.get('RightShoulder'),V(1,0,0),w*(-.004*breath));
   const hips=bones.get('Hips');if(hips)hips.position.y+=w*.003*breath;
  }
  if(lifeSit>.001&&!stableRig){
   const w=lifeSit;
   spin(bones.get('Spine02'),V(1,0,0),w*(.03+.018*breath));
   spin(bones.get('Spine'),V(0,0,1),w*(.035+.014*shift));
   spin(bones.get('LeftShoulder'),V(1,0,0),w*(.04+.01*breath));
   spin(bones.get('RightShoulder'),V(1,0,0),w*-(.025+.01*breath));
   spin(bones.get('neck'),V(0,0,1),w*-.03);
  }
  if(stableRig&&walkLife>.002){
   // World-space feet avoid assuming the exported rig's local rotation axes.
   // One half-cycle is planted: its backward speed matches actor translation.
   const stride=.50,direction=stage?.backwards?-1:1;
   for(let side=0;side<2;side++){
    const chain=['UpLeg','Leg','Foot'].map(n=>bones.get((side?'Right':'Left')+n));
    if(chain.some(b=>!b))continue;
    const [a,b,c]=chain,rest=standingFeet[side];
    const u=T.MathUtils.euclideanModulo(gaitDistance/stride+side*.5,1);
    const swing=u>=.5,t=swing?(u-.5)*2:u*2;
    const z=swing?T.MathUtils.lerp(-stride/4,stride/4,smooth(t)):T.MathUtils.lerp(stride/4,-stride/4,t);
    const target=actor.localToWorld(rest.p.clone().add(V(0,swing?Math.sin(t*Math.PI)*.045:0,z*direction)));
    const pole=actor.localToWorld(V(rest.p.x,.55,rest.p.z+.5));
    actor.updateMatrixWorld(true);
    const solution=solveJoint(a.getWorldPosition(V()),b.getWorldPosition(V()),c.getWorldPosition(V()),target,pole);
    if(solution){aimBone(a,b,solution.joint,walkLife);aimBone(b,c,solution.end,walkLife);}
    const q=actor.getWorldQuaternion(new T.Quaternion()).multiply(rest.q);
    c.quaternion.slerp(c.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q),walkLife);
   }
  }
  if(stableRig&&posture==='standing'&&phase!=='walk'&&phase!=='gesture'){
   const s=Math.sin(total*(speaking||listening?2.4:1.2));
   spin(bones.get('LeftForeArm'),V(1,0,0),s*.07);
   spin(bones.get('RightForeArm'),V(1,0,0),-s*.1);
   spin(bones.get('RightArm'),V(0,0,1),(listening?0.1:speaking?0.06:0.03)*Math.sin(total*1.6));
  }
  if(walkLife>.001&&!stableRig){
   const w=walkLife;
   spin(bones.get('Spine01'),V(1,0,0),w*(.012+.008*breath));
  }
  actor.updateMatrixWorld(true);
  const wantArms=stableRig?0:phase==='walk'?0:lifeStand>.05&&phase!=='gesture'&&stage?.clip!=='greet'?1:0;
  armLife=T.MathUtils.damp(armLife,wantArms,phase==='walk'?8:5.2,dt);
  if(armLife>.03){
   for(let side=0;side<2;side++){
    const sign=side?-1:1,chain=['Arm','ForeArm','Hand'].map(n=>bones.get((side?'Right':'Left')+n));
    if(chain.some(x=>!x))continue;
    const [a,b,c]=chain,target=actor.localToWorld(V(sign*.09,1.08+.006*breath,.2));
    const pole=actor.localToWorld(V(sign*.32,1.2,0));
    const A=a.getWorldPosition(new T.Vector3()),B=b.getWorldPosition(new T.Vector3()),C=c.getWorldPosition(new T.Vector3());
    const solution=solveJoint(A,B,C,target,pole);
    if(solution){aimBone(a,b,solution.joint,armLife);aimBone(b,c,target,armLife);}
   }
  }
  if(!stableRig&&phase==='walk'&&walkLife>.02){
   const lf=actor.worldToLocal(bones.get('LeftFoot').getWorldPosition(V())),rf=actor.worldToLocal(bones.get('RightFoot').getWorldPosition(V()));
   const lead=T.MathUtils.clamp((lf.z-rf.z)/.42,-1,1);
   armPhase+=(lead-armPhase)*(1-Math.exp(-dt*8));
   const weight=walkLife;
   for(let side=0;side<2;side++){
    const sign=side?-1:1,chain=['Arm','ForeArm','Hand'].map(n=>bones.get((side?'Right':'Left')+n));
    if(chain.some(x=>!x))continue;
    const along=(side?armPhase:-armPhase)*.12;
    const reach=.28+Math.max(0,-along)*.35;
    const [a,b,c]=chain,target=actor.localToWorld(V(sign*reach,.96+Math.max(0,along)*.12,.1+along));
    const pole=actor.localToWorld(V(sign*.42,1.08,.04));
    const A=a.getWorldPosition(new T.Vector3()),B=b.getWorldPosition(new T.Vector3()),C=c.getWorldPosition(new T.Vector3());
    const solution=solveJoint(A,B,C,target,pole);
    if(solution){aimBone(a,b,solution.joint,weight);aimBone(b,c,solution.end,weight);}
   }
   armCarry=1;for(const name of ['LeftArm','LeftForeArm','RightArm','RightForeArm']){const bone=bones.get(name);if(bone)carried.set(name,bone.quaternion.clone());}
  }else if(armCarry>.02){
   for(const [name,q] of carried){const bone=bones.get(name);if(bone)bone.quaternion.slerp(q,armCarry);}
   armCarry=T.MathUtils.damp(armCarry,0,6,dt);
  }
  const armStep=(12*Math.PI/180)*(dt*60);
  for(const name of ['LeftArm','LeftForeArm','RightArm','RightForeArm']){
   const bone=bones.get(name);if(!bone)continue;
   const prev=carried.get('ease:'+name);
   if(prev&&armStep>0){const ang=prev.angleTo(bone.quaternion);if(ang>armStep)bone.quaternion.copy(prev).slerp(bone.quaternion,armStep/ang);}
   else if(prev&&armStep===0)bone.quaternion.copy(prev);
   carried.set('ease:'+name,bone.quaternion.clone());bone.updateWorldMatrix(false,true);
  }
  const cw=action==='comfort'?Math.sin(Math.PI*Math.min(1,phaseTime/(stage?.duration||4.5))):0;comfort+=((cw||0)-comfort)*(1-Math.exp(-dt*5));
  const chest=bones.get('Spine');if(!stableRig&&chest&&comfort>.001){chest.quaternion.multiply(new T.Quaternion().setFromAxisAngle(V(0,0,1),(posture==='seated'?.1:.055)*comfort));chest.updateWorldMatrix(false,true);}
  // Turn the body first at rest; constrain the neck in torso space.
  // The previous unconstrained aim could twist the head behind the shoulders.
  const head=bones.get('Head'),tip=bones.get('headfront');
  const gazeActive=true;gazeWeight=T.MathUtils.damp(gazeWeight,1,9,dt);
  if(stableRig&&head){
   const parentQ=head.parent.getWorldQuaternion(new T.Quaternion());
   const headPos=head.getWorldPosition(new T.Vector3());
   const toCam=camera.position.clone().sub(headPos).applyQuaternion(parentQ.clone().invert());
   const face=tip?tip.getWorldPosition(new T.Vector3()).sub(headPos).applyQuaternion(parentQ.clone().invert()):V(0,0,1);
   const yaw=Math.atan2(toCam.x,toCam.z)-Math.atan2(face.x,face.z);
   const pitch=Math.atan2(toCam.y,Math.hypot(toCam.x,toCam.z))-Math.atan2(face.y,Math.hypot(face.x,face.z));
   const glance=listening||speaking?1:.82;
   const targetYaw=T.MathUtils.clamp(yaw,-.5,.5)*glance+Math.sin(total*.55)*.015;
   const targetPitch=T.MathUtils.clamp(pitch,-.12,.22)*glance-0.1+Math.sin(total*.33)*.015;
   gazeYaw+=(targetYaw-gazeYaw)*(1-Math.exp(-dt*7));
   gazePitch+=(targetPitch-gazePitch)*(1-Math.exp(-dt*7));
   head.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(gazePitch,gazeYaw,0,'YXZ')));
   const look=root.userData.faceLook;
   if(look){head.updateWorldMatrix(true,false);head.getWorldPosition(look.uHead.value);const q=head.getWorldQuaternion(new T.Quaternion());look.uRight.value.set(1,0,0).applyQuaternion(q);look.uUp.value.set(0,1,0).applyQuaternion(q);look.uFwd.value.set(0,0,1).applyQuaternion(q);}
   if(gazeActive&&!action&&posture==='standing'){
    const desired=Math.atan2(camera.position.x-actor.position.x,camera.position.z-actor.position.z);
    actor.rotation.y+=wrap(desired-actor.rotation.y)*(1-Math.exp(-dt*(listening?3.2:1.6)));actor.updateMatrixWorld(true);
   }
  }
  if(!stableRig&&head&&tip&&gazeWeight>.001){
   if(gazeActive&&!action&&posture==='standing'){
    const desired=Math.atan2(camera.position.x-actor.position.x,camera.position.z-actor.position.z);
    actor.rotation.y+=wrap(desired-actor.rotation.y)*(1-Math.exp(-dt*1.4));actor.updateMatrixWorld(true);
   }
   if(!stableRig){
   const player=actor.worldToLocal(camera.position.clone()),yaw=Math.atan2(player.x,player.z);
   const chest=bones.get('Spine');if(chest){const turn=T.MathUtils.clamp(yaw,-.26,.26)*(speaking?1:.7)*gazeWeight,q=new T.Quaternion().setFromAxisAngle(V(0,1,0),turn).multiply(chest.getWorldQuaternion(new T.Quaternion()));chest.quaternion.copy(chest.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));chest.updateWorldMatrix(false,true);}
   const H=head.getWorldPosition(new T.Vector3()),bodyQ=actor.getWorldQuaternion(new T.Quaternion()),direction=camera.position.clone().sub(H).applyQuaternion(bodyQ.clone().invert());
   const requestedYaw=Math.atan2(direction.x,direction.z),requestedPitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
   const limitYaw=T.MathUtils.clamp(requestedYaw,-.95,.95),limitPitch=T.MathUtils.clamp(requestedPitch,-.32,.30);
   gazeLimited=Math.abs(requestedYaw-limitYaw)>.03||Math.abs(requestedPitch-limitPitch)>.03;
   gazeYaw+=(limitYaw-gazeYaw)*(1-Math.exp(-dt*7));gazePitch+=(limitPitch-gazePitch)*(1-Math.exp(-dt*7));
   const target=V(Math.sin(gazeYaw)*Math.cos(gazePitch),Math.sin(gazePitch),Math.cos(gazeYaw)*Math.cos(gazePitch)).applyQuaternion(bodyQ).multiplyScalar(2).add(H);
   aimBone(head,tip,target,gazeWeight);
   }
  }
  for(let side=0;side<2;side++){
   if(!sensors.feet[side].length)continue;
   const chain=['UpLeg','Leg','Foot'].map(n=>bones.get((side?'Right':'Left')+n));if(chain.some(x=>!x))continue;actor.updateMatrixWorld(true);
   const [a,b,c]=chain,A=a.getWorldPosition(new T.Vector3()),B=b.getWorldPosition(new T.Vector3()),C=c.getWorldPosition(new T.Vector3());let target,q;
   if(footPins){const blend=smooth(seatedAmount/.35),gap=Math.min(...sensors.feet[side].map(s=>point(s).y))-.018;const floorTarget=C.clone().add(V(0,T.MathUtils.clamp(-gap,0,.08),0));target=floorTarget.lerp(footPins[side].from.clone().lerp(footPins[side].p,smooth(seatedAmount/.4)),blend);q=c.getWorldQuaternion(new T.Quaternion()).slerp(footPins[side].q,blend);maxFootReachError=Math.max(maxFootReachError,Math.max(0,A.distanceTo(target)-A.distanceTo(B)-B.distanceTo(C)));}
   else{const gap=Math.min(...sensors.feet[side].map(s=>point(s).y))-.018;const correction=T.MathUtils.clamp(-gap,0,.08);if(correction<.00001)continue;target=C.clone().add(V(0,correction,0));q=c.getWorldQuaternion(new T.Quaternion());}
   const solution=solveJoint(A,B,C,target,B.clone());if(solution){aimBone(a,b,solution.joint);aimBone(b,c,solution.end);c.quaternion.copy(c.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));c.updateWorldMatrix(false,true);}
  }

  const hip=bones.get('Hips');if(hip){const p=actor.worldToLocal(hip.getWorldPosition(V()));const pins={'host-apron':[0,0,0,0],'host-necklace':[0,.4,.08,1.15]};for(const [name,o]of Object.entries(pins)){const prop=actor.getObjectByName(name);if(prop){prop.position.set(p.x+o[0],p.y+o[1],p.z+o[2]);prop.rotation.set(o[3],0,0);}}}
  // Bounded torso clearance for wrists; garment simulation still requires asset work.
  if(stableRig){
   const chest=bones.get('Spine01'),hips=bones.get('Hips');
   if(chest&&hips)for(const side of ['Left','Right']){
    const [a,b,c]=['Arm','ForeArm','Hand'].map(n=>bones.get(side+n));if(!a||!b||!c)continue;
    actor.updateMatrixWorld(true);
    const h=actor.worldToLocal(hips.getWorldPosition(V())),top=actor.worldToLocal(chest.getWorldPosition(V()));
    const center=h.clone().lerp(top,.55),hand=actor.worldToLocal(c.getWorldPosition(V())),d=hand.clone().sub(center);
    const radius=V(.23,Math.max(.24,Math.abs(top.y-h.y)*.8),.19);
    const norm=d.clone().divide(radius),length=norm.length();
    if(length>=1||length<.001)continue;
    const correction=norm.normalize().multiply(radius).add(center).sub(hand).clampLength(0,.025);
    const target=actor.localToWorld(hand.add(correction)),A=a.getWorldPosition(V()),B=b.getWorldPosition(V()),C=c.getWorldPosition(V());
    const solution=solveJoint(A,B,C,target,B.clone());
    if(solution){aimBone(a,b,solution.joint);aimBone(b,c,solution.end);}
   }
  }



 }
 function setHost(id){person=people[id]||people.mira;if(!action)choose(idleName());}
 return {motion,stop,update,setHost,setSpeaking:v=>speaking=v,setListening:v=>listening=v,diagnostics:()=>({action,phase,posture,paused,seatedAmount,position:actor.position.toArray(),clip:current.getClip().name,clipTime:current.time,personality:person.idle,tempo:person.tempo,clipUUIDs:clips.map(c=>c.uuid),clips:clips.map(c=>c.name),motionSource:data.source,walkSpeed:speed,authoredSpeed,walkTimeScale:actions.walk.timeScale,seatY,seatOffset,blockedMoves,maxFootReachError,maxHandClearance,speaking,listening,handClearance:(()=>{const chest=bones.get('Spine02'),left=bones.get('LeftHand'),right=bones.get('RightHand');if(!chest||!left||!right)return null;const c=chest.getWorldPosition(new T.Vector3());return Math.min(left.getWorldPosition(new T.Vector3()).distanceTo(c),right.getWorldPosition(new T.Vector3()).distanceTo(c));})(),footSpread:(()=>{const l=bones.get('LeftFoot'),r=bones.get('RightFoot');if(!l||!r)return null;const a=l.getWorldPosition(new T.Vector3()),b=r.getWorldPosition(new T.Vector3());return Math.hypot(a.x-b.x,a.z-b.z);})(),gazeLimited,gazeYawDegrees:gazeYaw*180/Math.PI,gazePitchDegrees:gazePitch*180/Math.PI,gazeErrorDegrees:(()=>{const h=bones.get('Head'),t=bones.get('headfront');if(!h||!t)return null;const a=h.getWorldPosition(new T.Vector3());return t.getWorldPosition(new T.Vector3()).sub(a).angleTo(camera.position.clone().sub(a))*180/Math.PI;})(),poseLife:{stand:lifeStand,sit:lifeSit,arms:armLife,walk:walkLife},handContactMode:"authored-pose; garment collision not certified",fingerBones:[...bones.keys()].filter(n=>/(Thumb|Index|Middle|Ring|Little)[123]$/.test(n)).length,seatSensorCount:sensors.seat.length,footSensors:sensors.feet.map(a=>a.length),contactFootMinY:sensors.feet.map(a=>Math.min(...a.map(s=>point(s).y)))})};
}
