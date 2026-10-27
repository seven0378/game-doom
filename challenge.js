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
const challenge={phase:'idle',round:0,roundLimit:3,deck:[],poem:'',previewLeft:5,elapsed:0,found:0,total:0,targets:[],wallTargets:new Map(),results:[]};
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
 player={x:7.5,y:10.5,a:-Math.PI/2,pitch:0};currentRoom=0;moving=false;walk=0;shots=0;lastShot=shotTime=-10;decals.length=0;impactSmoke.length=0;seen.clear();seen.add(0);resetInputs();
 setText('#room','01 / 接收大廳');setText('#visited','1 OF 4');document.querySelector('#hit-feedback').classList.remove('visible');
 placeTargets();buildSentenceProgress();updateChallengeHud();document.querySelector('#challenge-hud').hidden=false;
 document.querySelector('#sentence-progress').hidden=false;view.classList.add('challenge-active');
 setText('#panel-kicker',`MEMORIZE / ROUND 0${challenge.round+1} OF 0${challenge.roundLimit}`);setText('#challenge-title','記住這一句');
 const prompt=document.querySelector('#poem-prompt');prompt.classList.remove('total-time');prompt.textContent=challenge.poem.replace('，','，\n')+'。';
 setText('#countdown','5');document.querySelector('#countdown').hidden=false;
 setText('#challenge-note','5 秒後開始。射中句中每一個字，不限順序。\n重複字要逐個命中；標點不用射擊。干擾字不計分。');
 document.querySelector('#results-list').replaceChildren();nextButton.hidden=true;panel.hidden=false;
}
function wallKey(t){return `${t.mx},${t.my},${t.side},${t.face}`;}
function wallSlots(r){
 const slots=[];
 // One slot per exposed wall-tile face, including the sides of buttresses.
 for(let fy=r.y;fy<r.y+12;fy++)for(let fx=r.x;fx<r.x+12;fx++){
  if(world[fy]?.[fx]!==0)continue;
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
   const mx=fx+dx,my=fy+dy,side=dy?1:0,face=-(dx||dy);
   if(world[my]?.[mx]>0)slots.push({mx,my,side,face,u:(side?fx:fy)+.5,v:0,room:r.index,radius:.28});
  }
 }
 return slots;
}
function placeTargets(){
 const correct=shuffled(glyphs(challenge.poem).map((char,poemIndex)=>({char,poemIndex}))),excluded=new Set(correct.map(t=>t.char));
 const pool=[...new Set(glyphs(poemSource+'天地玄黃宇宙洪荒星雲海山河風雪日夜夢舟石松雨雁燕琴棋書畫'))].filter(c=>!excluded.has(c));
 // Twenty different distractor characters repeat to fill ~70% of exposed faces.
 const decoyAlphabet=shuffled(pool).slice(0,20),buckets=rooms.map(()=>[]);let decoyIndex=0;
 // Guarantee target characters in all four rooms; duplicate occurrences stay separate.
 correct.forEach((item,i)=>buckets[i%4].push({...item,correct:true}));
 const roomOrder=shuffled(rooms.map(r=>r.index));challenge.targets=[];challenge.wallTargets.clear();
 buckets.forEach((bucket,i)=>{const slots=shuffled(wallSlots(rooms[roomOrder[i]])),count=Math.round(slots.length*.7);
  while(bucket.length<count)bucket.push({char:decoyAlphabet[decoyIndex++%decoyAlphabet.length],correct:false,poemIndex:null});
  shuffled(bucket).forEach((item,j)=>{
  const target={...slots[j],...item,id:challenge.targets.length,hit:false};target.image=targetTexture(target.char,false);challenge.targets.push(target);
  const key=wallKey(target);if(!challenge.wallTargets.has(key))challenge.wallTargets.set(key,[]);challenge.wallTargets.get(key).push(target);
 });});
}
function targetTexture(char,hit){
 const key=char+(hit?'1':'0');if(textureCache.has(key))return textureCache.get(key);
 const image=document.createElement('canvas');image.width=image.height=192;const c=image.getContext('2d');
 c.clearRect(0,0,192,192);
 // Transparent texture: only the glyph is drawn, with no backing or outline.
 c.fillStyle=hit?'#ffd080':'#bac4aa';
 if(hit){c.shadowColor='#ffb342';c.shadowBlur=13;}
 c.font='700 126px "Noto Sans TC", "Microsoft JhengHei", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(char,96,101);
 textureCache.set(key,image);return image;
}
function renderWallTargets(r,x,height,horizon){
 const targets=challenge.wallTargets.get(wallKey(r));if(!targets)return;
 for(const target of targets){const du=r.u-target.u,half=.38;if(Math.abs(du)>=half)continue;
  let tx=clamp(Math.floor((du+half)/(2*half)*192),0,191);
  // Keep glyphs readable on opposing wall faces rather than mirroring them.
  if((r.side===0&&r.face===1)||(r.side===1&&r.face===-1))tx=191-tx;
  ctx.globalAlpha=target.hit?1:.58;ctx.drawImage(target.image,tx,0,1,192,x,horizon+(target.v-half)*height,1,2*half*height);ctx.globalAlpha=1;
 }
}
function tickChallenge(elapsed){
 if(challenge.phase==='preview'){
  challenge.previewLeft=Math.max(0,challenge.previewLeft-elapsed);const text=String(Math.ceil(challenge.previewLeft));if(document.querySelector('#countdown').textContent!==text)setText('#countdown',text);
  if(challenge.previewLeft===0){challenge.phase='playing';panel.hidden=true;resetInputs();setText('#mode','POETRY PROTOCOL ACTIVE');}
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
 const target=(challenge.wallTargets.get(wallKey(r))||[]).find(t=>Math.abs(r.u-t.u)<=t.radius&&Math.abs(v-t.v)<=t.radius);
 if(!target)return;
 if(!target.correct){feedback(`「${target.char}」不在題目中`,false);playTone([180,135],.07,.045);return;}
 if(target.hit){feedback(`「${target.char}」已命中`,false);return;}
 target.hit=true;target.image=targetTexture(target.char,true);challenge.found++;updateChallengeHud();feedback(`命中「${target.char}」  ${challenge.found} / ${challenge.total}`,true);playTone([660,880],.08,.055);
 if(challenge.found===challenge.total)finishRound();
}
function finishRound(){
 challenge.results.push({poem:challenge.poem,seconds:challenge.elapsed});const final=challenge.results.length===challenge.roundLimit;
 challenge.phase=final?'complete':'roundResult';running=false;moving=false;resetInputs();overlay.classList.add('hidden');panel.hidden=false;
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
