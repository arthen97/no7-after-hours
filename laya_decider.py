"""Persistent local Laya inference. No generated code or arbitrary animation names."""
import json,time,threading,re
from pathlib import Path
LOCK=threading.Lock();ROUTER=None;STATE='loading';ERROR=None
QUESTIONS=json.loads((Path(__file__).parent/'production/laya-v3/questions.json').read_text())
def initialize():
 global ROUTER,STATE,ERROR
 try:
  from laya import Router
  ROUTER=Router(device='mps',max_loaded=1)
  ROUTER.predict('Who wrote the invitation?',QUESTIONS,model='english')
  STATE='ready'
 except Exception as e:STATE='unavailable';ERROR=type(e).__name__
def status():return {'engine':'laya','state':STATE,'checkpoint':'convaiinnovations/laya','error':ERROR}
ACTIONS=['approach','stepback','wave','comfort','sit','stand','beside','pour','drink','sing','none']
SPEECH=['speak','after','before','silent']
def sequence_for(action,speech):
 move=action if action!='none' else None
 if speech=='silent':return [move] if move else []
 if speech=='before':return ['tts',move] if move else ['tts']
 if speech=='after':return [move,'tts'] if move else ['tts']
 return ['tts',move] if move else ['tts']
def decide(d):
 text=d.get('text','')
 if not isinstance(text,str)or not 1<=len(text.strip())<=1000:raise ValueError('Enter 1–1000 characters.')
 if STATE!='ready':raise RuntimeError('Local Laya is still loading or unavailable. You can use the action buttons.')
 start=time.monotonic()
 result=ROUTER.predict(text,QUESTIONS,model='english')
 answer=result['answers']['action'];spoken=result['answers'].get('speech',{})
 choice=answer.get('choice','none');confidence=answer.get('answer_confidence',answer.get('probability'));raw_choice=choice;guard=None
 speech=spoken.get('choice','speak');speech_confidence=spoken.get('answer_confidence',spoken.get('probability'));raw_speech=speech
 if choice not in ACTIONS:choice='none'
 if speech not in SPEECH:speech='speak'
 # Selection remains a bounded hint, never authorizes contact or physical operations.
 if isinstance(confidence,(int,float))and confidence<.60:choice='none';guard='low_score'
 # Explicit boundaries override probabilistic classification.
 normalized=text.lower().replace('’',"'")
 if re.search(r"\b(don't talk|do not talk|stop talking|be quiet)\b",normalized) or re.search(r'别说|不要说话|安静',text):speech='silent';choice='none';guard='explicit_silence'
 elif re.search(r"\b(don't|do not|stop|stay where|no movement|remain still)\b",normalized) or re.search(r'别动|停下|不要过来',text):choice='none';guard='explicit_stop_or_negation'
 elif re.search(r'\b(give me (some )?space|keep your distance|back off)\b',normalized) or '离远' in text:choice='stepback';guard='explicit_distance_request'
 elif re.search(r"\b(sit (down|with me|beside me|together)|join me on (the )?(sofa|couch)|let'?s sit)\b",normalized) or re.search(r'坐下|一起坐|坐过来',text):choice='sit';guard='explicit_seating_request'
 elif re.search(r'\b(stand (beside|next to) me|stay by my side)\b',normalized) or re.search(r'站在我旁边|陪在我身边',text):choice='beside';guard='explicit_beside_request'
 elif re.search(r'\b(stand up|get up)\b',normalized) or '站起来' in text:choice='stand';guard='explicit_rise_request'
 elif re.search(r'\b(comfort me|reassure me|i (feel|am) (so |very )?(sad|anxious|lonely|overwhelmed))\b',normalized):choice='comfort';guard='explicit_reassurance_or_distress'
 elif re.search(r'倒酒|\bpour\b',text,re.I):choice='pour';guard='explicit_pour'
 elif re.search(r'喝酒|举杯|\bdrink\b|\bcheers\b',text,re.I):choice='drink';guard='explicit_drink'
 elif re.search(r'唱歌|\bsing\b',text,re.I):choice='sing';guard='explicit_sing'
 elif re.search(r'\b(come closer|walk closer|come here|approach)\b',normalized) or re.search(r'靠近|过来',text):choice='approach';guard='explicit_approach'
 elif re.search(r'\bwave\b',normalized) or '挥手' in text:choice='wave';guard='explicit_wave'
 if guard!='explicit_silence' and (not isinstance(speech_confidence,(int,float)) or speech_confidence<.75):
  speech='after' if choice in ['approach','stepback','sit','stand','beside','pour','drink','sing'] else 'before' if choice in ['wave','comfort'] else 'speak'
  guard=guard or 'speech_default'
 return {'action':choice,'speech':speech,'sequence':sequence_for(choice,speech),'source':'laya','raw_choice':raw_choice,'raw_speech':raw_speech,'guard':guard,'latency_ms':round((time.monotonic()-start)*1000),'confidence':confidence,'speech_confidence':speech_confidence,'checkpoint':'convaiinnovations/laya'}
