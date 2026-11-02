'use strict';
// Tactical electronic ambience: restrained synth pulses, sub bass, dark pads.
// No drum track or external audio file is required.
const MUSIC_SETTINGS={tempo:74,volume:.20};
const backgroundMusic={context:null,master:null,bus:null,voices:new Set(),active:false,nextBeat:0,step:0};
const musicChords=[[40,47,54,59],[36,43,50,55],[33,40,47,52],[35,42,48,54]];
const musicMotif=new Map([[7,66],[15,64],[23,62],[30,63]]);
const musicFrequency=midi=>440*2**((midi-69)/12);
function prepareBackgroundMusic(context){
 if(backgroundMusic.context===context)return;
 stopBackgroundMusic(true);
 const bus=context.createGain(),filter=context.createBiquadFilter(),master=context.createGain();
 filter.type='lowpass';filter.frequency.value=1100;filter.Q.value=.7;master.gain.value=0;
 bus.connect(filter);filter.connect(master);master.connect(context.destination);
 // A short, quiet delay adds depth without overpowering the gunfire.
 const delay=context.createDelay(2),echo=context.createGain(),wet=context.createGain();
 delay.delayTime.value=.23;echo.gain.value=.18;wet.gain.value=.14;
 filter.connect(delay);delay.connect(echo);echo.connect(delay);delay.connect(wet);wet.connect(master);
 backgroundMusic.context=context;backgroundMusic.bus=bus;backgroundMusic.master=master;
}
function musicVoice(midi,at,duration,volume,type='sine',detune=0,pulse=false){
 const context=backgroundMusic.context;if(backgroundMusic.voices.size>=64)return;
 const oscillator=context.createOscillator(),gain=context.createGain();
 oscillator.type=type;oscillator.frequency.value=musicFrequency(midi);oscillator.detune.value=detune;
 const attack=pulse?.025:type==='triangle'?1.4:.14,release=Math.min(2,duration*.45);
 gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+Math.min(attack,duration*.3));
 gain.gain.setValueAtTime(volume*.8,at+Math.max(duration-release,attack));gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
 oscillator.connect(gain);gain.connect(backgroundMusic.bus);
 const voice={oscillator,gain};backgroundMusic.voices.add(voice);
 oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();backgroundMusic.voices.delete(voice);};
 oscillator.start(at);oscillator.stop(at+duration+.05);
}
function stopBackgroundMusic(immediate=false){
 const music=backgroundMusic;if(!music.master)return;
 const at=music.context.currentTime,fade=immediate?.03:.18;
 music.master.gain.cancelScheduledValues(at);music.master.gain.setValueAtTime(music.master.gain.value,at);music.master.gain.linearRampToValueAtTime(0,at+fade);
 for(const voice of music.voices){try{voice.oscillator.stop(at+fade+.02);}catch{}}
 music.voices.clear();music.active=false;
}
function updateBackgroundMusic(){
 const music=backgroundMusic,wanted=running&&sound&&(challenge.phase==='preview'||challenge.phase==='playing');
 if(!wanted){if(music.active)stopBackgroundMusic(!sound);return;}
 if(!audioCtx||audioCtx.state==='suspended'||audioCtx.state==='closed')return;
 prepareBackgroundMusic(audioCtx);
 const now=audioCtx.currentTime,beat=60/MUSIC_SETTINGS.tempo;
 if(!music.active){music.active=true;music.step=0;music.nextBeat=now+.06;music.master.gain.cancelScheduledValues(now);music.master.gain.setValueAtTime(0,now);music.master.gain.linearRampToValueAtTime(MUSIC_SETTINGS.volume,now+1.3);}
 if(music.nextBeat<now-.4)music.nextBeat=now+.06;
 while(music.nextBeat<now+.3){
  const step=music.step%32,at=music.nextBeat;
  if(step%8===0){const chord=musicChords[Math.floor(step/8)];chord.forEach((note,i)=>musicVoice(note,at+i*.11,beat*8.6,.038,'triangle',(i%2?1:-1)*4));}
  if(step%16===0)musicVoice(step===0?28:33,at,beat*16.3,.035,'sine');
  if(step%2===0)musicVoice([40,40,47,42][Math.floor(step/2)%4],at,beat*.65,.04,'triangle',0,true);
  if(musicMotif.has(step))musicVoice(musicMotif.get(step),at,beat*1.5,.022,'sine');
  music.step++;music.nextBeat+=beat;
 }
}
