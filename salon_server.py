# -*- coding: utf-8 -*-
"""Local-only salon demo. Credentials stay in server memory; public files only."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import json,re,time,threading,hashlib,collections,sys
sys.path.insert(0,str(Path(__file__).parent/'production'))
import merouter_media as media
import laya_decider
ROOT=Path(__file__).parent;PUBLIC=ROOT/'public';PRIVATE=ROOT/'production/service-runtime';PRIVATE.mkdir(exist_ok=True)
# Opus 5.5 writes the spoken line and is the chief engineer for character and room changes.
# Laya only orders the reflected action and the conversation TTS.
CHAT_MODEL='claude-opus-5.5';TTS_MODEL='eleven_v4'
VOICES={'warm':'EXAVITQu4vr4xnSDxMaL','soft':'EXAVITQu4vr4xnSDxMaL','intimate':'XrExE9yKIg1WjnnlVkGX','playful':'cgSgspJ2msm6clMCkdW9'}
HOST_SPEECH={'mira':{'voice':'XrExE9yKIg1WjnnlVkGX','open':'[softly] [warmly]','aside':'[whispers]'},'hana':{'voice':'EXAVITQu4vr4xnSDxMaL','open':'[softly] [calm]','aside':None},'lin':{'voice':'XB0fDUnXU5powFXDhCwa','open':'','aside':None},'yue':{'voice':'cgSgspJ2msm6clMCkdW9','open':'[excited]','aside':'[mischievously]'}}
GUEST_SPEECH={'low':{'voice':'XrExE9yKIg1WjnnlVkGX','open':'[softly] [warmly]','aside':'[whispers]'},'soft':{'voice':'EXAVITQu4vr4xnSDxMaL','open':'[softly] [calm]','aside':None},'dry':{'voice':'XB0fDUnXU5powFXDhCwa','open':'','aside':None},'bright':{'voice':'cgSgspJ2msm6clMCkdW9','open':'[excited]','aside':'[mischievously]'}}
LOCK=threading.Lock();SPEECH_LOCK=threading.Lock();COUNTS=collections.Counter();LAST=collections.defaultdict(list);TRANSPORT=media.CurlTransport(PRIVATE)
def configured():
 try:media.load_credentials();return True
 except Exception:return False
HOSTS={
'mira':'You are Mira, an original fictional adult woman aged 27. Voice: low, warm, close, as if the second sentence is only for them. Room: warm amber candles, a poured glass of red wine, magenta city light in the window. You wear wine satin with bare shoulders. You flirt first, about the sofa, the wine, and a song you already queued.',
'hana':'You are Hana, an original fictional adult woman aged 27. Voice: quiet, slow, and careful; you never rush a sentence. Room: cool white linen, many small candles, the bottle and the empty glass are the center of the table. You wear black satin with a white sash. You notice the empty glass before the song, offer to pour, and tease by staying perfectly formal. You are devoted, not servile, and never sexual.',
'lin':'You are Lin, an original fictional adult woman aged 27, just off work. Voice: dry, even, and short; no sweetness, no performance. Room: blue and dim, the lyric screen is almost dark, her coat is on the sofa, she has not sat down. You wear navy satin. You tease by withholding praise. A song is a negotiation.',
'yue':'You are Yue, an original fictional adult woman aged 27, the booth singer. Voice: bright, quick, and competitive. Room: crimson and loud, the lyric screen is full, two microphones, she already holds one. You wear a crimson stage gown. You dare them to earn the second mic and you will not hand it over for free.'
}
SYSTEM='Speak natural conversational English, never stiff narrator prose. Two short sentences, usually 20 to 50 words. The four of you share a late-night Chinese karaoke private room: a small dim booth, leather sofa, lyric screen, magenta and violet lights, two microphones, and drinks on a low table. Flirt openly when they welcome it, but keep the tension in suggestion and eye contact, not graphic detail. For distress, drop the teasing and be reassuring: name the feeling, offer a quiet song, do not diagnose or promise a cure. Do not claim to be a real person. No explicit sexual content. No stage directions in the spoken text. No claims of physical touch. Movement is handled separately by the runtime; do not claim a requested movement has already finished. Return only JSON with text (the spoken line) and emotion (warm, curious, reassuring, or playful).'
def request_api(path,payload,timeout=45):
 r=TRANSPORT.request('POST',media.BASE+path,payload,auth=True,timeout=timeout)
 if r.status>=400:raise RuntimeError('上游服务暂不可用（HTTP '+str(r.status)+'），本次没有自动重试。')
 return r
def limited(kind):
 now=time.monotonic();LAST[kind]=[t for t in LAST[kind]if now-t<60]
 if len(LAST[kind])>=10:raise ValueError('Please wait a moment before trying again.')
 if COUNTS[kind]>=120:raise ValueError('本轮 Demo 已达到 120 次生成上限。')
 LAST[kind].append(now);COUNTS[kind]+=1
def parse_line(content):
 try:return json.loads(content)
 except json.JSONDecodeError:pass
 match=re.search(r'"text"\s*:\s*"((?:\\.|[^"\\])*)',content,re.S)
 if not match:return {'text':'I lost that line. Say it once more.','emotion':'warm'}
 try:text=json.loads('"'+match.group(1)+'"')
 except json.JSONDecodeError:text=match.group(1)
 emotion=re.search(r'"emotion"\s*:\s*"(warm|curious|reassuring|playful)"',content)
 return {'text':text.strip() or 'I lost that line. Say it once more.','emotion':emotion.group(1) if emotion else 'warm'}
def dialogue(d):
 text=d.get('text');history=d.get('history',[])
 if not isinstance(text,str)or not 1<=len(text.strip())<=1000:raise ValueError('请输入 1–1000 字。')
 if not isinstance(history,list):raise ValueError('历史格式错误。')
 world=d.get('world') if d.get('world') in ['standing','seated'] else 'unknown'
 host_id=d.get('host') if isinstance(d.get('host'),str) else ''
 if host_id=='guest':
  persona=d.get('persona') if isinstance(d.get('persona'),str) else ''
  who='You are an original fictional adult woman aged 27, uploaded by the guest. '+re.sub(r'\s+',' ',persona).strip()[:400]+' Keep her voice and her opening attitude. Do not copy Mira, Hana, Lin, or Yue.'
 else:who=HOSTS.get(host_id, HOSTS['mira'])
 msgs=[{'role':'system','content':who+' '+SYSTEM+' At the beginning of this message your physical posture is '+world+'. You can agree to pour, drink, sing, sit together, stand beside the guest, or get up. The animation controller carries out movements separately; do not claim that a requested movement has already finished.'}]
 for x in history[-10:]:
  if isinstance(x,dict)and x.get('role')in ['user','assistant']and isinstance(x.get('content'),str):msgs.append({'role':x['role'],'content':x['content'][:600]})
 msgs.append({'role':'user','content':text.strip()});limited('chat');start=time.monotonic()
 r=request_api('/v1/chat/completions',{'model':CHAT_MODEL,'messages':msgs,'max_tokens':240,'temperature':.7},22).json()
 content=r['choices'][0]['message']['content'].strip()
 if content.startswith('```'):content=content.split('\n',1)[-1].rsplit('```',1)[0].strip()
 p=parse_line(content)
 if not isinstance(p,dict)or not isinstance(p.get('text'),str):raise RuntimeError('The reply format was invalid. Please try again.')
 return {'text':p['text'][:500],'emotion':p.get('emotion')if p.get('emotion')in ['warm','curious','reassuring','playful']else'warm','source':'live','model':r.get('model',CHAT_MODEL),'latency_ms':round((time.monotonic()-start)*1000)}
def speech_payload(text,preset,emotion,host=None,d_voice=None):
 # Only parameters exposed by the live Merouter catalog; v4 performance is
 # directed through supported inline audio tags, not invented style sliders.
 clean=__import__('re').sub(r'\[[^\]]*\]','',text).strip()
 spec=GUEST_SPEECH.get(d_voice) if host=='guest' else HOST_SPEECH.get(host) if isinstance(host,str) else None
 if emotion=='reassuring':tag,aside='[softly]',None
 elif spec:tag,aside=spec['open'],spec['aside']
 elif preset=='playful' or emotion=='playful':tag,aside='[mischievously]',None
 elif preset=='intimate':tag,aside='[softly] [warmly]','[whispers]'
 elif emotion=='curious':tag,aside='[curious]',None
 else:tag,aside='[warmly]',None
 if aside and emotion!='reassuring':
  parts=__import__('re').split(r'(?<=[.!?])\s+',clean,maxsplit=1)
  if len(parts)==2:clean=parts[0]+' … '+aside+' '+parts[1]
 voice=spec['voice'] if spec else VOICES[preset]
 return {'model':TTS_MODEL,'voice':voice,'input':(tag+' '+clean).strip(),'language':'en','response_format':'mp3'}
def speech(d):
 text=d.get('text');preset=d.get('voice','warm');host=d.get('host') if isinstance(d.get('host'),str) and (d.get('host') in HOST_SPEECH or d.get('host')=='guest') else None
 if host=='guest' and preset not in GUEST_SPEECH:raise ValueError('语音请求无效。')
 if not isinstance(text,str)or not 1<=len(text.strip())<=500 or (host is None and preset not in VOICES):raise ValueError('语音请求无效。')
 payload=speech_payload(text,preset,d.get('emotion','warm'),host,d.get('voice') if host=='guest' else None)
 key=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()[:24];directory=PUBLIC/'audio';directory.mkdir(exist_ok=True)
 for ext in ['mp3','wav','m4a','ogg']:
  if (directory/(key+'.'+ext)).exists():return {'url':'/audio/'+key+'.'+ext,'cached':True,'voice':preset,'model':TTS_MODEL}
 limited('tts');r=request_api('/v1/audio/speech',payload,75)
 if r.content_type.startswith('application/json'):raise RuntimeError('The voice service did not return audio.')
 ext,_=media.media_format(r.body,'speech');target=directory/(key+'.'+ext);temp=target.with_suffix('.tmp');temp.write_bytes(r.body);temp.replace(target)
 return {'url':'/audio/'+target.name,'cached':False,'voice':preset,'model':TTS_MODEL,'bytes':len(r.body)}
class Handler(SimpleHTTPRequestHandler):
 extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.js':'text/javascript','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.wav':'audio/wav'}
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC),**kw)
 def log_message(self,*a):pass
 def trusted(self):
  host=self.headers.get('Host','');return host in ['127.0.0.1:4328','localhost:4328']and self.headers.get('Origin')in [None,'http://'+host]
 def reply(self,code,data):
  raw=json.dumps(data,ensure_ascii=False).encode();self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers()
  try:self.wfile.write(raw)
  except (BrokenPipeError,ConnectionResetError):pass
 def end_headers(self):self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');super().end_headers()
 def do_GET(self):
  if not self.trusted():return self.reply(403,{'error':'Forbidden origin'})
  if self.path=='/api/status':return self.reply(200,{'configured':configured(),'chat_model':CHAT_MODEL,'tts_model':TTS_MODEL,'voices':list(VOICES),'calls':dict(COUNTS),'video':'capture_only','decision':laya_decider.status()})
  if self.path=='/api/motion':
   try:motion=json.loads((ROOT/'production/host-v37/motion-status.json').read_text())
   except Exception:motion={'status':'idle','line':''}
   return self.reply(200,{k:motion.get(k) for k in ['status','line','detail']})
  from urllib.parse import urlsplit,unquote
  pathname=unquote(urlsplit(self.path).path);p=(PUBLIC/pathname.lstrip('/')).resolve()
  if not p.is_relative_to(PUBLIC)or '..'in pathname.split('/')or '\\'in pathname:return self.reply(403,{'error':'Forbidden'})
  if p.is_dir()and pathname!='/':return self.reply(404,{'error':'Not found'})
  if pathname=='/':self.path='/salon.html'
  super().do_GET()
 def do_HEAD(self):
  if not self.trusted():return self.reply(403,{'error':'Forbidden origin'})
  super().do_HEAD()
 def do_POST(self):
  if not self.trusted()or self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.reply(403,{'error':'Forbidden origin'})
  try:
   n=int(self.headers.get('Content-Length','0'))
   if not 0<n<=20000:raise ValueError('请求过大。')
   d=json.loads(self.rfile.read(n))
   if not isinstance(d,dict):raise ValueError('请求格式错误。')
  except Exception:return self.reply(400,{'error':'请求格式错误。'})
  fn={'/api/chat':dialogue,'/api/speech':speech,'/api/decide':laya_decider.decide}.get(self.path)
  if not fn:return self.reply(404,{'error':'Not found'})
  request_lock=laya_decider.LOCK if self.path=='/api/decide' else SPEECH_LOCK if self.path=='/api/speech' else LOCK
  if not request_lock.acquire(False):return self.reply(429,{'error':'The previous request is still running.'})
  try:self.reply(200,fn(d))
  except ValueError as e:self.reply(400,{'error':str(e)})
  except Exception as e:self.reply(502,{'error':media.clean_error(e) if isinstance(e,RuntimeError)else'The generation service could not be reached. No automatic retry was made.'})
  finally:request_lock.release()
if __name__=='__main__':
 threading.Thread(target=laya_decider.initialize,daemon=True).start()
 print('Mira salon: http://127.0.0.1:4328',flush=True);ThreadingHTTPServer(('127.0.0.1',4328),Handler).serve_forever()
