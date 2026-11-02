'use strict';
const tracers=[],impactParticles=[],casings=[];
const impactColors=['#ffe3a6','#ffb24c','#c9c5b5'];
const impactGlows=impactColors.map(color=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'#fff9df');r.addColorStop(.2,color);r.addColorStop(.5,color+'70');r.addColorStop(1,color+'00');g.fillStyle=r;g.fillRect(0,0,64,64);return c;});
function weaponPose(t){const scale=Math.min(H*.30/212,W*.22/203),since=t-shotTime,y=H+(moving?Math.cos(walk)*2:Math.sin(t*1.5)*.5)*scale+(since>=0&&since<.14?Math.sin(since/.14*Math.PI)*12*scale:0);return {scale,x:W/2,y,muzzleX:W/2,muzzleY:y-212*scale};}
function drawRifle(t){
 const p=weaponPose(t);ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.scale,p.scale);
 const poly=(points,fill,stroke)=>{ctx.beginPath();points.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=2;ctx.strokeStyle=stroke;ctx.stroke();}};
 poly([[-90,0],[-80,-41],[-53,-80],[-30,-69],[-34,-23],[-28,0]],'#394341','#151c20');
 poly([[65,0],[46,-40],[38,-71],[59,-85],[83,-49],[111,0]],'#3e4946','#151c20');
 poly([[-37,0],[-48,-63],[-29,-141],[-12,-173],[15,-173],[34,-140],[52,-61],[56,0]],'#262f36','#11171c');
 poly([[-22,-142],[-18,-189],[-12,-199],[12,-199],[20,-188],[23,-140]],'#515c64','#10171b');
 ctx.fillStyle='#1b2429';ctx.fillRect(-12,-212,24,29);ctx.fillStyle='#7d8a91';ctx.fillRect(-10,-212,20,3);ctx.fillStyle='#080e12';ctx.fillRect(-7,-207,14,8);
 poly([[-29,-141],[-12,-160],[15,-160],[32,-139],[33,-86],[-32,-86]],'#58656b','#142029');
 ctx.fillStyle='#27343b';ctx.fillRect(-16,-147,32,57);
 for(let j=0;j<5;j++){ctx.fillStyle='#151e24';ctx.fillRect(-26,-130+j*8,8,3);ctx.fillRect(20,-130+j*8,8,3);}
 poly([[-12,-156],[-11,-181],[11,-181],[13,-155]],'#1b2931','#8b9da4');
 ctx.fillStyle='#1c5761';ctx.fillRect(-7,-176,14,15);ctx.fillStyle='#f4b261';ctx.fillRect(-2,-169,4,3);
 poly([[-31,-80],[33,-80],[44,-28],[29,0],[-28,0],[-42,-28]],'#3c4b52','#152027');
 ctx.fillStyle='#18282f';ctx.fillRect(-22,-63,44,32);ctx.fillStyle='#bac8c9';ctx.font='8px monospace';ctx.fillText('XR—01',-15,-45);
 ctx.fillStyle='#dba65e';ctx.fillRect(-14,-22,28,3);
 const since=t-shotTime;
 if(since>=0&&since<.055){ctx.globalCompositeOperation='lighter';poly([[0,-254],[7,-226],[20,-237],[12,-216],[26,-211],[8,-204],[0,-192],[-8,-206],[-23,-210],[-10,-222],[-17,-235],[-5,-225]],'#f6a23c');poly([[0,-241],[7,-217],[0,-204],[-6,-218]],'#fff3cc');ctx.globalCompositeOperation='source-over';}
 ctx.restore();
}
function spawnBallisticImpact(hit,v){
 const nx=hit.normal.x,ny=hit.normal.y,x=hit.x+nx*.07,y=hit.y+ny*.07,z=hit.z+hit.normal.z*.07;
 for(let i=0;i<14;i++){const side=(Math.random()-.5)*1.4;impactParticles.push({x,y,z,vx:nx*(.25+Math.random()*.5)-ny*side,vy:ny*(.25+Math.random()*.5)+nx*side,vz:(Math.random()-.3)*1.1,age:0,life:.16+Math.random()*.28,size:.012+Math.random()*.014,color:i%3});}
 impactParticles.push({x,y,z,vx:0,vy:0,vz:0,age:0,life:.09,size:.13,color:0});
 if(impactParticles.length>180)impactParticles.splice(0,impactParticles.length-180);
}
function fireRound(hit,v,t){
 const p=weaponPose(t),depth=Math.min(.4,hit.d*.25),direction=screenRay(p.muzzleX,p.muzzleY);
 tracers.push({start:{x:player.x+direction.x*depth,y:player.y+direction.y*depth,z:EYE_HEIGHT+direction.z*depth},end:{x:hit.x,y:hit.y,z:hit.z},age:0,life:.065});
 if(tracers.length>8)tracers.shift();
 casings.push({x:p.x+23*p.scale,y:p.y-90*p.scale,scale:p.scale,vx:45+Math.random()*40,vy:-40-Math.random()*25,angle:Math.random()*3,age:0,life:.6});if(casings.length>12)casings.shift();
 decals.push({...hit,v});if(decals.length>60)decals.shift();spawnImpactSmoke(hit,v);spawnBallisticImpact(hit,v);
 processTargetShot(hit,v);
}
function advanceCombatEffects(elapsed){for(const list of [tracers,impactParticles,casings])for(let i=list.length-1;i>=0;i--){list[i].age+=elapsed;if(list[i].age>=list[i].life)list.splice(i,1);}}
function drawCombatEffects(){
 const sprites=[];
 for(const p of tracers)for(let i=1;i<=12;i++){const u=i/12;sprites.push({x:p.start.x+(p.end.x-p.start.x)*u,y:p.start.y+(p.end.y-p.start.y)*u,z:p.start.z+(p.end.z-p.start.z)*u,size:.009,alpha:(1-p.age/p.life)*.8,color:0});}
 for(const p of impactParticles){const a=p.age;sprites.push({x:p.x+p.vx*a,y:p.y+p.vy*a,z:p.z+p.vz*a-a*a*.9,size:p.size,alpha:1-a/p.life,color:p.color});}
 const projected=sprites.map(p=>({...p,world:p,...projectPoint(p)})).filter(p=>p.depth>.04).sort((a,b)=>b.depth-a.depth);
 ctx.globalCompositeOperation='lighter';
 for(const sprite of projected){
  if(!isPointVisible(sprite.world))continue;
  const radius=clamp(sprite.size*PROJECTION/sprite.depth,.5,35);ctx.globalAlpha=sprite.alpha;
  ctx.drawImage(impactGlows[sprite.color],sprite.x-radius,sprite.y-radius,2*radius,2*radius);
 }
 ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
 for(const p of casings){const a=p.age;ctx.save();ctx.translate(p.x+a*p.vx,p.y+a*p.vy+a*a*160);ctx.rotate(p.angle+a*12);ctx.globalAlpha=1-a/p.life;ctx.fillStyle='#ba8a44';ctx.fillRect(-3*p.scale,-1.5*p.scale,6*p.scale,3*p.scale);ctx.fillStyle='#f0c776';ctx.fillRect(-3*p.scale,-1.5*p.scale,6*p.scale,p.scale);ctx.restore();}ctx.globalAlpha=1;
}
function playGunshot(){
 if(!sound||!audioCtx)return;
 const at=audioCtx.currentTime,duration=.12,buffer=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*duration),audioCtx.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(audioCtx.sampleRate*.022));
 const noise=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();noise.buffer=buffer;filter.type='lowpass';filter.frequency.value=3100;gain.gain.value=.18;noise.connect(filter).connect(gain).connect(audioCtx.destination);noise.start(at);
 const osc=audioCtx.createOscillator(),low=audioCtx.createGain();osc.frequency.setValueAtTime(150,at);osc.frequency.exponentialRampToValueAtTime(42,at+.09);low.gain.setValueAtTime(.12,at);low.gain.exponentialRampToValueAtTime(.001,at+.11);osc.connect(low).connect(audioCtx.destination);osc.start(at);osc.stop(at+.12);
}
