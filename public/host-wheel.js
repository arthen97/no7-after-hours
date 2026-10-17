// Application-specific adaptation of React Bits Option Wheel by David Haz.
// MIT + Commons Clause; see ./licenses/react-bits.txt.
export function createHostWheel(root,{onChange,selected='mira'}={}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let items=[],position=0,target=0,current=selected,frame=0,last=0,timer,drag=null,moved=false;
 const mod=(v,n)=>((v%n)+n)%n;
 const rowHeight=()=>root.clientWidth<420?78:88;
 function refresh(){
  items=[...root.querySelectorAll('[data-host]')];
  items.forEach((item,i)=>{item.id='host-wheel-'+item.dataset.host;item.setAttribute('role','option');item.tabIndex=-1;item.setAttribute('aria-posinset',i+1);item.setAttribute('aria-setsize',items.length);item.removeAttribute('aria-pressed');});
  const index=Math.max(0,items.findIndex(x=>x.dataset.host===current));position=target=index;mark();render();
 }
 function mark(){
  items.forEach(item=>{const active=item.dataset.host===current;item.setAttribute('aria-selected',String(active));item.classList.toggle('wheel-selected',active);if(active)root.setAttribute('aria-activedescendant',item.id);});
  const index=items.findIndex(x=>x.dataset.host===current);
  document.querySelector('#wheel-count').textContent=String(index+1).padStart(2,'0')+' / '+String(items.length).padStart(2,'0');
 }
 function render(){
  const n=items.length,row=rowHeight(),tilt=9*Math.PI/180,radius=row/tilt;
  items.forEach((item,i)=>{
   let d=mod(i-position+n/2,n)-n/2,dist=Math.abs(d),angle=d*tilt;
   const x=-radius*(1-Math.cos(angle)),y=radius*Math.sin(angle);
   item.style.transform=`translate(${x}px,calc(${y}px - 50%)) rotate(${angle*180/Math.PI}deg)`;
   item.style.opacity=String(Math.max(.12,1-dist*.36));
   item.style.filter=`blur(${reduced.matches?0:dist*1.1}px)`;
   item.style.setProperty('--wheel-focus',Math.max(0,1-dist));
  });
 }
 function tick(now){const dt=Math.min((now-last)/1000,.05);last=now;position+=(target-position)*(1-Math.exp(-dt/.16));if(Math.abs(target-position)<.001)position=target;render();frame=position===target?0:requestAnimationFrame(tick);}
 function animate(){if(reduced.matches){cancelAnimationFrame(frame);frame=0;position=target;render();return;}if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}}
 function move(value,snap=true){
  if(!items.length)return;target=snap?Math.round(value):value;
  const item=items[mod(Math.round(target),items.length)];
  if(item.dataset.host!==current){current=item.dataset.host;mark();onChange?.(current);}
  animate();
 }
 function select(id){const index=items.findIndex(x=>x.dataset.host===id);if(index<0)return;if(current===id){mark();return;}current=id;target+=mod(index-target+items.length/2,items.length)-items.length/2;target=Math.round(target);mark();animate();}
 root.setAttribute('role','listbox');root.tabIndex=0;root.setAttribute('aria-describedby','wheel-help');
 root.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?24:e.deltaMode===2?root.clientHeight:1);move(target+Math.max(-1,Math.min(1,delta/rowHeight())),false);clearTimeout(timer);timer=setTimeout(()=>move(target),140);},{passive:false});
 root.addEventListener('pointerdown',e=>{if(e.button!==0)return;clearTimeout(timer);root.focus({preventScroll:true});drag={id:e.pointerId,y:e.clientY,start:target};moved=false;});
 root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dy=e.clientY-drag.y;if(Math.abs(dy)>5&&!moved){moved=true;root.setPointerCapture(e.pointerId);root.classList.add('wheel-dragging');}if(moved)move(drag.start-dy/rowHeight(),false);});
 function end(e){if(!drag||e.pointerId!==drag.id)return;drag=null;root.classList.remove('wheel-dragging');if(moved)move(target);if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);}
 root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);root.addEventListener('lostpointercapture',end);
 root.addEventListener('click',e=>{if(moved){moved=false;return;}const item=e.target.closest('[data-host]');if(!item)return;const index=items.indexOf(item);move(target+mod(index-target+items.length/2,items.length)-items.length/2);});
 root.addEventListener('keydown',e=>{const delta={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1}[e.key];if(delta){e.preventDefault();move(Math.round(target)+delta);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();move(e.key==='Home'?0:items.length-1);}else if(e.key===' '||e.key==='Enter'){e.preventDefault();move(target);}});
 document.querySelector('#wheel-prev').onclick=()=>move(Math.round(target)-1);
 document.querySelector('#wheel-next').onclick=()=>move(Math.round(target)+1);
 new ResizeObserver(render).observe(root);reduced.addEventListener('change',animate);
 refresh();return {select,refresh};
}
