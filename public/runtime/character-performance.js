import * as THREE from '../vendor/three.module.js';

const up = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

/** Geometric two-bone solve, independent of a particular export's bone axes. */
export function solveJoint(a, b, c, target, pole) {
  const upper = a.distanceTo(b), lower = b.distanceTo(c);
  if (upper < 1e-6 || lower < 1e-6) return null;
  const direction = target.clone().sub(a), rawDistance = direction.length();
  if (rawDistance < 1e-6) return null;
  direction.divideScalar(rawDistance);
  const distance = clamp(rawDistance, Math.abs(upper - lower) + 1e-5, upper + lower - 1e-5);
  const side = pole.clone().sub(a).addScaledVector(direction, -pole.clone().sub(a).dot(direction));
  if (side.lengthSq() < 1e-8) side.crossVectors(direction, Math.abs(direction.y) < .9 ? up : new THREE.Vector3(1, 0, 0));
  side.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  return { joint: a.clone().addScaledVector(direction, along).addScaledVector(side, Math.sqrt(Math.max(0, upper * upper - along * along))),
    end: a.clone().addScaledVector(direction, distance), reachable: rawDistance <= upper + lower && rawDistance >= Math.abs(upper - lower) };
}

export function aimBone(bone, child, target, weight = 1) {
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const from = child.getWorldPosition(new THREE.Vector3()).sub(origin);
  const to = target.clone().sub(origin);
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
  const desired = delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  desired.premultiply(parent.invert());
  bone.quaternion.slerp(desired, weight); bone.updateWorldMatrix(false, true);
}

function solveChain(chain, target, pole, weight = 1) {
  if (chain.some(b => !b)) return;
  const [a, b, c] = chain;
  a.updateWorldMatrix(true, true);
  const solution = solveJoint(a.getWorldPosition(new THREE.Vector3()), b.getWorldPosition(new THREE.Vector3()), c.getWorldPosition(new THREE.Vector3()), target, pole);
  if (!solution) return;
  aimBone(a, b, solution.joint, weight); aimBone(b, c, solution.end, weight);
}

/** Overlays are restored before mixer evaluation, preventing cumulative pose drift. */
export function createCharacterPerformance(root, actor, { groundHeight, groundSupported = () => true, variant = 'elias' } = {}) {
  const bones = new Map(); root.traverse(o => { if (o.isBone) bones.set(o.name, o); });
  const arms = ['Left', 'Right'].map(side => ['Arm', 'ForeArm', 'Hand'].map(part => bones.get(side + part)));
  const legs = ['Left', 'Right'].map(side => ['UpLeg', 'Leg', 'Foot'].map(part => bones.get(side + part)));
  const head = bones.get('Head'), headTip = bones.get('headfront');
  const footSensors = [[],[]]; root.updateWorldMatrix(true,true);
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const weights=mesh.geometry.getAttribute('skinWeight'),indices=mesh.geometry.getAttribute('skinIndex'),positions=mesh.geometry.getAttribute('position');
    const candidates=[[],[]];
    for(let i=0;i<positions.count;i++) for(let side=0;side<2;side++) {
      let weight=0;
      for(let j=0;j<4;j++){const name=mesh.skeleton.bones[indices.array[i*4+j]]?.name??'';if(name===(side?'RightFoot':'LeftFoot')||name===(side?'RightToeBase':'LeftToeBase'))weight+=weights.array[i*4+j];}
      if(weight<.6)continue;
      const point=mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(positions,i)).applyMatrix4(mesh.matrixWorld);
      candidates[side].push({mesh,index:i,y:point.y});
    }
    for(let side=0;side<2;side++) {
      const points=candidates[side];if(!points.length)continue;
      const min=Math.min(...points.map(p=>p.y)),sole=points.filter(p=>p.y<min+.032);
      for(let i=0;i<sole.length;i+=Math.max(1,Math.floor(sole.length/24)))footSensors[side].push(sole[i]);
    }
  });
  const restored = new Map(), locks = [null, null];
  let time = variant === 'owen' ? 3.1 : 0, work = 0, greet = 0, idle = 0, gaze = 0, footCorrections = 0, comfort = 0;
  const local = (x, y, z) => actor.localToWorld(new THREE.Vector3(x, y, z));
  const remember = () => { restored.clear(); for (const bone of bones.values()) restored.set(bone, bone.quaternion.clone()); };
  function restore() { for (const [bone, q] of restored) bone.quaternion.copy(q); }
  return {
    restore,
    update(dt, { activity = 'idle', speed = 0, player, speaking = false, heldSeconds = 0 } = {}) {
      time += dt; remember(); actor.updateWorldMatrix(true, true);
      const blend = 1 - Math.exp(-dt * 5);
      // Only the first second of a greeting raises the hand; conversations don't loop waves.
      work += ((activity === 'work' || activity === 'inspect' ? 1 : 0) - work) * blend;
      comfort += ((activity === 'comfort' && heldSeconds < 4.3 ? 1 : 0) - comfort) * blend;
      greet += ((activity === 'greet' && heldSeconds < 1.6 ? 1 : 0) - greet) * blend;
      idle += ((speed < .12 ? 1 : 0) - idle) * blend;
      for (let i = 0; i < arms.length; i++) {
        const side = i === 0 ? 1 : -1;
        const target = new THREE.Vector3(side * (variant==='mira'?.23:.245), (variant==='mira'?.79:1.025) + Math.sin(time * 1.1 + i) * .006, .065);
        // Hands meet a small handheld field object, rather than hammering empty space.
        target.lerp(new THREE.Vector3(side * .10, 1.17 + (i ? Math.sin(time * 1.7) * .008 : 0), .22), work);
        if (i === 1) target.lerp(new THREE.Vector3(-.34, 1.32, .22), greet * .75);
        if(variant==='mira')target.lerp(i===0?new THREE.Vector3(.23,1.04,.25):new THREE.Vector3(-.24,.87,.14),comfort);
        const armWeight=variant==='mira'?Math.max(greet,comfort*.65)*.96:idle*.96;
        solveChain(arms[i], actor.localToWorld(target), local(side * .40, 1.05, -.06), armWeight);
        const hand=arms[i][2];
        if(hand&&work>.001){
          const world=hand.getWorldQuaternion(new THREE.Quaternion()),direction=new THREE.Vector3(0,1,0).applyQuaternion(world);
          const forward=new THREE.Vector3(0,0,1).applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion()));
          const desired=new THREE.Quaternion().setFromUnitVectors(direction,forward).multiply(world);
          desired.premultiply(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert());hand.quaternion.slerp(desired,work*.7);
        }
      }
      const nearby = player && player.distanceTo(actor.position) < 4.6;
      gaze += ((nearby && (speaking || activity === 'greet' || activity === 'comfort') ? 1 : 0) - gaze) * (1 - Math.exp(-dt * 3));
      if (head && headTip) {
        const target = local(Math.sin(time * .23) * .28, 1.60, 2).lerp(local(0,1.17,.55),work*.85);
        if (nearby) {
          const p = actor.worldToLocal(player.clone());
          const yaw = clamp(Math.atan2(p.x, p.z), -.60, .60);
          target.lerp(local(Math.sin(yaw) * 2, 1.59 + (speaking ? Math.sin(time * 2.5) * .015 : 0), Math.cos(yaw) * 2), gaze);
        }
        aimBone(head, headTip, target, Math.min(.85,.30 + gaze * .35 + work * .4));
      }
      footCorrections = 0;
      if (groundHeight) for (let i = 0; i < legs.length; i++) {
        const foot = legs[i][2]; if (!foot) continue;
        actor.updateWorldMatrix(true, true);
        const p = foot.getWorldPosition(new THREE.Vector3());
        const surface = groundHeight(p.x, p.z);
        if (!groundSupported(p.x, p.z)) { locks[i] = null; continue; }
        let soleGap=Infinity;
        for(const sensor of footSensors[i]) {
          const point=sensor.mesh.applyBoneTransform(sensor.index,new THREE.Vector3().fromBufferAttribute(sensor.mesh.geometry.getAttribute('position'),sensor.index)).applyMatrix4(sensor.mesh.matrixWorld);
          soleGap=Math.min(soleGap,point.y-groundHeight(point.x,point.z));
        }
        if(!Number.isFinite(soleGap))continue;
        const grounded = soleGap < .045;
        if (speed < .12 || !grounded) locks[i] = null;
        else if (!locks[i] || locks[i].distanceTo(p) > .18) locks[i] = p.clone();
        const target = locks[i]?.clone() ?? p.clone();
        // Limit correction to gentle terrain. Steep steps require a separate climbing animation.
        target.y = p.y + clamp(.003 - soleGap, -.055, .055) * (grounded || speed < .12 ? 1 : 0);
        if (target.distanceToSquared(p) > 1e-7) {
          const orientation=foot.getWorldQuaternion(new THREE.Quaternion());
          solveChain(legs[i], target, local(i === 0 ? .10 : -.10, .5, .5), 1);
          foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
          foot.updateWorldMatrix(false,true);footCorrections++;
        }
      }
    },
    getStatus: () => ({ armPose: work > .5 ? 'examining-handheld-object' : greet > .25 ? 'brief-greeting' : idle > .5 ? 'relaxed-arms' : 'walking', footCorrections, gazeWeight: gaze, correction: 'bounded two-bone terrain contact; not a full locomotion solver' })
  };
}
