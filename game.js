'use strict';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d',{alpha:false});
const view=document.querySelector('#viewport'),overlay=document.querySelector('#overlay'),mini=document.querySelector('#map'),mc=mini.getContext('2d');
const W=960,PROJECTION=W/(2*Math.tan(38*Math.PI/180)),ARENA=40,CUBE_SIZE=1.4,EYE_HEIGHT=1.65;let H=540;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const FACE_NORMALS=[{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}];
const cubePalette=['#347cb8','#d38a45','#a45b80','#58968a','#796bb6','#b6a04d','#5285a1','#b46559'];
const cubes=[],columns=[],decals=[],impactSmoke=[];
let player={x:20,y:1.8,a:Math.PI/2,pitch:0},running=false,last=0,walk=0,moving=false,shotTime=-10,lastShot=-10,shots=0;
let audioCtx,sound=true,mouseDown=false,padFire=false,touchFire=false,activePad=false,showTargetHints=false;
const keys=new Set(),moveStick={x:0,y:0},lookStick={x:0,y:0};
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function generateArena(){
 cubes.length=columns.length=0;
 const sites=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)sites.push({x:4.6+x*4.4,y:4.6+y*4.4});
 const heights=shuffle([...Array(20).fill(1),...Array(16).fill(2),...Array(16).fill(3)]);
 shuffle(sites).slice(0,52).forEach((site,index)=>{
  const column={...site,levels:heights[index],id:index};columns.push(column);
  for(let level=0;level<column.levels;level++)cubes.push({id:cubes.length,column:index,x:site.x,y:site.y,z:level*CUBE_SIZE,level,color:cubePalette[Math.floor(Math.random()*cubePalette.length)],faces:Array(6).fill(null)});
 });
}
generateArena();
function resizeView(){const ratio=view.clientHeight/view.clientWidth;if(!Number.isFinite(ratio)||ratio<=0)return;H=Math.round(W*ratio);canvas.width=W;canvas.height=H;}
window.addEventListener('resize',resizeView);canvas.width=W;canvas.height=H;resizeView();
function cameraBasis(){const ca=Math.cos(player.a),sa=Math.sin(player.a),cp=Math.cos(player.pitch),sp=Math.sin(player.pitch);return {f:{x:ca*cp,y:sa*cp,z:sp},r:{x:-sa,y:ca,z:0},u:{x:-ca*sp,y:-sa*sp,z:cp}};}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
function screenRay(x=W/2,y=H/2){const b=cameraBasis(),sx=(x-W/2)/PROJECTION,sy=(H/2-y)/PROJECTION;const d={x:b.f.x+sx*b.r.x+sy*b.u.x,y:b.f.y+sx*b.r.y+sy*b.u.y,z:b.f.z+sx*b.r.z+sy*b.u.z};const n=Math.hypot(d.x,d.y,d.z);return {x:d.x/n,y:d.y/n,z:d.z/n};}
function cameraPoint(p){const b=cameraBasis(),d={x:p.x-player.x,y:p.y-player.y,z:p.z-EYE_HEIGHT};return {x:dot(d,b.r),y:dot(d,b.u),depth:dot(d,b.f)};}
function projectPoint(p){const c=cameraPoint(p);return {x:W/2+c.x*PROJECTION/c.depth,y:H/2-c.y*PROJECTION/c.depth,depth:c.depth};}
function rayBox(origin,direction,box){
 let near=-Infinity,far=Infinity,nearFace=-1,farFace=-1;
 const mins=[box.x-CUBE_SIZE/2,box.y-CUBE_SIZE/2,box.z],maxs=[box.x+CUBE_SIZE/2,box.y+CUBE_SIZE/2,box.z+CUBE_SIZE];
 const axes=['x','y','z'],negative=[1,3,5],positive=[0,2,4];
 for(let i=0;i<3;i++){
  const o=origin[axes[i]],d=direction[axes[i]];
  if(Math.abs(d)<1e-9){if(o<mins[i]||o>maxs[i])return null;continue;}
  let a=(mins[i]-o)/d,b=(maxs[i]-o)/d,af=negative[i],bf=positive[i];if(a>b){[a,b]=[b,a];[af,bf]=[bf,af];}
  if(a>near){near=a;nearFace=af;}if(b<far){far=b;farFace=bf;}if(near>far)return null;
 }
 if(far<.001)return null;return near>=.001?{d:near,faceIndex:nearFace}:{d:far,faceIndex:farFace};
}
function traceScene(direction,origin={x:player.x,y:player.y,z:EYE_HEIGHT},limit=Infinity){
 let nearest=null,best=limit;
 for(const cube of cubes){const r=rayBox(origin,direction,cube);if(r&&r.d<best){best=r.d;nearest={...r,cubeId:cube.id,normal:FACE_NORMALS[r.faceIndex]};}}
 // One enclosed room; ceiling and floor have no target text.
 for(const [axis,plane,normal] of [['x',0,{x:1,y:0,z:0}],['x',ARENA,{x:-1,y:0,z:0}],['y',0,{x:0,y:1,z:0}],['y',ARENA,{x:0,y:-1,z:0}],['z',0,{x:0,y:0,z:1}],['z',7,{x:0,y:0,z:-1}]]){
  if(Math.abs(direction[axis])<1e-9)continue;const d=(plane-origin[axis])/direction[axis];if(d>.001&&d<best){best=d;nearest={d,cubeId:null,faceIndex:-1,normal};}
 }
 return nearest?{...nearest,x:origin.x+direction.x*best,y:origin.y+direction.y*best,z:origin.z+direction.z*best}:null;
}
function isPointVisible(p){const d={x:p.x-player.x,y:p.y-player.y,z:p.z-EYE_HEIGHT},length=Math.hypot(d.x,d.y,d.z);if(length<.06)return false;d.x/=length;d.y/=length;d.z/=length;return !traceScene(d,undefined,length-.12);}
function solid(x,y,radius=.25){if(x<radius||y<radius||x>ARENA-radius||y>ARENA-radius)return true;return columns.some(c=>Math.abs(x-c.x)<CUBE_SIZE/2+radius&&Math.abs(y-c.y)<CUBE_SIZE/2+radius);}
function faceVertices(cube,face,inset=0){
 const half=CUBE_SIZE/2-inset,x=cube.x,y=cube.y,z=cube.z+inset,top=cube.z+CUBE_SIZE-inset;
 const sides=[ [{x:x+half,y:y-half,z:top},{x:x+half,y:y+half,z:top},{x:x+half,y:y+half,z},{x:x+half,y:y-half,z}],
 [{x:x-half,y:y+half,z:top},{x:x-half,y:y-half,z:top},{x:x-half,y:y-half,z},{x:x-half,y:y+half,z}],
 [{x:x+half,y:y+half,z:top},{x:x-half,y:y+half,z:top},{x:x-half,y:y+half,z},{x:x+half,y:y+half,z}],
 [{x:x-half,y:y-half,z:top},{x:x+half,y:y-half,z:top},{x:x+half,y:y-half,z},{x:x-half,y:y-half,z}],
 [{x:x-half,y:y-half,z:top},{x:x+half,y:y-half,z:top},{x:x+half,y:y+half,z:top},{x:x-half,y:y+half,z:top}],
 [{x:x-half,y:y+half,z},{x:x+half,y:y+half,z},{x:x+half,y:y-half,z},{x:x-half,y:y-half,z}] ];return face<4?[sides[face][1],sides[face][0],sides[face][3],sides[face][2]]:sides[face];
}
function clipNear(vertices){const out=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],da=cameraPoint(a).depth,db=cameraPoint(b).depth;if(da>=.08)out.push(a);if((da>=.08)!==(db>=.08)){const t=(.08-da)/(db-da);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}}return out;}
function drawPolygon(vertices,fill,stroke){const clipped=clipNear(vertices);if(clipped.length<3)return;const p=clipped.map(projectPoint);if(p.every(v=>v.x<0)||p.every(v=>v.x>W)||p.every(v=>v.y<0)||p.every(v=>v.y>H))return;ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function tint(hex,amount){const n=parseInt(hex.slice(1),16);return `rgb(${Math.round((n>>16)*amount)},${Math.round(((n>>8)&255)*amount)},${Math.round((n&255)*amount)})`;}
function triangleTexture(image,points,uv){
 const [p0,p1,p2]=points,[t0,t1,t2]=uv;const sx1=t1.x-t0.x,sy1=t1.y-t0.y,sx2=t2.x-t0.x,sy2=t2.y-t0.y,det=sx1*sy2-sx2*sy1;if(Math.abs(det)<1e-8)return;
 const ax=((p1.x-p0.x)*sy2-(p2.x-p0.x)*sy1)/det,bx=((p1.y-p0.y)*sy2-(p2.y-p0.y)*sy1)/det,cx=((p2.x-p0.x)*sx1-(p1.x-p0.x)*sx2)/det,dx=((p2.y-p0.y)*sx1-(p1.y-p0.y)*sx2)/det;
 ctx.save();ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.closePath();ctx.clip();ctx.transform(ax,bx,cx,dx,p0.x-ax*t0.x-cx*t0.y,p0.y-bx*t0.x-dx*t0.y);ctx.drawImage(image,0,0);ctx.restore();
}
function drawFaceText(cube,face,target){
 const q=faceVertices(cube,face,.18),normal=FACE_NORMALS[face];q.forEach(v=>{v.x+=normal.x*.185;v.y+=normal.y*.185;});
 if(q.some(v=>cameraPoint(v).depth<.10))return;
 const p=q.map(projectPoint);if(p.every(v=>v.x<0)||p.every(v=>v.x>W)||p.every(v=>v.y<0)||p.every(v=>v.y>H))return;
 const size=Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x));if(size<5)return;
 const divisions=size>180?4:2,at=(u,v)=>({x:q[0].x+(q[1].x-q[0].x)*u+(q[3].x-q[0].x)*v,y:q[0].y+(q[1].y-q[0].y)*u+(q[3].y-q[0].y)*v,z:q[0].z+(q[1].z-q[0].z)*u+(q[3].z-q[0].z)*v});
 ctx.globalAlpha=target.hit?1:.7;
 for(let y=0;y<divisions;y++)for(let x=0;x<divisions;x++){
  const uv=[{x:x/divisions,y:y/divisions},{x:(x+1)/divisions,y:y/divisions},{x:(x+1)/divisions,y:(y+1)/divisions},{x:x/divisions,y:(y+1)/divisions}],pts=uv.map(v=>projectPoint(at(v.x,v.y))),tex=uv.map(v=>({x:v.x*192,y:v.y*192}));
  triangleTexture(target.image,[pts[0],pts[1],pts[2]],[tex[0],tex[1],tex[2]]);triangleTexture(target.image,[pts[0],pts[2],pts[3]],[tex[0],tex[2],tex[3]]);
 }
 ctx.globalAlpha=1;
}
function render(t){
 const gradient=ctx.createLinearGradient(0,0,0,H);gradient.addColorStop(0,'#172332');gradient.addColorStop(.5,'#273544');gradient.addColorStop(1,'#111b25');ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
 // The enclosing arena and floor are rendered before the free-standing cubes.
 const walls=[[{x:0,y:0,z:0},{x:ARENA,y:0,z:0},{x:ARENA,y:0,z:7},{x:0,y:0,z:7}], [{x:ARENA,y:0,z:0},{x:ARENA,y:ARENA,z:0},{x:ARENA,y:ARENA,z:7},{x:ARENA,y:0,z:7}], [{x:ARENA,y:ARENA,z:0},{x:0,y:ARENA,z:0},{x:0,y:ARENA,z:7},{x:ARENA,y:ARENA,z:7}], [{x:0,y:ARENA,z:0},{x:0,y:0,z:0},{x:0,y:0,z:7},{x:0,y:ARENA,z:7}]];
 walls.forEach(w=>drawPolygon(w,'#263441','#435464'));
 drawPolygon([{x:0,y:0,z:0},{x:ARENA,y:0,z:0},{x:ARENA,y:ARENA,z:0},{x:0,y:ARENA,z:0}],'#202b35');
 for(let i=0;i<=ARENA;i+=2){const width=i%10===0?.035:.012;drawPolygon([{x:i,y:0,z:.003},{x:i+width,y:0,z:.003},{x:i+width,y:ARENA,z:.003},{x:i,y:ARENA,z:.003}],i%10===0?'#476577':'#344450');drawPolygon([{x:0,y:i,z:.004},{x:ARENA,y:i,z:.004},{x:ARENA,y:i+width,z:.004},{x:0,y:i+width,z:.004}],i%10===0?'#476577':'#344450');}
 for(const column of columns){const h=CUBE_SIZE*.68;drawPolygon([{x:column.x-h,y:column.y-h,z:.008},{x:column.x+h+.35,y:column.y-h+.25,z:.008},{x:column.x+h+.35,y:column.y+h+.35,z:.008},{x:column.x-h,y:column.y+h,z:.008}],'#131e28');}
 const faces=[];
 for(const cube of cubes)for(let face=0;face<5;face++){
  if(face===4&&cube.level<columns[cube.column].levels-1)continue;
  const n=FACE_NORMALS[face],center={x:cube.x+n.x*CUBE_SIZE/2,y:cube.y+n.y*CUBE_SIZE/2,z:cube.z+CUBE_SIZE/2+n.z*CUBE_SIZE/2};
  if(dot(n,{x:player.x-center.x,y:player.y-center.y,z:EYE_HEIGHT-center.z})<=0)continue;
  const vertices=faceVertices(cube,face);if(vertices.every(v=>cameraPoint(v).depth<=.08))continue;
  faces.push({cube,face,vertices,depth:cameraPoint(center).depth});
 }
 faces.sort((a,b)=>b.depth-a.depth);
 for(const f of faces){const shade=clamp((f.face===4?1.12:f.face<2?.83:.96)*(1-f.depth*.006),.48,1.12);drawPolygon(f.vertices,tint(f.cube.color,shade),'#102432');if(f.cube.faces[f.face])drawFaceText(f.cube,f.face,f.cube.faces[f.face]);}
 drawImpactSmoke();drawCombatEffects();drawWeapon(t);
}
function drawWeapon(t){drawRifle(t);}
function remainingMapTargets(){return showTargetHints&&challenge.phase==='playing'?challenge.targets.filter(t=>t.correct&&!t.hit).map(t=>{const c=cubes[t.cubeId],n=FACE_NORMALS[t.faceIndex];return {x:c.x+n.x*.5,y:c.y+n.y*.5,level:c.level+1};}):[];}
function toggleTargetHints(){showTargetHints=!showTargetHints;const b=document.querySelector('#map-hint');b.textContent=`[V] 目標提示：${showTargetHints?'開':'關'}`;b.setAttribute('aria-pressed',String(showTargetHints));}
function drawMap(){const s=136/ARENA,off=6;mc.fillStyle='#101c28';mc.fillRect(0,0,148,148);mc.strokeStyle='#3a5465';mc.lineWidth=1;mc.strokeRect(6,6,136,136);
 for(const c of columns){mc.fillStyle=c.levels===3?'#6c8094':c.levels===2?'#516578':'#3b5064';mc.fillRect(off+(c.x-.7)*s,off+(c.y-.7)*s,1.4*s,1.4*s);}
 mc.fillStyle='#b5f7ff';mc.shadowColor='#7ae9ff';mc.shadowBlur=5;for(const t of remainingMapTargets()){mc.beginPath();mc.arc(off+t.x*s,off+t.y*s,1.7,0,Math.PI*2);mc.fill();}mc.shadowBlur=0;
 mc.save();mc.translate(off+player.x*s,off+player.y*s);mc.rotate(player.a);mc.fillStyle='#ffb964';mc.beginPath();mc.moveTo(5,0);mc.lineTo(-3,-3);mc.lineTo(-2,0);mc.lineTo(-3,3);mc.closePath();mc.fill();mc.restore();
}
function initAudio(){if(!audioCtx)try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch{}if(audioCtx?.state==='suspended')audioCtx.resume();}
const smokeTexture=document.createElement('canvas');smokeTexture.width=smokeTexture.height=64;{const c=smokeTexture.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#afb5b39f');g.addColorStop(1,'#afb5b300');c.fillStyle=g;c.fillRect(0,0,64,64);}
function spawnImpactSmoke(hit){for(let i=0;i<6;i++)impactSmoke.push({x:hit.x+hit.normal.x*.06,y:hit.y+hit.normal.y*.06,z:hit.z+hit.normal.z*.06,age:0,life:.65+Math.random()*.2,drift:(Math.random()-.5)*.16});if(impactSmoke.length>100)impactSmoke.splice(0,impactSmoke.length-100);}
function advanceImpactSmoke(elapsed){for(let i=impactSmoke.length-1;i>=0;i--){impactSmoke[i].age+=elapsed;if(impactSmoke[i].age>=impactSmoke[i].life)impactSmoke.splice(i,1);}}
function drawImpactSmoke(){for(const p of impactSmoke){const point={x:p.x+p.age*p.drift,y:p.y,z:p.z+p.age*.12},v=projectPoint(point);if(v.depth<.05||!isPointVisible(point))continue;const size=(.09+p.age*.2)*PROJECTION/v.depth;ctx.globalAlpha=.35*(1-p.age/p.life);ctx.drawImage(smokeTexture,v.x-size/2,v.y-size/2,size,size);}ctx.globalAlpha=1;}
function shoot(t){if(t-lastShot<.16||!running||challenge.phase!=='playing')return;lastShot=shotTime=t;shots++;const hit=traceScene(screenRay());if(hit)fireRound(hit,0,t);playGunshot();}
function resetInputs(){keys.clear();mouseDown=touchFire=padFire=false;moveStick.x=moveStick.y=lookStick.x=lookStick.y=0;document.querySelectorAll('.stick>span').forEach(el=>el.style.transform='');}
function start(){initAudio();if(challenge.phase==='idle'||challenge.phase==='complete')beginSession();else if(challenge.phase==='roundResult')beginRound();running=true;overlay.classList.add('hidden');syncChallengePanel();resetInputs();document.activeElement?.blur();if(!view.classList.contains('touch-on')&&!activePad)try{canvas.requestPointerLock?.()?.catch(()=>{});}catch{}document.querySelector('#mode').textContent=challenge.phase==='preview'?'MEMORIZE / 5 SECONDS':'CUBE RANGE ACTIVE';updateBackgroundMusic();}
function pause(){if(!running)return;running=false;moving=false;resetInputs();stopBackgroundMusic();document.querySelector('#challenge-panel').hidden=true;overlay.classList.remove('hidden');document.querySelector('#start').innerHTML='繼續挑戰 <span>↗</span>';document.querySelector('#pause-hint').textContent='已暫停 · 倒數與計時已停止';if(document.pointerLockElement)document.exitPointerLock();}
document.querySelector('#start').addEventListener('click',start);document.querySelector('#map-hint').addEventListener('click',toggleTargetHints);
document.querySelector('#sound').onclick=()=>{sound=!sound;document.querySelector('#sound').innerHTML=`聲音 ${sound?'ON':'OFF'} <span>${sound?'◖))':'×'}</span>`;initAudio();updateBackgroundMusic();};
document.querySelector('#toggle-touch').onclick=()=>{const on=view.classList.toggle('touch-on');document.querySelector('#toggle-touch').textContent=on?'隱藏搖桿':'顯示搖桿';if(on&&document.pointerLockElement)document.exitPointerLock();};
if(matchMedia('(pointer:coarse)').matches){view.classList.add('touch-on');document.querySelector('#toggle-touch').textContent='隱藏搖桿';}
window.addEventListener('keydown',e=>{const tag=e.target?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag)||e.target?.isContentEditable)return;if(e.code==='KeyV'){if(!e.repeat){e.preventDefault();toggleTargetHints();}return;}if(e.code==='Escape'){pause();return;}if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.code))e.preventDefault();if(running)keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&!view.classList.contains('touch-on')&&!activePad)pause();});
canvas.addEventListener('pointerdown',e=>{if(!running||e.button!==0)return;mouseDown=true;initAudio();if(!document.pointerLockElement&&!view.classList.contains('touch-on'))try{canvas.requestPointerLock?.()?.catch(()=>{});}catch{}});window.addEventListener('pointerup',()=>mouseDown=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousemove',e=>{if(running&&challenge.phase==='playing'&&document.pointerLockElement===canvas){player.a+=e.movementX*.0011;player.pitch=clamp(player.pitch-e.movementY*.0011,-1.15,1.15);}});
function setupStick(id,state){const el=document.querySelector(id),knob=el.querySelector('span');let pointer=null;function move(e){const r=el.getBoundingClientRect(),radius=r.width*.36;let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}state.x=x;state.y=y;knob.style.transform=`translate(${x*radius*.7}px,${y*radius*.7}px)`;}el.addEventListener('pointerdown',e=>{if(!running||challenge.phase!=='playing')return;pointer=e.pointerId;el.setPointerCapture(pointer);move(e);});el.addEventListener('pointermove',e=>{if(e.pointerId===pointer)move(e);});const end=e=>{if(e.pointerId===pointer){pointer=null;state.x=state.y=0;knob.style.transform='';}};['pointerup','pointercancel','lostpointercapture'].forEach(type=>el.addEventListener(type,end));}
setupStick('#move-stick',moveStick);setupStick('#look-stick',lookStick);const fireButton=document.querySelector('#touch-fire');fireButton.addEventListener('pointerdown',e=>{if(!running)return;fireButton.setPointerCapture(e.pointerId);touchFire=true;});['pointerup','pointercancel','lostpointercapture'].forEach(type=>fireButton.addEventListener(type,()=>touchFire=false));
let prevStart=false;const dead=v=>Math.abs(v)<.16?0:Math.sign(v)*(Math.abs(v)-.16)/.84,aimCurve=v=>Math.sign(v)*v*v;
function update(dt,t,elapsed=dt){const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected),connected=!!pad;if(connected!==activePad){activePad=connected;document.querySelector('#pad-label').textContent=connected?'手把已連線 · RT 射擊':'支援手把 / 螢幕搖桿';}const pressed=pad?.buttons[9]?.pressed||pad?.buttons[0]?.pressed;if(pressed&&!prevStart){if(running)pause();else start();}prevStart=pressed;if(!running)return;advanceImpactSmoke(elapsed);advanceCombatEffects(elapsed);tickChallenge(elapsed);if(challenge.phase!=='playing')return;
 const axis=i=>dead(pad?.axes[i]||0),button=i=>pad?.buttons[i]?.pressed;
 player.a+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0)+1.45*aimCurve(axis(2))+1.45*aimCurve(lookStick.x))*dt;player.pitch=clamp(player.pitch+((keys.has('PageUp')?1:0)-(keys.has('PageDown')?1:0))*.7*dt-(aimCurve(axis(3))+aimCurve(lookStick.y))*.9*dt,-1.15,1.15);
 let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-axis(1)-moveStick.y,side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+axis(0)+moveStick.x;const length=Math.hypot(forward,side);if(length>1){forward/=length;side/=length;}moving=length>.05;
 const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')||button(10)?6:3.7)*dt,dx=(Math.cos(player.a)*forward-Math.sin(player.a)*side)*speed,dy=(Math.sin(player.a)*forward+Math.cos(player.a)*side)*speed;
 if(!solid(player.x+dx,player.y))player.x+=dx;if(!solid(player.x,player.y+dy))player.y+=dy;if(moving)walk+=dt*8;
 document.querySelector('#room').textContent=`彩方訓練場 / X ${player.x.toFixed(1)} · Y ${player.y.toFixed(1)}`;
 if(mouseDown||touchFire||keys.has('Space')||keys.has('KeyF')||button(7)||button(5))shoot(t);
}
function frame(ms){const t=ms/1000,elapsed=last?Math.max(0,t-last):0;last=t;update(Math.min(.035,elapsed),t,elapsed);updateBackgroundMusic();render(t);drawMap();requestAnimationFrame(frame);}
window.gameDiagnostics=()=>({player:{...player},cubeCount:cubes.length,columns:columns.map(c=>({...c})),cubes:cubes.map(c=>({...c,faces:c.faces.map(f=>f?{char:f.char,correct:f.correct,hit:f.hit}:null)})),running,showTargetHints,challenge:{phase:challenge.phase,round:challenge.round+1,roundLimit:challenge.roundLimit,found:challenge.found,total:challenge.total,elapsed:challenge.elapsed,results:challenge.results.map(r=>({...r}))}});
