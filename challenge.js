'use strict';
// Split only on 。. Keep the supplied characters (including 説 / 爲) intact.
const poemSource=`近水樓臺先得月，向陽花木早逢春。
古人不見今時月，今月曾經照古人。
馬行無力皆因瘦，人不風流只為貧 。
誰人背後無人説，那個人前不説人。
易漲易退山溪水，易反易覆小人心。
長江後浪催前浪，世上新人趕舊人。
筍因落籜方成竹，魚為奔波始化龍。
記得少年騎竹馬，看看又是白頭翁。
月過十五光明少，人到中年萬事休。
兒孫自有兒孫福，莫爲兒孫作馬牛。
乍富不知新受用，乍貧難改舊家風。
知音說與知音聽，不是知音莫與傾。`;
const poems=poemSource.split('。').map(s=>s.replace(/\s+/gu,'')).filter(Boolean);
const glyphs=s=>Array.from(s).filter(c=>!/[，。！？、；：\s]/u.test(c));
const challenge={phase:'idle',round:0,roundLimit:3,deck:[],poem:'',previewLeft:5,elapsed:0,found:0,total:0,targets:[],results:[]};
const panel=document.querySelector('#challenge-panel'),nextButton=document.querySelector('#next-round');
const textureCache=new Map();let feedbackUntil=0;let sentenceCharacters=[];
function shuffled(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function formatTime(seconds){const tenths=Math.floor(Math.max(0,seconds)*10+1e-7),m=Math.floor(tenths/600),s=Math.floor(tenths/10)%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${tenths%10}`;}
function setText(id,text){document.querySelector(id).textContent=text;}
function beginSession(){
 const requested=Number(document.querySelector('#round-count').value);
 challenge.roundLimit=Number.isInteger(requested)&&requested>=1&&requested<=3?requested:3;
 challenge.deck=shuffled(poems).slice(0,challenge.roundLimit);challenge.round=0;challenge.results=[];beginRound();
}
function beginRound(){
 challenge.phase='preview';challenge.poem=challenge.deck[challenge.round];challenge.previewLeft=5;challenge.elapsed=0;challenge.found=0;challenge.total=glyphs(challenge.poem).length;
 document.querySelector('#round-settings').hidden=true;
 player={x:20,y:1.8,a:Math.PI/2,pitch:0};moving=false;walk=0;shots=0;lastShot=shotTime=-10;decals.length=0;impactSmoke.length=0;tracers.length=0;impactParticles.length=0;casings.length=0;resetInputs();generateArena();
 setText('#room','彩方訓練場 / X 20.0 · Y 1.8');setText('#visited','100 CUBES');document.querySelector('#hit-feedback').classList.remove('visible');
 placeTargets();buildSentenceProgress();updateChallengeHud();document.querySelector('#challenge-hud').hidden=false;
 document.querySelector('#sentence-progress').hidden=false;view.classList.add('challenge-active');
 setText('#panel-kicker',`MEMORIZE / ROUND 0${challenge.round+1} OF 0${challenge.roundLimit}`);setText('#challenge-title','記住這一句');
 const prompt=document.querySelector('#poem-prompt');prompt.classList.remove('total-time');prompt.textContent=challenge.poem.replace('，','，\n')+'。';
 setText('#countdown','5');document.querySelector('#countdown').hidden=false;
 setText('#challenge-note','5 秒後開始。射中句中每一個字，不限順序。\n重複字要逐個命中；標點不用射擊。干擾字不計分。');
 document.querySelector('#results-list').replaceChildren();nextButton.hidden=true;panel.hidden=false;
}
function placeTargets(){
 const slots=[];for(const cube of cubes)for(let faceIndex=0;faceIndex<4;faceIndex++)slots.push({cubeId:cube.id,faceIndex});
 let available=shuffled(slots);challenge.targets=[];
 const add=(slot,item)=>{const target={...slot,...item,id:challenge.targets.length,hit:false};target.image=targetTexture(target.char,false);challenge.targets.push(target);cubes[target.cubeId].faces[target.faceIndex]=target;};
 glyphs(challenge.poem).forEach((char,poemIndex)=>{
  const quadrant=poemIndex%4,belongs=slot=>{const c=cubes[slot.cubeId];return (c.x>=20?1:0)+(c.y>=20?2:0)===quadrant;};
  let candidates=available.filter(slot=>belongs(slot)&&(poemIndex>=3||cubes[slot.cubeId].level===poemIndex));
  if(!candidates.length&&poemIndex<3)candidates=available.filter(slot=>cubes[slot.cubeId].level===poemIndex);
  if(!candidates.length)candidates=available.filter(belongs);if(!candidates.length)candidates=available;
  const slot=candidates[0];available=available.filter(s=>s!==slot);add(slot,{char,poemIndex,correct:true});
 });
 const excluded=new Set(glyphs(challenge.poem)),alphabet=shuffled([...new Set(glyphs(poemSource+'天地玄黃宇宙洪荒星雲海山河風雪日夜夢舟石松雨雁燕琴棋書畫'))].filter(c=>!excluded.has(c))).slice(0,20);
 shuffled(available).slice(0,Math.round(slots.length*.7)-challenge.targets.length).forEach((slot,i)=>add(slot,{char:alphabet[i%alphabet.length],poemIndex:null,correct:false}));
}
function targetTexture(char,hit){
 const key=char+(hit?'1':'0');if(textureCache.has(key))return textureCache.get(key);
 const image=document.createElement('canvas');image.width=image.height=192;const c=image.getContext('2d');
 c.clearRect(0,0,192,192);
 // Transparent texture: only the glyph is drawn, with no backing or outline.
 c.fillStyle=hit?'#ffe8a0':'#d5d4eb';
 if(hit){c.shadowColor='#ffd66b';c.shadowBlur=13;}
 c.font='700 126px "Noto Sans TC", "Microsoft JhengHei", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(char,96,101);
 textureCache.set(key,image);return image;
}
function tickChallenge(elapsed){
 if(challenge.phase==='preview'){
  challenge.previewLeft=Math.max(0,challenge.previewLeft-elapsed);const text=String(Math.ceil(challenge.previewLeft));if(document.querySelector('#countdown').textContent!==text)setText('#countdown',text);
  if(challenge.previewLeft===0){challenge.phase='playing';panel.hidden=true;resetInputs();setText('#mode','CUBE RANGE ACTIVE');}
 }else if(challenge.phase==='playing'){challenge.elapsed+=elapsed;setText('#round-clock',formatTime(challenge.elapsed));}
 if(feedbackUntil>0){feedbackUntil-=elapsed;if(feedbackUntil<=0)document.querySelector('#hit-feedback').classList.remove('visible');}
}
function buildSentenceProgress(){
 const line=document.querySelector('#sentence-text');line.replaceChildren();sentenceCharacters=[];
 for(const char of Array.from(challenge.poem+'。')){
  const span=document.createElement('span');span.textContent=char;
  if(/[，。]/u.test(char))span.className='sentence-punctuation';
  else {span.className='sentence-character';sentenceCharacters.push(span);}
  line.append(span);if(char==='，')line.append(document.createElement('br'));
 }
}
function updateChallengeHud(){
 setText('#round-label',`第 ${challenge.round+1} / ${challenge.roundLimit} 局`);setText('#round-clock',formatTime(challenge.elapsed));setText('#target-count',`${challenge.found} / ${challenge.total}`);
 for(const t of challenge.targets)if(t.correct&&sentenceCharacters[t.poemIndex])sentenceCharacters[t.poemIndex].classList.toggle('found',t.hit);
 setText('#sentence-status',`已命中 ${challenge.found} / ${challenge.total} 字`);
}
function feedback(text,success){const el=document.querySelector('#hit-feedback');el.textContent=text;el.style.color=success?'#ffdc86':'#b7c3ae';el.classList.add('visible');feedbackUntil=1.25;}
function processTargetShot(r,v){
 if(challenge.phase!=='playing')return;
 if(r.cubeId===null||r.faceIndex<0||r.faceIndex>=4)return;
 const cube=cubes[r.cubeId],target=cube.faces[r.faceIndex],along=r.faceIndex<2?r.y-cube.y:r.x-cube.x;
 if(Math.abs(along)>.52||Math.abs(r.z-(cube.z+CUBE_SIZE/2))>.52)return;
 if(!target)return;
 if(!target.correct){feedback(`「${target.char}」不在題目中`,false);playTone([180,135],.07,.045);return;}
 if(target.hit){feedback(`「${target.char}」已命中`,false);return;}
 target.hit=true;target.image=targetTexture(target.char,true);challenge.found++;updateChallengeHud();feedback(`命中「${target.char}」  ${challenge.found} / ${challenge.total}`,true);playTone([660,880],.08,.055);
 if(challenge.found===challenge.total)finishRound();
}
function finishRound(){
 challenge.results.push({poem:challenge.poem,seconds:challenge.elapsed});const final=challenge.results.length===challenge.roundLimit;
 challenge.phase=final?'complete':'roundResult';running=false;moving=false;resetInputs();overlay.classList.add('hidden');panel.hidden=false;
 stopBackgroundMusic();
 if(document.pointerLockElement)document.exitPointerLock();
 setText('#mode',final?'ALL ROUNDS COMPLETE':'ROUND COMPLETE');setText('#panel-kicker',final?`PROTOCOL COMPLETE / 0${challenge.roundLimit} OF 0${challenge.roundLimit}`:`ROUND 0${challenge.round+1} COMPLETE`);
 setText('#challenge-title',final?`${challenge.roundLimit} 局挑戰完成`:'本局完成');
 const prompt=document.querySelector('#poem-prompt');prompt.classList.toggle('total-time',final);prompt.textContent=final?formatTime(challenge.results.reduce((sum,r)=>sum+r.seconds,0)):challenge.poem.replace('，','，\n')+'。';
 document.querySelector('#countdown').hidden=true;
 setText('#challenge-note',final?'總用時（不含記憶倒數、暫停與局間休息）':`第 ${challenge.round+1} 局用時 ${formatTime(challenge.elapsed)}\n所有目標字均已命中。準備好後進入下一局。`);
 const list=document.querySelector('#results-list');list.replaceChildren();
 if(final)challenge.results.forEach((r,i)=>{const row=document.createElement('div'),label=document.createElement('span'),quote=document.createElement('small'),time=document.createElement('strong');row.className='result-row';label.textContent=`第 ${i+1} 局`;quote.textContent=r.poem+'。';label.append(quote);time.textContent=formatTime(r.seconds);row.append(label,time);list.append(row);});
 if(final){const settings=document.querySelector('#round-settings');nextButton.before(settings);settings.hidden=false;}
 nextButton.hidden=false;nextButton.textContent=final?'開始新挑戰 ↗':'下一局 · 記憶 5 秒 ↗';
 if(!final)challenge.round++;
 playTone(final?[523.25,659.25,783.99,1046.5,783.99,1046.5]:[523.25,659.25,783.99],final?.16:.12,.12);
}
function syncChallengePanel(){panel.hidden=challenge.phase!=='preview';}
function playTone(notes,duration,volume){
 if(!sound||!audioCtx)return;
 notes.forEach((frequency,i)=>{const at=audioCtx.currentTime+i*duration,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+duration*.95);osc.connect(gain).connect(audioCtx.destination);osc.start(at);osc.stop(at+duration);});
}
nextButton.addEventListener('click',start);
// Start rendering only after both scripts and the challenge state are initialized.
requestAnimationFrame(frame);
