import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('public'),port=Number(process.env.PORT||4328);
const origins=new Set((process.env.ALLOWED_ORIGINS||'https://arthen97.github.io').split(',').filter(Boolean));
const model='eleven_v4',chatModel='claude-opus-5.5',audio=new Map(),limits=new Map();
const voices={mira:'XrExE9yKIg1WjnnlVkGX',hana:'EXAVITQu4vr4xnSDxMaL',lin:'XB0fDUnXU5powFXDhCwa',yue:'cgSgspJ2msm6clMCkdW9'};
const guestVoices={low:voices.mira,soft:voices.hana,dry:voices.lin,bright:voices.yue};
function credential(){return process.env.MEROUTER_SERVICE_KEY?{'X-Service-Key':process.env.MEROUTER_SERVICE_KEY}:process.env.MEROUTER_API_KEY?{'X-Api-Key':process.env.MEROUTER_API_KEY}:null;}
function limit(kind){const now=Date.now(),s=limits.get(kind)||{total:0,times:[]};s.times=s.times.filter(t=>now-t<60000);if(s.total>=120||s.times.length>=10)throw Error('Generation limit reached. Please try later.');s.total++;s.times.push(now);limits.set(kind,s);}
async function upstream(path,payload,kind){const auth=credential();if(!auth)throw Error('Merouter voice and chat are not configured yet.');limit(kind);const r=await fetch('https://merouter.play.one2x.ai/v1/'+path,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(80000),redirect:'error'});if(!r.ok)throw Error('Merouter service returned HTTP '+r.status+'. No automatic retry was made.');return r;}
function text(d,max){if(typeof d.text!=='string'||!d.text.trim()||d.text.length>max)throw Error('Invalid message length.');return d.text.trim();}
async function speech(d){
 const input=text(d,500).replace(/\[[^\]]*\]/g,'');
 const voice=d.host==='guest'?guestVoices[d.voice]:voices[d.host];if(!voice)throw Error('Unknown host voice.');
 const payload={model,voice,input,language:'en',response_format:'mp3'};
 const key=createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,24);
 for(const [id,item]of audio)if(Date.now()-item.created>3600000)audio.delete(id);
 if(audio.has(key))return {url:'/audio/generated/'+key+'.mp3',model,cached:true};
 const r=await upstream('audio/speech',payload,'speech');
 const bytes=Buffer.from(await r.arrayBuffer());
 if(bytes.length<32||!(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))throw Error('Merouter did not return MP3 audio.');
 if(audio.size>=120)audio.delete(audio.keys().next().value);
 audio.set(key,{bytes,created:Date.now()});return {url:'/audio/generated/'+key+'.mp3',model,cached:false,bytes:bytes.length};
}
async function chat(d){
 const input=text(d,1000),id=voices[d.host]?d.host:'mira';
 const tones={mira:'warm, playful and confident',hana:'thoughtful, quiet and careful',lin:'direct, dry and concise',yue:'bright, quick and musical'};
 const history=Array.isArray(d.history)?d.history.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').slice(-10).map(x=>({role:x.role,content:x.content.slice(0,600)})):[];
 if(history.at(-1)?.role==='user'&&history.at(-1).content===input)history.pop();
 const r=await upstream('chat/completions',{model:chatModel,max_tokens:240,temperature:.7,messages:[{role:'system',content:`You are ${id}, a fictional adult woman aged 27 in a private karaoke booth. Your tone is ${tones[id]}. Speak natural English, two short sentences. Respond warmly to distress. Keep flirting non-explicit. Do not claim physical actions have finished; animation is separate. Return only JSON with text and emotion (warm, curious, reassuring or playful).`},...history,{role:'user',content:input}]},'chat');
 const data=await r.json();const raw=data.choices?.[0]?.message?.content||'';
 let reply;try{reply=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw Error('The reply format was invalid.');}
 if(typeof reply.text!=='string')throw Error('The reply was empty.');
 return {text:reply.text.slice(0,500),emotion:['warm','curious','reassuring','playful'].includes(reply.emotion)?reply.emotion:'warm',source:'live',model:data.model||chatModel};
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.mp3':'audio/mpeg','.wav':'audio/wav'};
http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const origin=req.headers.origin;
 const allowed=!origin||origins.has(origin)||origin==='https://'+req.headers.host||origin==='http://'+req.headers.host;
 if(origin&&allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
  if(!allowed)return json(403,{error:'Forbidden origin'});
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end();}
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(req.method==='POST'){
   if(!['/api/speech','/api/chat','/api/decide'].includes(path))return json(404,{error:'Not found'});
   if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON required'});
   let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>20000)return json(413,{error:'Message too large'});chunks.push(c);}
   let d;try{d=JSON.parse(Buffer.concat(chunks).toString());}catch{return json(400,{error:'Invalid JSON'});}
   if(!d||Array.isArray(d)||typeof d!=='object')return json(400,{error:'Invalid request'});
   if(path==='/api/decide')return json(503,{error:'Use the action buttons; Laya is not hosted here.'});
   return json(200,await(path==='/api/speech'?speech(d):chat(d)));
  }
  if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Method not allowed'});
  if(path==='/api/status')return json(200,{configured:!!credential(),tts_model:model,chat_model:chatModel});
  if(path==='/api/motion')return json(200,{status:'idle'});
  const match=path.match(/^\/audio\/generated\/([a-f0-9]{24})\.mp3$/);
  if(match){const item=audio.get(match[1]);if(!item)return json(404,{error:'Audio expired; generate again.'});res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':item.bytes.length});return res.end(req.method==='HEAD'?undefined:item.bytes);}
  const file=resolve(root,'.'+(path==='/'?'/salon.html':path));
  if(!file.startsWith(root+sep))return json(403,{error:'Forbidden'});
  let info;try{info=await stat(file);}catch{return json(404,{error:'Not found'});}
  if(!info.isFile())return json(404,{error:'Not found'});
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':info.size});
  res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch(e){if(!res.headersSent)json(502,{error:e.name==='TimeoutError'?'Service timed out.':String(e.message).replace(/(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}/g,'[redacted]')});else res.end();}
}).listen(port,'0.0.0.0',()=>console.log('No. 7 service listening on '+port));
