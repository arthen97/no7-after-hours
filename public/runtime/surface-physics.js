import * as T from '../vendor/three.module.js';

// Conservative static rigid-body placement. The complete rotated AABB footprint
// must be supported; never use the object's origin as its contact point.
export function solveSupport(object, surface, occupied = [], gap = .002) {
  object.updateWorldMatrix(true, true);
  surface.updateWorldMatrix(true, true);
  const bounds = new T.Box3().setFromObject(object);
  if (bounds.isEmpty()) return null;
  const ray = new T.Raycaster();
  const surfaceBounds = new T.Box3().setFromObject(surface);
  const heights = [];
  for (const x of [bounds.min.x - gap, bounds.max.x + gap]) {
    for (const z of [bounds.min.z - gap, bounds.max.z + gap]) {
      ray.set(new T.Vector3(x, surfaceBounds.max.y + 1, z), new T.Vector3(0, -1, 0));
      const hit = ray.intersectObject(surface, true)[0];
      if (!hit || !hit.face) return null;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (normal.y < .98) return null;
      heights.push(hit.point.y);
    }
  }
  if (Math.max(...heights) - Math.min(...heights) > .002) return null;
  const supportY = Math.max(...heights);
  const dy = supportY - bounds.min.y;
  bounds.translate(new T.Vector3(0, dy, 0));
  const expanded = bounds.clone().expandByVector(new T.Vector3(.008, 0, .008));
  if (occupied.some(other => expanded.intersectsBox(other))) return null;
  return {y: object.position.y + dy, supportY, bounds, gap: 0};
}

export function settleBody(body, dt) {
  if (body.sleeping) return;
  body.velocity -= 9.81 * Math.min(dt, .05);
  body.object.position.y += body.velocity * Math.min(dt, .05);
  if (body.object.position.y <= body.y) {
    body.object.position.y = body.y;
    body.velocity = 0;
    body.sleeping = true; // Inelastic placement on a static support.
  }
}
