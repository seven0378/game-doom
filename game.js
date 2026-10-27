'use strict';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d',{alpha:false});
const W=640,PROJECTION=W/1.44;let H=360;canvas.width=W;canvas.height=H;
const view=document.querySelector('#viewport'),overlay=document.querySelector('#overlay');
const mini=document.querySelector('#map'),mc=mini.getContext('2d');
const N=31,world=Array.from({length:N},()=>Array(N).fill(1));
const rooms=[{x:2,y:2,name:'接收大廳',color:[158,173,112]},{x:17,y:2,name:'能源核心',color:[88,170,184]},{x:17,y:17,name:'軍械庫',color:[192,116,66]},{x:2,y:17,name:'反應爐',color:[168,105,90]}];
rooms.forEach((r,i)=>{for(let y=r.y;y<r.y+12;y++)for(let x=r.x;x<r.x+12;x++)world[y][x]=0;r.index=i;});
// Two-cell-wide corridors join all four rooms into a single loop.
for(let x=14;x<=16;x++){world[7][x]=world[8][x]=0;world[22][x]=world[23][x]=0;}
for(let y=14;y<=16;y++){world[y][7]=world[y][8]=0;world[y][22]=world[y][23]=0;}
// Wall-mounted buttresses preserve the open floor area in every room.
rooms.forEach(r=>{for(const [dx,dy] of [[0,3],[0,8],[11,3],[11,8],[3,0],[8,0],[3,11],[8,11]])world[r.y+dy][r.x+dx]=2;});
let player={x:7.5,y:10.5,a:-Math.PI/2,pitch:0},running=false,last=0,walk=0,moving=false,shotTime=-10,lastShot=-10,shots=0,currentRoom=0;
let audioCtx,sound=true,mouseDown=false,padFire=false,touchFire=false,activePad=false;
const keys=new Set(),seen=new Set([0]),moveStick={x:0,y:0},lookStick={x:0,y:0};
const decals=[],textures=[],impactSmoke=[],wallDepth=new Float32Array(W);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function roomAt(x,y){return rooms.find(r=>x>=r.x-1&&x<r.x+13&&y>=r.y-1&&y<r.y+13);}
function solid(x,y){return world[Math.floor(y)]?.[Math.floor(x)]!==0;}
function colorFor(x,y){return(roomAt(x,y)||rooms[currentRoom]).color;}
// Original procedural textures, no downloaded game assets.
for(let i=0;i<4;i++){
 const t=document.createElement('canvas');t.width=t.height=64;const c=t.getContext('2d');
 c.fillStyle='#696e5c';c.fillRect(0,0,64,64);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const n=((x*17+y*31+(x*y)%19)%11)-5;c.fillStyle=`rgba(${100+n},${110+n},${91+n},.35)`;c.fillRect(x,y,1,1);}
 c.fillStyle='#323b32';c.fillRect(0,0,2,64);c.fillRect(62,0,2,64);c.fillRect(0,0,64,3);c.fillRect(0,61,64,3);
 c.fillStyle='#849079';c.fillRect(3,4,1,55);c.fillRect(4,4,55,1);c.fillStyle='#4a5448';c.fillRect(8,12,48,40);
 c.strokeStyle='#6c7863';c.strokeRect(9.5,13.5,45,37);
 c.fillStyle='#252e27';for(let j=0;j<5;j++)c.fillRect(15,20+j*5,34,2);
 c.fillStyle=`rgb(${rooms[i].color.join(',')})`;c.fillRect(6,6,52,3);c.fillRect(7,55,12,2);
 c.fillStyle='#adb394';for(const x of[5,58])for(const y of[12,51])c.fillRect(x,y,2,2);
 textures.push(t);
}
let floorImage=ctx.createImageData(W,H),pix=floorImage.data;
function resizeView(){const ratio=view.clientHeight/view.clientWidth;if(!Number.isFinite(ratio)||ratio<=0)return;H=Math.round(W*ratio);canvas.width=W;canvas.height=H;floorImage=ctx.createImageData(W,H);pix=floorImage.data;}
window.addEventListener('resize',resizeView);resizeView();
function ray(x,y,dx,dy){
 let mx=Math.floor(x),my=Math.floor(y),ddx=Math.abs(1/(dx||1e-10)),ddy=Math.abs(1/(dy||1e-10));
 let sx=dx<0?-1:1,sy=dy<0?-1:1,sdx=(dx<0?x-mx:mx+1-x)*ddx,sdy=(dy<0?y-my:my+1-y)*ddy,side=0;
 for(let n=0;n<80;n++){if(sdx<sdy){sdx+=ddx;mx+=sx;side=0;}else{sdy+=ddy;my+=sy;side=1;}if(world[my]?.[mx]!==0)break;}
 let d=side?(my-y+(1-sy)/2)/(dy||1e-10):(mx-x+(1-sx)/2)/(dx||1e-10);
 return {d:Math.max(.01,d),side,face:side?(dy<0?1:-1):(dx<0?1:-1),mx,my,u:side?x+d*dx:y+d*dy,x:x+d*dx,y:y+d*dy};
}
function viewHorizon(){return Math.round(H/2+player.pitch+(moving?Math.sin(walk*2)*1.1:0));}
function render(t){
 const ca=Math.cos(player.a),sa=Math.sin(player.a),fov=.72,px=-sa*fov,py=ca*fov;
 const horizon=viewHorizon();
 // Perspective floor and ceiling with inset tiles, seams, and light strips.
 for(let y=0;y<H;y++){
  const below=y>horizon,dist=(PROJECTION*.5)/Math.max(1,Math.abs(y-horizon));
  let fx=player.x+dist*(ca-px),fy=player.y+dist*(sa-py);const stepx=2*dist*px/W,stepy=2*dist*py/W;
  const shade=clamp(1/(1+dist*.09),.05,.9);
  for(let x=0;x<W;x++,fx+=stepx,fy+=stepy){
   let tx=fx-Math.floor(fx),ty=fy-Math.floor(fy),edge=tx<.025||ty<.025;
   let value=below?(edge?23:46+((Math.floor(fx)+Math.floor(fy))%2)*5):(edge?22:32);
   let rr=value*.88,gg=value,bb=value*.86;
   if(!below&&((Math.floor(fx)%4+4)%4===0)&&ty>.39&&ty<.53&&tx>.12&&tx<.88){rr=170;gg=181;bb=144;}
   if(below&&(tx<.045||tx>.955)&&Math.floor(fx)%6===0){rr=87;gg=74;bb=40;}
   const k=(y*W+x)*4;pix[k]=rr*shade;pix[k+1]=gg*shade;pix[k+2]=bb*shade;pix[k+3]=255;
  }
 }
 ctx.putImageData(floorImage,0,0);
 for(let x=0;x<W;x++){
  const cam=2*x/W-1,r=ray(player.x,player.y,ca+px*cam,sa+py*cam),height=PROJECTION/r.d;
  wallDepth[x]=r.d;
  const top=horizon-height*.5,room=roomAt(r.mx+.5,r.my+.5)||roomAt(r.x-.01*(ca+px*cam),r.y-.01*(sa+py*cam))||rooms[currentRoom];
  ctx.drawImage(textures[room.index],Math.floor((r.u-Math.floor(r.u))*64),0,1,64,x,top,1,height);
  const darkness=clamp(.12+r.d*.035+(r.side?.15:0),.15,.94);
  ctx.fillStyle=`rgba(5,13,10,${darkness})`;ctx.fillRect(x,top,1,height);
  // Warm/cool bands distinguish each sector at eye level.
  ctx.fillStyle=`rgba(${room.color.join(',')},${clamp(.25-r.d*.009,.03,.23)})`;ctx.fillRect(x,top+height*.11,1,height*.04);
  for(const mark of decals){if(mark.mx===r.mx&&mark.my===r.my&&mark.side===r.side&&Math.abs(r.u-mark.u)<.032){ctx.fillStyle='#141b16';ctx.fillRect(x,horizon+height*mark.v-2,1,4);}}
  renderWallTargets(r,x,height,horizon);
 }
 drawImpactSmoke();
 // Weapon bob, recoil, and a hand-drawn first-person pulse rifle.
 drawWeapon(t);
}
function drawWeapon(t){
 const since=t-shotTime,recoil=since<.18?Math.sin(since/.18*Math.PI)*14:0;
 const bob=moving?Math.sin(walk)*3:Math.sin(t*1.5)*.65;
 // Fit the model to the viewport, not fixed canvas pixels. Keep the barrel
 // within the bottom 30% and the muzzle flash below the central aiming area.
 const weaponScale=Math.min(H*.30/212,W*.22/203);
 ctx.save();ctx.translate(W*.56+(moving?Math.cos(walk)*3*weaponScale:0),H+(recoil+bob)*weaponScale);ctx.scale(weaponScale,weaponScale);
 function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
 poly([[-86,0],[-90,-42],[-64,-83],[-40,-79],[-31,-33],[-30,0]],'#4b5140','#1e2923');
 poly([[65,0],[50,-53],[47,-82],[70,-84],[97,-41],[113,0]],'#515743','#1c2721');
 poly([[-44,0],[-46,-72],[-30,-142],[-15,-175],[17,-175],[35,-139],[58,-69],[61,0]],'#242f2b','#101b17');
 poly([[-30,-142],[-22,-185],[-14,-197],[14,-197],[23,-184],[28,-139]],'#454f49','#101915');
 poly([[-18,-184],[-14,-211],[14,-211],[18,-184]],'#202c29','#101b17');
 ctx.fillStyle='#0b1411';ctx.fillRect(-12,-210,24,10);ctx.fillStyle='#626a5a';ctx.fillRect(-9,-212,18,3);
 poly([[-31,-141],[-13,-161],[15,-161],[34,-140],[36,-83],[-37,-83]],'#727967','#1b2822');
 poly([[-14,-150],[-7,-162],[8,-162],[17,-150],[16,-99],[-15,-99]],'#35483f','#a2a68b');
 ctx.fillStyle='#adbf8a';ctx.fillRect(-7,-153,13,5);ctx.fillStyle='#df9a4b';ctx.fillRect(-7,-144,13,3);
 for(let i=0;i<4;i++){ctx.fillStyle='#151f1a';ctx.fillRect(-26,-128+i*8,8,3);ctx.fillRect(22,-128+i*8,8,3);}
 poly([[-36,-80],[36,-80],[48,-27],[34,0],[-37,0],[-49,-27]],'#48564a','#18251e');
 ctx.fillStyle='#202e25';ctx.fillRect(-22,-68,43,39);ctx.fillStyle='#c8c8a2';ctx.font='8px monospace';ctx.fillText('M—01',-14,-48);
 ctx.fillStyle='#a5b08b';ctx.fillRect(-15,-23,30,3);
 if(since<.075){ctx.globalCompositeOperation='screen';poly([[0,-260],[9,-226],[29,-239],[16,-214],[30,-206],[7,-202],[0,-184],[-8,-204],[-28,-209],[-13,-221],[-21,-240],[-6,-228]],'#ffb44f');poly([[0,-246],[8,-217],[0,-200],[-7,-218]],'#fff5bd');ctx.globalCompositeOperation='source-over';}
 ctx.restore();
 if(since<.06){ctx.fillStyle=`rgba(255,178,76,${(.06-since)*.65})`;ctx.fillRect(0,0,W,H);}
}
function drawMap(){
 mc.fillStyle='#101a14';mc.fillRect(0,0,148,148);const s=4.4,off=6;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){if(!world[y][x]){const r=roomAt(x+.5,y+.5);mc.fillStyle=r&&seen.has(r.index)?'#5a654d':'#303d30';mc.fillRect(off+x*s,off+y*s,s-.6,s-.6);}}
 rooms.forEach((r,i)=>{mc.fillStyle=seen.has(i)?'#d0bc87':'#5e6a55';mc.font='10px monospace';mc.fillText('0'+(i+1),off+(r.x+4.6)*s,off+(r.y+6)*s);});
 mc.save();mc.translate(off+player.x*s,off+player.y*s);mc.rotate(player.a);mc.fillStyle='#ffae57';mc.beginPath();mc.moveTo(6,0);mc.lineTo(-3,-3);mc.lineTo(-2,0);mc.lineTo(-3,3);mc.closePath();mc.fill();mc.restore();
}
function initAudio(){if(!audioCtx)try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch{}if(audioCtx?.state==='suspended')audioCtx.resume();}
const smokeTexture=document.createElement('canvas');smokeTexture.width=smokeTexture.height=64;
{
 const c=smokeTexture.getContext('2d'),gradient=c.createRadialGradient(32,32,0,32,32,32);
 gradient.addColorStop(0,'rgba(191,193,177,.8)');gradient.addColorStop(.35,'rgba(153,158,146,.5)');gradient.addColorStop(1,'rgba(130,138,126,0)');c.fillStyle=gradient;c.fillRect(0,0,64,64);
}
function spawnImpactSmoke(r,v){
 // The horizontal ray can reach above/below a wall when looking up/down.
 if(Math.abs(v)>.5)return;
 for(let i=0;i<7;i++){
  impactSmoke.push({x:r.x+(r.side===0?r.face*.07:0)+(Math.random()-.5)*.025,y:r.y+(r.side===1?r.face*.07:0)+(Math.random()-.5)*.025,z:.5-v,age:0,life:.55+Math.random()*.3,drift:(Math.random()-.5)*.12,rise:.1+Math.random()*.12,size:.045+Math.random()*.035});
 }
 if(impactSmoke.length>140)impactSmoke.splice(0,impactSmoke.length-140);
}
function advanceImpactSmoke(elapsed){for(let i=impactSmoke.length-1;i>=0;i--){impactSmoke[i].age+=elapsed;if(impactSmoke[i].age>=impactSmoke[i].life)impactSmoke.splice(i,1);}}
function drawImpactSmoke(){
 const ca=Math.cos(player.a),sa=Math.sin(player.a),horizon=viewHorizon();
 const particles=impactSmoke.map(p=>{const age=p.age,dx=p.x+age*p.drift-player.x,dy=p.y+age*p.drift*.5-player.y;return {p,depth:dx*ca+dy*sa,lateral:-dx*sa+dy*ca};}).sort((a,b)=>b.depth-a.depth);
 for(const {p,depth,lateral} of particles){
  if(depth<=.06)continue;
  const radius=(p.size+p.age*.12)*PROJECTION/depth,x=W/2+lateral*PROJECTION/depth,y=horizon-(p.z+p.age*p.rise-.5)*PROJECTION/depth;
  const left=x-radius,top=y-radius,size=2*radius;
  ctx.globalAlpha=.48*(1-p.age/p.life);
  for(let col=Math.max(0,Math.floor(left));col<Math.min(W,Math.ceil(x+radius));col++){
   if(wallDepth[col]<depth-.03)continue;
   const source=clamp(Math.floor((col-left)/size*64),0,63);ctx.drawImage(smokeTexture,source,0,1,64,col,top,1,size);
  }
 }
 ctx.globalAlpha=1;
}
function shoot(t){
 if(t-lastShot<.19||!running||challenge.phase!=='playing')return;lastShot=shotTime=t;shots++;
 const r=ray(player.x,player.y,Math.cos(player.a),Math.sin(player.a));
 const impactV=(H/2-viewHorizon())*r.d/PROJECTION;
 decals.push({...r,v:impactV});if(decals.length>60)decals.shift();
 spawnImpactSmoke(r,impactV);
 document.querySelector('#shot-marker').style.opacity='.7';setTimeout(()=>document.querySelector('#shot-marker').style.opacity='0',65);
 if(sound&&audioCtx){const duration=.16,b=audioCtx.createBuffer(1,audioCtx.sampleRate*duration,audioCtx.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/(audioCtx.sampleRate*.027));const src=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();src.buffer=b;filter.type='lowpass';filter.frequency.value=2400;gain.gain.value=.25;src.connect(filter).connect(gain).connect(audioCtx.destination);src.start();const osc=audioCtx.createOscillator(),g=audioCtx.createGain();osc.frequency.setValueAtTime(130,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(35,audioCtx.currentTime+.12);g.gain.setValueAtTime(.15,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.13);osc.connect(g).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.14);}
 processTargetShot(r,impactV);
}
function start(){
 initAudio();
 if(challenge.phase==='idle'||challenge.phase==='complete')beginSession();
 else if(challenge.phase==='roundResult')beginRound();
 running=true;overlay.classList.add('hidden');syncChallengePanel();resetInputs();document.activeElement?.blur();
 if(!view.classList.contains('touch-on')&&!activePad){try{const p=canvas.requestPointerLock?.();p?.catch(()=>{});}catch{}}
 document.querySelector('#mode').textContent=challenge.phase==='preview'?'MEMORIZE / 5 SECONDS':'POETRY PROTOCOL ACTIVE';
}
function resetInputs(){mouseDown=touchFire=padFire=false;keys.clear();moveStick.x=moveStick.y=lookStick.x=lookStick.y=0;document.querySelectorAll('.stick>span').forEach(el=>el.style.transform='');}
function pause(){if(!running)return;running=false;moving=false;resetInputs();document.querySelector('#challenge-panel').hidden=true;overlay.classList.remove('hidden');document.querySelector('#start').innerHTML='繼續挑戰 <span>↗</span>';document.querySelector('#pause-hint').textContent='已暫停 · 計時與記憶倒數均暫停';document.querySelector('#mode').textContent='SIMULATION PAUSED';if(document.pointerLockElement)document.exitPointerLock();}
document.querySelector('#start').addEventListener('click',start);
document.querySelector('#sound').onclick=()=>{sound=!sound;document.querySelector('#sound').innerHTML=`聲音 ${sound?'ON':'OFF'} <span>${sound?'◖))':'×'}</span>`;initAudio();};
document.querySelector('#toggle-touch').onclick=()=>{const on=view.classList.toggle('touch-on');document.querySelector('#toggle-touch').textContent=on?'隱藏搖桿':'顯示搖桿';if(on&&document.pointerLockElement)document.exitPointerLock();};
if(matchMedia('(pointer:coarse)').matches){view.classList.add('touch-on');document.querySelector('#toggle-touch').textContent='隱藏搖桿';}
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){pause();return;}if(running)keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&!view.classList.contains('touch-on')&&!activePad)pause();});
canvas.addEventListener('pointerdown',e=>{if(!running||e.button!==0)return;mouseDown=true;initAudio();if(!document.pointerLockElement&&!view.classList.contains('touch-on'))try{canvas.requestPointerLock?.()?.catch(()=>{});}catch{}});
window.addEventListener('pointerup',()=>mouseDown=false);
document.addEventListener('mousemove',e=>{if(running&&challenge.phase==='playing'&&document.pointerLockElement===canvas){player.a+=e.movementX*.0011;player.pitch=clamp(player.pitch-e.movementY*.16,-70,70);}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function setupStick(id,state){const el=document.querySelector(id),knob=el.querySelector('span');let pointer=null;function update(e){const r=el.getBoundingClientRect(),rad=r.width*.36;let x=(e.clientX-r.left-r.width/2)/rad,y=(e.clientY-r.top-r.height/2)/rad;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}state.x=x;state.y=y;knob.style.transform=`translate(${x*rad*.7}px,${y*rad*.7}px)`;}el.addEventListener('pointerdown',e=>{if(!running)return;pointer=e.pointerId;el.setPointerCapture(pointer);update(e);});el.addEventListener('pointermove',e=>{if(e.pointerId===pointer)update(e);});function end(e){if(e.pointerId===pointer){pointer=null;state.x=state.y=0;knob.style.transform='';}}el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);}
setupStick('#move-stick',moveStick);setupStick('#look-stick',lookStick);
const fireButton=document.querySelector('#touch-fire');fireButton.addEventListener('pointerdown',e=>{if(!running)return;fireButton.setPointerCapture(e.pointerId);touchFire=true;initAudio();});['pointerup','pointercancel','lostpointercapture'].forEach(type=>fireButton.addEventListener(type,()=>touchFire=false));
let prevStart=false;
function getPad(){const p=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);const connected=!!p;if(activePad!==connected){activePad=connected;document.querySelector('#pad-label').textContent=connected?'手把已連線 · RT 射擊':'支援手把 / 螢幕搖桿';document.querySelector('#pad-dot').textContent=connected?'●':'◇';}return p;}
const dead=v=>Math.abs(v)<.16?0:Math.sign(v)*(Math.abs(v)-.16)/.84;
const aimCurve=v=>Math.sign(v)*Math.abs(v)**2;
function update(dt,t,elapsed=dt){
 const p=getPad();let pressed=p?.buttons[9]?.pressed||p?.buttons[0]?.pressed;
 if(pressed&&!prevStart){if(running)pause();else start();}prevStart=pressed;
 if(!running)return;
 advanceImpactSmoke(elapsed);
 tickChallenge(elapsed);
 if(challenge.phase!=='playing')return;
 const axis=i=>dead(p?.axes[i]||0),button=i=>p?.buttons[i]?.pressed;
 const keyboardTurn=(keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0);
 player.a+=(keyboardTurn+aimCurve(axis(2))*1.45+aimCurve(lookStick.x)*1.45)*dt;
 player.pitch=clamp(player.pitch-(aimCurve(axis(3))+aimCurve(lookStick.y))*65*dt,-70,70);
 let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-axis(1)-moveStick.y;
 let strafe=(keys.has('KeyD')||keys.has('KeyE')?1:0)-(keys.has('KeyA')||keys.has('KeyQ')?1:0)+axis(0)+moveStick.x;
 const len=Math.hypot(forward,strafe);if(len>1){forward/=len;strafe/=len;}moving=len>.06;
 const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')||button(10)?4.7:2.9)*dt;
 const dx=(Math.cos(player.a)*forward-Math.sin(player.a)*strafe)*speed,dy=(Math.sin(player.a)*forward+Math.cos(player.a)*strafe)*speed;
 function can(x,y){const r=.23;return !solid(x-r,y-r)&&!solid(x+r,y-r)&&!solid(x-r,y+r)&&!solid(x+r,y+r);}
 if(can(player.x+dx,player.y))player.x+=dx;if(can(player.x,player.y+dy))player.y+=dy;
 if(moving)walk+=dt*(speed/dt)*2.2;
 const r=roomAt(player.x,player.y);if(r){currentRoom=r.index;seen.add(currentRoom);document.querySelector('#room').textContent=`0${currentRoom+1} / ${r.name}`;document.querySelector('#visited').textContent=`${seen.size} OF 4`;}
 padFire=button(7)||button(5);if(mouseDown||keys.has('Space')||keys.has('KeyF')||padFire||touchFire)shoot(t);
}
function frame(ms){const t=ms/1000,elapsed=last?Math.max(0,t-last):0,dt=Math.min(.035,elapsed);last=t;update(dt,t,elapsed);render(t);drawMap();requestAnimationFrame(frame);}
// Expose read-only diagnostics for map and input verification.
window.gameDiagnostics=()=>({rooms:rooms.map(r=>({name:r.name,x:r.x,y:r.y,width:12,height:12})),world:world.map(row=>[...row]),player:{...player},running,shots,visited:[...seen],gamepad:activePad,challenge:{phase:challenge.phase,round:challenge.round+1,remaining:challenge.previewLeft,elapsed:challenge.elapsed,found:challenge.found,total:challenge.total,results:challenge.results.map(r=>({...r})),targets:challenge.targets.map(({image,...t})=>({...t})),poem:challenge.poem}});
