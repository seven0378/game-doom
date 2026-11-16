'use strict';
(function(root){
 const words=typeof module!=='undefined'&&module.exports?require('./words.js'):root.DragonWords;
 const shuffle=(a,r)=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 class MazeGame{
  constructor(random=Math.random){this.random=random;this.phase='idle';this.results=[];this.events=[];}
  start(n=1){this.rounds=Math.max(1,Math.min(3,Math.trunc(Number(n))||1));this.deck=shuffle(words.POEMS,this.random).slice(0,this.rounds);this.round=0;this.results=[];this.begin();}
  begin(){this.width=21;this.height=17;this.grid=Array.from({length:this.height},()=>Array(this.width).fill(1));const stack=[[1,1]];this.grid[1][1]=0;while(stack.length){const [x,y]=stack.at(-1),next=shuffle([[2,0],[-2,0],[0,2],[0,-2]],this.random).find(([dx,dy])=>x+dx>0&&y+dy>0&&x+dx<this.width-1&&y+dy<this.height-1&&this.grid[y+dy][x+dx]);if(next){const [dx,dy]=next;this.grid[y+dy/2][x+dx/2]=0;this.grid[y+dy][x+dx]=0;stack.push([x+dx,y+dy]);}else stack.pop();}
   this.player={x:1.5,y:1.5};const dist=this.distances(1,1),cells=[];for(let y=1;y<this.height-1;y++)for(let x=1;x<this.width-1;x++)if(!this.grid[y][x])cells.push({x,y,d:dist[y][x]});const far=cells.reduce((a,b)=>b.d>a.d?b:a);this.exit={x:far.x+.5,y:far.y+.5};
   this.poem=this.deck[this.round];this.chars=words.glyphs(this.poem);this.found=this.chars.map(()=>false);this.items=[];const places=shuffle(cells.filter(c=>c.d>4&&!(c.x===far.x&&c.y===far.y)),this.random),indices=shuffle(this.chars.map((_,i)=>i),this.random);const pool=words.DISTRACTORS.filter(c=>!this.chars.includes(c));for(let i=0;i<this.chars.length+20;i++){const c=places[i],index=i<indices.length?indices[i]:null;this.items.push({x:c.x+.5,y:c.y+.5,index,char:index===null?pool[Math.floor(this.random()*pool.length)]:this.chars[index],taken:false,color:Math.floor(this.random()*5)});}
   this.phase='preview';this.preview=5;this.elapsed=0;this.score=0;this.wrong=0;this.hits=0;this.hints=3;this.hintTime=0;this.events=[];this.visited=new Set(['1,1']);
  }
  distances(sx,sy){const d=Array.from({length:this.height},()=>Array(this.width).fill(-1)),q=[[sx,sy]];d[sy][sx]=0;for(let k=0;k<q.length;k++){const [x,y]=q[k];for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy;if(a>=0&&b>=0&&a<this.width&&b<this.height&&!this.grid[b][a]&&d[b][a]<0){d[b][a]=d[y][x]+1;q.push([a,b]);}}}return d;}
  get unlocked(){return this.found?.every(Boolean)||false;}
  nearest(){return this.items?.filter(i=>!i.taken).map(i=>({item:i,d:Math.hypot(i.x-this.player.x,i.y-this.player.y)})).filter(a=>a.d<.76).sort((a,b)=>a.d-b.d)[0]?.item||null;}
  collect(){if(this.phase!=='playing')return;const item=this.nearest();if(!item){this.events.push({type:'empty'});return;}item.taken=true;if(item.index!==null){this.found[item.index]=true;this.hits++;this.score+=20;this.events.push({type:this.unlocked?'unlock':'collect',char:item.char,index:item.index});}else{this.score-=10;this.wrong++;this.events.push({type:'wrong',char:item.char});}}
  hint(){if(this.phase!=='playing'||this.hints<=0||this.hintTime>0||this.unlocked)return;this.hints--;this.hintTime=3;this.events.push({type:'hint'});}
  pause(){if(['preview','playing'].includes(this.phase)){this.resumePhase=this.phase;this.phase='paused';}}
  resume(){if(this.phase==='paused')this.phase=this.resumePhase;}
  canMove(x,y){const r=.22;for(const dx of[-r,r])for(const dy of[-r,r]){const gx=Math.floor(x+dx),gy=Math.floor(y+dy);if(!this.grid[gy]||this.grid[gy][gx]!==0)return false;}return true;}
  tick(dt,input={}){if(!Number.isFinite(dt)||dt<=0)return;if(this.phase==='preview'){this.preview=Math.max(0,this.preview-dt);if(!this.preview)this.phase='playing';return;}if(this.phase!=='playing')return;this.elapsed+=dt;this.hintTime=Math.max(0,this.hintTime-dt);let dx=Number(input.x)||0,dy=Number(input.y)||0;const n=Math.hypot(dx,dy);if(n>1){dx/=n;dy/=n;}let rest=Math.min(dt,.25);while(rest>0){const step=Math.min(rest,1/120);rest-=step;const x=this.player.x+dx*3.1*step,y=this.player.y+dy*3.1*step;if(this.canMove(x,this.player.y))this.player.x=x;if(this.canMove(this.player.x,y))this.player.y=y;}this.visited.add(`${Math.floor(this.player.x)},${Math.floor(this.player.y)}`);if(this.unlocked&&Math.hypot(this.exit.x-this.player.x,this.exit.y-this.player.y)<.48)this.finish();}
  finish(){this.results.push({poem:this.poem,score:this.score,time:this.elapsed,wrong:this.wrong,hints:3-this.hints});this.phase=this.round+1===this.rounds?'complete':'roundResult';this.events.push({type:'finish'});}
  next(){if(this.phase==='roundResult'){this.round++;this.begin();}}
 }
 const api={MazeGame};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PoemMaze=api;
})(typeof window!=='undefined'?window:globalThis);
