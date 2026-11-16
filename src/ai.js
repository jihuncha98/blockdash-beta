import {MAPS,BOT_LEVELS,WEAPONS,makePlayer,stepPlayer,rects,clearSight,clamp,bestSpawn,revive,tickCombat,fireAttempt,raycastCombat,dealDamage,offMap} from '../shared/rules.js';
const GRID=4;
function pathfind(from,to,colliders,half){
 const bound=Math.floor((half-3)/GRID),cell=n=>clamp(Math.round(n/GRID),-bound,bound),sx=cell(from.x),sz=cell(from.z),tx=cell(to.x),tz=cell(to.z);
 const encode=(x,z)=>`${x}:${z}`,start=encode(sx,sz),queue=[[sx,sz]],visited=new Map([[start,null]]),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
 let best=[sx,sz],bestDist=Infinity;
 for(let i=0;i<queue.length&&i<850;i++){const [x,z]=queue[i],d=Math.abs(x-tx)+Math.abs(z-tz);if(d<bestDist){best=[x,z];bestDist=d;}if(d===0)break;
  for(const [dx,dz] of dirs){const xx=x+dx,zz=z+dz,k=encode(xx,zz);if(Math.abs(xx)>bound||Math.abs(zz)>bound||visited.has(k))continue;
   if(colliders.some(c=>Math.abs(xx*GRID-c.x)<c.w/2+.7&&Math.abs(zz*GRID-c.z)<c.d/2+.7))continue;
   visited.set(k,encode(x,z));queue.push([xx,zz]);}}
 const out=[];let pos=encode(...best);while(pos!==start&&pos&&out.length<120){const [x,z]=pos.split(':').map(Number);out.push({x:x*GRID,z:z*GRID});pos=visited.get(pos);}return out.reverse();
}
export class AIManager{
 constructor(mapId='yard',difficulty='normal',count=3){this.mapId=mapId;this.colliders=rects(mapId);this.level=BOT_LEVELS[difficulty]||BOT_LEVELS.normal;this.bots=[];for(let i=0;i<count;i++)this.add(i);}
 add(i){const pos=MAPS[this.mapId].spawn[(i+1)%8],weapons=Object.keys(WEAPONS).filter(k=>WEAPONS[k].kind!=='HG'),primary=weapons[i%weapons.length];
  const p=makePlayer(pos[0],pos[1],primary,'P92');p.id=`bot-${i}`;
  this.bots.push({id:p.id,name:`BOT ${String(i+1).padStart(2,'0')}`,p,route:[],routeTime:0,think:this.level.reaction*(.3+Math.random()),strafing:i%2?1:-1});
 }
 update(dt,user,now,onEvent=()=>{}){
  const all=[user,...this.bots.map(b=>b.p)];
  for(const bot of this.bots){const p=bot.p;tickCombat(p,dt);
   if(p.respawn>0){p.respawn=Math.max(0,p.respawn-dt);if(p.respawn<=0){const spawn=bestSpawn(this.mapId,all.filter(a=>a!==p));revive(p,spawn.x,spawn.z);p.id=bot.id;}continue;}
   if(offMap(p,this.mapId)){p.respawn=5;p.deaths++;p.streak=0;continue;}
   const rivals=all.filter(t=>t!==p&&t.respawn<=0);
   if(!rivals.length){stepPlayer(p,{},dt,this.colliders,this.mapId);continue;}
   rivals.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));const target=rivals[0];
   const d=Math.hypot(target.x-p.x,target.z-p.z),visible=clearSight(p.x,p.z,target.x,target.z,this.colliders,p.y+1.5,target.y+1.5);
   bot.routeTime-=dt;
   // Difficulty reaction is the delay before an AI notices a visible rival,
   // not a global cap on the weapon's approved firing rate.
   if(!visible)bot.think=this.level.reaction;
   else bot.think=Math.max(0,bot.think-dt);
   if(bot.routeTime<=0){bot.route=pathfind(p,target,this.colliders,MAPS[this.mapId].half);bot.routeTime=.6+Math.random()*.7;bot.strafing=Math.random()<.5?-1:1;}
   let waypoint=target;if(!visible&&bot.route.length){while(bot.route.length>1&&Math.hypot(p.x-bot.route[0].x,p.z-bot.route[0].z)<2.8)bot.route.shift();waypoint=bot.route[0];}
   const toYaw=Math.atan2(-(waypoint.x-p.x),-(waypoint.z-p.z)),diff=Math.atan2(Math.sin(toYaw-p.yaw),Math.cos(toYaw-p.yaw));p.yaw+=clamp(diff,-dt*3*this.level.speed,dt*3*this.level.speed);
   const dy=target.y+1.15-(p.y+1.6);p.pitch=clamp(Math.atan2(dy,Math.max(1,d)),-1,1);
   const around=visible&&d<16;
   const input={forward:around?(d<7?-.25:.15):1,strafe:around?bot.strafing*.7:0,sprint:!around,ads:visible&&d>8,slide:Math.random()<dt*.09&&d>12};
   stepPlayer(p,input,dt,this.colliders,this.mapId);
   const w=WEAPONS[p.primary];if(visible&&d<Math.min(85,w.kind==='SG'?19:90)&&bot.think<=0){
    const shot=fireAttempt(p);if(shot.ok){
     const ray=raycastCombat(p,rivals,shot.weapon,this.colliders);
     for(const [victim,damage] of ray.hits){if(Math.random()>this.level.accuracy)continue;
      const res=dealDamage(victim,p,damage,all,now);onEvent({type:res.killed?'kill':'hit',source:bot.name,target:victim===user?'플레이어':this.bots.find(b=>b.p===victim)?.name,damage});
     }
    }
   }
  }
 }
}
