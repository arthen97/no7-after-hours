import * as T from '../vendor/three.module.js';

const playlist=[
 {title:'Kabukicho nights',file:'kabukicho.jpg',color:'#f45b98'},
 {title:'Velvet revue',file:'velvet-revue.jpg',color:'#ef905d'},
 {title:'Night fever',file:'midnight-stage.jpg',color:'#957bff'}
];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
export function createKtvScreen({bezel,width=2.02,height=1.136,scene}){
 const loader=new T.TextureLoader(),textures=[],panels=[],materials=[];
 let index=0,elapsed=0,paused=reduced.matches,loaded=false,failed=false;
 const geometry=new T.PlaneGeometry(width,height);
 for(let i=0;i<2;i++){
  const material=new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:i===0?1:0,toneMapped:false,depthWrite:false});
  const panel=new T.Mesh(geometry,material);panel.position.z=.031+i*.001;panel.renderOrder=2+i;bezel.add(panel);panels.push(panel);materials.push(material);
 }
 const ambient=new T.RectAreaLight(playlist[0].color,.65,width,height);scene.add(ambient);bezel.updateWorldMatrix(true,false);ambient.position.copy(bezel.getWorldPosition(new T.Vector3()));ambient.position.x+=.05;ambient.lookAt(ambient.position.clone().add(new T.Vector3(1,0,0)));
 const rail=new T.Mesh(new T.PlaneGeometry(width-.09,.009),new T.MeshBasicMaterial({color:'#ffc6da',transparent:true,opacity:.75,toneMapped:false}));rail.position.set(0,-height/2+.025,.035);rail.renderOrder=4;bezel.add(rail);
 function frameTexture(texture,zoom=1.02,pan=0){const repeat=1/zoom;texture.repeat.set(repeat,repeat);texture.offset.set((1-repeat)/2+pan*(1-repeat)*.35,(1-repeat)/2);}
 function assign(){if(!loaded)return;for(let i=0;i<2;i++){const texture=textures[(index+i)%textures.length],ratio=texture.image.width/texture.image.height;materials[i].map=texture;materials[i].needsUpdate=true;panels[i].scale.set(Math.min(1,ratio/(width/height)),Math.min(1,(width/height)/ratio),1);}ambient.color.set(playlist[index].color);}
 const ready=Promise.all(playlist.map(item=>loader.loadAsync('./assets/ktv/'+item.file))).then(images=>{
  for(const texture of images){texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;frameTexture(texture);textures.push(texture);}loaded=true;assign();
 }).catch(()=>{failed=true;panels.forEach(p=>p.visible=false);rail.visible=false;});
 function next(){if(!loaded)return;index=(index+1)%textures.length;elapsed=0;materials[1].opacity=0;assign();}
 function update(dt){if(!loaded)return;if(!paused&&!document.hidden)elapsed+=dt;if(elapsed>=12){elapsed%=12;index=(index+1)%textures.length;assign();}const phase=elapsed/12;frameTexture(textures[index],reduced.matches?1:1.01+.015*phase,reduced.matches?0:phase-.5);frameTexture(textures[(index+1)%textures.length],reduced.matches?1:1.01,0);materials[1].opacity=reduced.matches?0:T.MathUtils.smoothstep(elapsed,10.5,12);rail.scale.x=Math.max(.002,phase);rail.position.x=-(width-.09)*(1-rail.scale.x)/2;}
 return {ready,update,next,toggle(){paused=!paused;return paused;},setDim(dim){ambient.intensity=dim?.3:.65;},status:()=>({title:playlist[index].title,paused,loaded,failed})};
}

export function createDiscoBall({scene,architecture}){
 const group=new T.Group();group.name='KTV central mirror ball';group.position.set(0,2.78,-.8);scene.add(group);
 const radius=.27,core=new T.Mesh(new T.SphereGeometry(radius,32,20),new T.MeshStandardMaterial({color:'#404452',metalness:1,roughness:.12}));group.add(core);
 const cable=new T.Mesh(new T.CylinderGeometry(.007,.007,.25,8),new T.MeshStandardMaterial({color:'#24232c',metalness:.9,roughness:.3}));cable.position.y=.395;group.add(cable);
 const cap=new T.Mesh(new T.CylinderGeometry(.065,.065,.018,20),new T.MeshStandardMaterial({color:'#282430',metalness:.8,roughness:.25}));cap.position.y=.52;group.add(cap);
 const rows=14,columns=28,dummy=new T.Object3D();
 const mirror=new T.MeshStandardMaterial({color:'#d9e1ed',metalness:1,roughness:.12,envMapIntensity:2.4,emissive:'#9389bc',emissiveIntensity:.12});
 const tiles=new T.InstancedMesh(new T.PlaneGeometry(.049,.049),mirror,rows*columns);tiles.name='Individual mirror facets';group.add(tiles);
 let k=0;for(let row=0;row<rows;row++){const phi=(row+.5)/rows*Math.PI;for(let col=0;col<columns;col++){const theta=col/columns*Math.PI*2;dummy.position.set(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)).multiplyScalar(radius+.003);dummy.lookAt(dummy.position.clone().multiplyScalar(2));dummy.scale.set(Math.max(.15,Math.sin(phi)),1,1);dummy.updateMatrix();tiles.setMatrixAt(k,dummy.matrix);tiles.setColorAt(k,new T.Color().setHSL(.58+Math.sin(k*1.7)*.08,.12,.62+(k%5)*.065));k++;}}
 tiles.instanceMatrix.needsUpdate=true;
 const spotLights=[];for(const [color,x,z]of [['#ff659d',-2.5,1.3],['#8c8bff',2.5,-2.7]]){const light=new T.SpotLight(color,12,8,.14,.7,1.5);light.position.set(x,3.05,z);light.target=group;scene.add(light);spotLights.push(light);}
 // Stylized reflected light patches are ray-anchored to the actual architecture.
 // They are not extra point lights or a real-time ray-traced reflection simulation.
 const spriteCanvas=document.createElement('canvas');spriteCanvas.width=spriteCanvas.height=64;const ctx=spriteCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,31);gradient.addColorStop(0,'rgba(255,255,255,.95)');gradient.addColorStop(.22,'rgba(255,255,255,.8)');gradient.addColorStop(.55,'rgba(255,255,255,.24)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
 const map=new T.CanvasTexture(spriteCanvas),patchMaterial=new T.MeshBasicMaterial({map,transparent:true,opacity:.48,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,toneMapped:false});
 const count=64,patches=new T.InstancedMesh(new T.PlaneGeometry(1,1),patchMaterial,count);patches.name='Mirror ball reflected light spots';patches.frustumCulled=false;patches.instanceMatrix.setUsage(T.DynamicDrawUsage);patches.renderOrder=5;scene.add(patches);
 const surfaces=[];architecture.traverse(o=>{if(o.isMesh&&!/Distant|Rain/.test(o.name))surfaces.push(o);});
 const ray=new T.Raycaster(),direction=new T.Vector3(),normal=new T.Vector3(),normalMatrix=new T.Matrix3(),palette=['#ffb7d2','#b8aaff','#93e4ff','#ffcf89'];
 let enabled=true,time=0,last=-1,dim=false;
 function paint(){architecture.updateWorldMatrix(true,true);for(let i=0;i<count;i++){const elevation=-.92+(i%8)*.21,angle=i*2.399963+time*.095;direction.set(Math.cos(angle),elevation,Math.sin(angle)).normalize();ray.set(group.position,direction);ray.far=9;const hit=ray.intersectObjects(surfaces,false)[0];if(hit){normalMatrix.getNormalMatrix(hit.object.matrixWorld);normal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();if(normal.dot(direction)>0)normal.negate();dummy.position.copy(hit.point).addScaledVector(normal,.009);dummy.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);const size=.055+(i%4)*.018;dummy.scale.set(size,size,1);}else{dummy.position.set(0,-10,0);dummy.scale.setScalar(0);}dummy.updateMatrix();patches.setMatrixAt(i,dummy.matrix);patches.setColorAt(i,new T.Color(palette[i%palette.length]));}patches.instanceMatrix.needsUpdate=true;if(patches.instanceColor)patches.instanceColor.needsUpdate=true;}
 paint();
 function update(dt){if(!enabled)return;if(!reduced.matches)time+=dt;core.rotation.y=tiles.rotation.y=time*.14;if(time-last>.1){paint();last=time;}}
 function apply(){patches.visible=enabled;for(const light of spotLights)light.intensity=enabled?(dim?6:12):0;mirror.emissiveIntensity=enabled?.12:.025;patchMaterial.opacity=dim?.3:.48;}
 return {update,toggle(){enabled=!enabled;apply();return enabled;},setDim(value){dim=value;apply();},status:()=>({enabled,patches:count,method:'Rotating mirror facets and surface-anchored additive light patches'})};
}
