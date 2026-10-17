/* Motion adapted from React Bits: AnimatedContent, TiltedCard and ClickSpark.
 * Copyright (c) 2026 David Haz. MIT + Commons Clause; see licenses/react-bits.txt.
 * Native DOM integration keeps the existing non-React game architecture.
 */
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let posterRequest=0;
export async function transitionPoster(image,src){
 const request=++posterRequest;
 if(image.getAttribute('src')===src)return;
 const next=new Image();next.src=src;
 try{await next.decode();}catch{return;}
 if(request!==posterRequest)return;
 const previous=image.parentElement.querySelector('.poster-outgoing');previous?.remove();
 const old=image.cloneNode();old.className='poster-outgoing';old.removeAttribute('id');old.alt='';old.setAttribute('aria-hidden','true');image.parentElement.prepend(old);
 image.src=src;
 if(reduce.matches){old.remove();return;}
 const animation=image.animate([{opacity:0,filter:'blur(7px)',transform:'scale(1.035)'},{opacity:1,filter:'blur(0)',transform:'scale(1)'}],{duration:520,easing:'cubic-bezier(.2,.7,.2,1)'});
 animation.finished.catch(()=>{}).finally(()=>old.remove());
}
export function setupNightMotion(){
 const opening=document.querySelector('#opening'),shell=document.querySelector('.host-wheel-shell'),cover=document.querySelector('.opening-cover');
 const revealTargets=[document.querySelector('.opening-left'),document.querySelector('.selection-heading'),shell,...opening.querySelectorAll('.wheel-footer,.host-opening-line,.opening-music,.entrance-row,#opening-enter')].filter(Boolean);
 const animations=new Set();
 function animate(el,keyframes,options){const a=el.animate(keyframes,options);animations.add(a);a.finished.catch(()=>{}).finally(()=>animations.delete(a));return a;}
 function reveal(){if(reduce.matches)return;revealTargets.forEach((el,i)=>animate(el,[{opacity:0,transform:'translateY(24px)',filter:'blur(5px)'},{opacity:1,transform:'translateY(0)',filter:'blur(0)'}],{duration:660,delay:Math.min(i*65,330),easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));}
 reveal();new MutationObserver(()=>{if(!opening.hidden)reveal();}).observe(opening,{attributes:true,attributeFilter:['hidden']});
 const glare=document.createElement('span');glare.className='poster-glare';glare.setAttribute('aria-hidden','true');shell.append(glare);
 const state={x:0,y:0,vx:0,vy:0},target={x:0,y:0};let frame=0,last=0;
 function step(key,dt){const v='v'+key,steps=Math.max(1,Math.ceil(dt/(1/240))),h=dt/steps;for(let i=0;i<steps;i++){state[v]+=(100*(target[key]-state[key])-17*state[v])*h;state[key]+=state[v]*h;}return Math.abs(state[key]-target[key])>.001||Math.abs(state[v])>.01;}
 function draw(now){frame=0;const dt=Math.min(.05,(now-last)/1000||1/60);last=now;const x=step('x',dt),y=step('y',dt);cover.style.transform=`perspective(1100px) rotateX(${-state.y*3}deg) rotateY(${state.x*4}deg) scale(1.025)`;glare.style.setProperty('--glare-x',`${50+state.x*45}%`);glare.style.setProperty('--glare-y',`${50+state.y*45}%`);if(x||y)frame=requestAnimationFrame(draw);}
 function wake(){if(!frame){last=performance.now();frame=requestAnimationFrame(draw);}}
 shell.addEventListener('pointermove',e=>{if(reduce.matches||e.pointerType!=='mouse'||e.buttons)return;const b=shell.getBoundingClientRect();target.x=(e.clientX-b.left)/b.width*2-1;target.y=(e.clientY-b.top)/b.height*2-1;glare.style.opacity='.22';wake();});
 function reset(){target.x=target.y=0;glare.style.opacity='0';if(!reduce.matches)wake();else{cancelAnimationFrame(frame);frame=0;cover.style.transform='none';}}
 shell.addEventListener('pointerleave',reset);shell.addEventListener('pointerdown',reset);
 const bursts=new Set();document.addEventListener('click',e=>{const button=e.target.closest('#opening-enter,#opening-music-toggle,.interaction-bar button');if(!button||button.disabled||reduce.matches)return;const b=button.getBoundingClientRect(),x=e.detail?e.clientX:b.left+b.width/2,y=e.detail?e.clientY:b.top+b.height/2;const burst=document.createElement('span');burst.className='click-sparks';burst.setAttribute('aria-hidden','true');burst.style.left=x+'px';burst.style.top=y+'px';document.body.append(burst);bursts.add(burst);if(bursts.size>8){const first=bursts.values().next().value;first.remove();bursts.delete(first);}for(let i=0;i<7;i++){const spark=document.createElement('i');burst.append(spark);const angle=i*360/7;a(spark,angle);}setTimeout(()=>{burst.remove();bursts.delete(burst);},600);});
 function a(spark,angle){animate(spark,[{transform:`rotate(${angle}deg) translateX(5px) scaleX(1)`,opacity:1},{transform:`rotate(${angle}deg) translateX(42px) scaleX(0)`,opacity:0}],{duration:520,easing:'cubic-bezier(.16,1,.3,1)'});}
 reduce.addEventListener('change',()=>{if(reduce.matches){for(const a of animations)a.cancel();for(const b of bursts)b.remove();bursts.clear();reset();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const a of animations)a.cancel();cancelAnimationFrame(frame);frame=0;}});
}
