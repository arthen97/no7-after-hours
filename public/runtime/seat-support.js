import * as T from '../vendor/three.module.js';
/** Cache a cushion height field; preserve exact ray queries at its boundary. */
export function createSeatSupport(sofa,seatY){
 const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0)),cache=new Map(),cell=.02;
 const exact=(x,z)=>{ray.ray.origin.set(x,2,z);return ray.intersectObject(sofa,true).find(h=>h.point.y<seatY+.1&&h.point.y>seatY-.15)?.point.y;};
 const sample=(x,z)=>{const key=x+':'+z;if(!cache.has(key))cache.set(key,exact(x*cell,z*cell));return cache.get(key);};
 const support=(x,z)=>{const gx=x/cell,gz=z/cell,ix=Math.floor(gx),iz=Math.floor(gz),a=sample(ix,iz),b=sample(ix+1,iz),c=sample(ix,iz+1),d=sample(ix+1,iz+1);if([a,b,c,d].every(v=>!Number.isFinite(v)))return undefined;if([a,b,c,d].some(v=>!Number.isFinite(v)))return exact(x,z);return T.MathUtils.lerp(T.MathUtils.lerp(a,b,gx-ix),T.MathUtils.lerp(c,d,gx-ix),gz-iz);};
 support.exact=exact;support.diagnostics=()=>({cellMeters:cell,cachedSamples:cache.size});return support;
}
