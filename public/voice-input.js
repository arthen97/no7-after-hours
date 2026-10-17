// Browser speech recognition supplies real final transcripts; never submit interim guesses.
export function createVoiceInput({button,languageButton,status,input,ready,onStart,onEnd,onTranscript}) {
 let language='zh-CN',active=null,timer=null;
 function display(text){status.textContent=text;}
 function reset(session){if(active!==session)return;clearTimeout(timer);active=null;button.setAttribute('aria-pressed','false');button.textContent='Speak';languageButton.disabled=false;onEnd();}
 function cancel(){if(!active)return;const session=active;session.cancelled=true;session.rec.abort();reset(session);display('Voice input cancelled.');}
 languageButton.onclick=()=>{language=language==='zh-CN'?'en-US':'zh-CN';languageButton.textContent=language==='zh-CN'?'中文':'English';languageButton.setAttribute('aria-pressed',String(language==='zh-CN'));languageButton.setAttribute('aria-label','Switch spoken language to '+(language==='zh-CN'?'English':'Chinese'));};
 button.onclick=()=>{
  if(active){active.rec.stop();display('Finishing recognition…');return;}
  if(!ready()){display('Wait for the room and the current reply to finish.');return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){display('This browser has no speech recognition. Open this page in Chrome or Safari, or type below.');return;}
  if(!window.isSecureContext){display('Microphone input needs HTTPS or localhost.');return;}
  const rec=new Recognition(),session={rec,final:'',failed:false,cancelled:false};active=session;
  rec.lang=language;rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
  button.setAttribute('aria-pressed','true');button.textContent='Stop & send';languageButton.disabled=true;
  onStart();display('Allow the microphone, then speak. Your finished line sends automatically.');
  rec.onstart=()=>{if(active===session)display('Listening… Speak naturally. Tap again to finish.');};
  rec.onresult=event=>{if(active!==session)return;let final='',interim='';for(const result of event.results){if(result.isFinal)final+=result[0].transcript+' ';else interim+=result[0].transcript;}session.final=final.trim();const heard=(final+interim).trim();if(heard){input.value=heard;display(heard);}};
  rec.onerror=event=>{session.failed=true;const messages={'not-allowed':'Microphone permission was denied. Allow it in the browser site settings, then tap Speak.','service-not-allowed':'Speech recognition is disabled by this browser. Try Chrome or type below.','audio-capture':'No available microphone. Check your input device.','network':'The browser speech-recognition service could not connect. Try again or type your line.','no-speech':'No speech detected. Tap Speak and try again.','aborted':'Voice input cancelled.'};display(messages[event.error]||'Recognition failed. Your line was not sent.');};
  rec.onend=()=>{if(active!==session)return;reset(session);if(session.cancelled||session.failed)return;if(!session.final){display('No complete sentence was recognized. Your line was not sent.');return;}display('Heard: '+session.final+' · Waiting for her reply…');onTranscript(session.final);};
  try{rec.start();timer=setTimeout(()=>{if(active===session)rec.stop();},30000);}catch{session.failed=true;reset(session);display('Could not start speech recognition. Tap Speak to try again.');}
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});window.addEventListener('pagehide',cancel);
 return {cancel,get active(){return !!active;}};
}
