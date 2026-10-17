export function createSoundscape(){
 let ctx=null,active=false,music='rnb',volume=.38,ducked=false,token=0,layers=[];
 const buffers=new Map();
 const tracks={rnb:'velvet-lounge',jazz:'late-jazz',ktv:'ktv-room',none:'rain-room'};
 async function load(name){
  if(!buffers.has(name))buffers.set(name,(async()=>{const r=await fetch('./audio/ambience/'+name+'.mp3');if(!r.ok)throw Error('This track could not load. Please try again.');return ctx.decodeAudioData(await r.arrayBuffer());})());
  try{return await buffers.get(name);}catch(e){buffers.delete(name);throw e;}
 }
 function fade(layer,target,time){const p=layer.gain.gain;p.cancelScheduledValues(ctx.currentTime);p.setValueAtTime(p.value,ctx.currentTime);p.linearRampToValueAtTime(target,ctx.currentTime+time);}
 function level(l){return volume*l.level*(ducked?.18:1);}
 function retire(old){for(const l of old){fade(l,0,.45);l.source.stop(ctx.currentTime+.48);}}
 function add(name,buffer,level){const gain=ctx.createGain(),source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(gain);gain.connect(ctx.destination);gain.gain.value=0;source.start();const l={name,gain,source,level};source.onended=()=>{source.disconnect();gain.disconnect();};return l;}
 async function start(){
  if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();
  const id=++token,wanted=music,name=tracks[wanted];await ctx.resume();if(id!==token)return;
  // Keep the old track audible until its replacement is decoded. One music voice only.
  const buffer=await load(name);if(id!==token)return;
  const old=layers;layers=[add(name,buffer,wanted==='none'?.15:.52)];active=true;
  for(const l of layers)fade(l,level(l),.55);retire(old);
 }
 function stop(){token++;active=false;retire(layers);layers=[];}
 return {start,stop,async setMusic(value){if(!tracks[value])return;music=value;if(active)await start();},setVolume(value){volume=Math.max(0,Math.min(1,value));if(ctx)for(const l of layers)fade(l,level(l),.15);},duck(value){ducked=value;if(ctx)for(const l of layers)fade(l,level(l),value?.18:.7);},get active(){return active;},snapshot(){return {active,music,ducked,volume,layers:layers.map(l=>l.name)};}};
}
