import * as T from '../vendor/three.module.js';

// Procedural Mira built from the front plate (img2threejs projection route).
// The face is the plate itself, painted on the head's own surface. The gown,
// limbs, and hair are surfaces of revolution and capsules in the plate's
// proportions. One photo hides the back and the far side of the slit, so
// those are the front view continued around. Bone rest is identity; the
// Meshy clips belong to the other skeleton and are not played here.

const SKIN = '#e9a389';
const WINE = '#6e1436';
const HAIR = '#c6a36a';
const GOLD = '#c8b08a';

function bone(name, parent, x, y, z) {
  const b = new T.Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

function part(geo, material, parent) {
  const mesh = new T.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function tube(parent, length, radiusTop, radiusBottom, material) {
  const mesh = part(new T.CylinderGeometry(radiusTop, radiusBottom, length, 18), material, parent);
  mesh.position.y = -length / 2;
  return mesh;
}

function revolve(rings, material, parent) {
  const segs = rings[0].segs;
  const positions = [];
  const uvs = [];
  const index = [];
  rings.forEach((ring, i) => {
    for (let j = 0; j <= segs; j++) {
      const t = j / segs;
      const a = ring.a0 + (ring.a1 - ring.a0) * t;
      const back = Math.max(0, -Math.cos(a));
      const front = Math.max(0, Math.cos(a));
      const spread = 1 + (ring.flare || 0) * back;
      positions.push(
        Math.sin(a) * ring.rx * spread,
        ring.y - (ring.drop || 0) * front - (ring.train || 0) * back,
        Math.cos(a) * ring.rz * spread
      );
      uvs.push(t, i / Math.max(1, rings.length - 1));
    }
  });
  const row = segs + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * row + j;
      index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return part(geo, material, parent);
}

function full(y, rx, rz, extra = {}) {
  return { y, rx, rz, a0: 0, a1: Math.PI * 2, segs: 36, ...extra };
}

function restMotion() {
  const names = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
  const clips = ['idle', 'relaxed', 'talk', 'greet', 'walk', 'walk_back', 'sit_enter', 'sit_exit', 'sit_idle', 'sit_talk', 'pour', 'sing'].map(name => {
    const duration = name.startsWith('sit_') ? 1.2 : 2;
    return {
      name,
      uuid: 'img2-' + name,
      duration,
      tracks: names.map(joint => ({ name: joint + '.quaternion', type: 'quaternion', times: [0, duration], values: [0, 0, 0, 1, 0, 0, 0, 1] }))
    };
  });
  return {
    source: 'img2threejs procedural rest pose. The face is projected from the Mira plate. Meshy clips are not used on this skeleton.',
    report: [{ clip: 'walk', authoredSpeedMps: .8 }],
    clips
  };
}

export function createImg2Mira(faceMap) {
  faceMap.colorSpace = T.SRGBColorSpace;
  faceMap.anisotropy = 8;
  faceMap.needsUpdate = true;
  const root = new T.Group();
  root.name = 'img2-mira';
  const skin = new T.MeshStandardMaterial({ color: SKIN, roughness: .46 });
  const gown = new T.MeshPhysicalMaterial({ color: WINE, roughness: .18, metalness: .02, clearcoat: .45, clearcoatRoughness: .22 });
  const hair = new T.MeshStandardMaterial({ color: HAIR, roughness: .52 });
  const gold = new T.MeshStandardMaterial({ color: GOLD, roughness: .35, metalness: .45 });
  const face = new T.MeshStandardMaterial({ map: faceMap, roughness: .5 });

  const hips = bone('Hips', root, 0, .92, 0);
  const spine = bone('Spine', hips, 0, .08, 0);
  const spine01 = bone('Spine01', spine, 0, .14, 0);
  const spine02 = bone('Spine02', spine01, 0, .14, 0);
  const neck = bone('neck', spine02, 0, .11, 0);
  const head = bone('Head', neck, 0, .08, 0);

  const headMesh = part(new T.SphereGeometry(.11, 64, 48), face, head);
  headMesh.scale.set(.94, 1.08, .98);
  headMesh.position.y = .02;
  const bun = part(new T.SphereGeometry(.055, 20, 16), hair, head);
  bun.position.set(0, .12, -.03);
  bun.scale.set(1.1, .7, .95);

  const neckMesh = part(new T.CylinderGeometry(.048, .058, .07, 16), skin, neck);
  neckMesh.position.y = -.02;

  const gownRings = [
    [.48, .09, .07, .18],
    [.4, .15, .12, .1],
    [.3, .138, .108, .04],
    [.18, .112, .09, 0],
    [.06, .155, .125, 0],
    [-.12, .162, .13, 0],
    [-.34, .155, .125, 0],
    [-.62, .16, .13, 0],
    [-.88, .2, .16, 0]
  ];
  revolve(gownRings.map(([y, rx, rz, drop]) => full(y, rx, rz, { drop, flare: y < -.5 ? .45 : 0, train: y < -.7 ? .06 : 0 })), gown, hips);

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Left' : 'Right';
    const shoulder = bone(label + 'Shoulder', spine02, side * .11, .02, 0);
    const arm = bone(label + 'Arm', shoulder, side * .045, -.02, .01);
    const cap = part(new T.SphereGeometry(.033, 16, 12), skin, arm);
    tube(arm, .28, .032, .026, skin);
    const fore = bone(label + 'ForeArm', arm, 0, -.26, 0);
    tube(fore, .24, .026, .02, skin);
    const hand = bone(label + 'Hand', fore, 0, -.22, 0);
    const palm = part(new T.SphereGeometry(.022, 12, 10), skin, hand);
    palm.scale.set(.9, 1.3, .55);
    palm.position.y = -.02;

    const up = bone(label + 'UpLeg', hips, side * .07, -.04, -.02);
    tube(up, .4, .05, .042, side > 0 ? skin : gown);
    const leg = bone(label + 'Leg', up, 0, -.38, 0);
    tube(leg, .4, .04, .03, side > 0 ? skin : gown);
    const foot = bone(label + 'Foot', leg, 0, -.4, .02);
    const shoe = part(new T.BoxGeometry(.07, .035, .16), gold, foot);
    shoe.position.set(0, -.02, .05);
    const strap = part(new T.BoxGeometry(.072, .012, .02), gold, foot);
    strap.position.set(0, .01, .02);
    bone(label + 'ToeBase', foot, 0, 0, .1);
  }
  return root;
}

export function img2MiraMotion() {
  return restMotion();
}
