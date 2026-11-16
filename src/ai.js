import {MAPS,BOT_LEVELS,makePlayer,stepPlayer,rects,clearSight,canTag,TOOLS,clamp,bestSpawn} from '../shared/rules.js';
const GRID=3.4;
function cellKey(x,z){return `${x},${z}`;}
function astar(source,dest,colliders){
  const toCell=v=>clamp(Math.round(v/GRID),-9,9);
  const sx=toCell(source.x),sz=toCell(source.z),tx=toCell(dest.x),tz=toCell(dest.z);
  const start=cellKey(sx,sz),goal=cellKey(tx,tz),queue=[{x:sx,z:sz}];const seen=new Map([[start,null]]);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  let closest={x:sx,z:sz,d:Infinity};
  for(let i=0;i<queue.length&&i<350;i++){
    const at=queue[i],d=Math.abs(at.x-tx)+Math.abs(at.z-tz);
    if(d<closest.d)closest={...at,d};if(d===0)break;
    for(const [dx,dz] of dirs){const nx=at.x+dx,nz=at.z+dz,k=cellKey(nx,nz);if(Math.abs(nx)>9||Math.abs(nz)>9||seen.has(k))continue;
      const x=nx*GRID,z=nz*GRID;if(colliders.some(b=>x>b.x-b.w/2-.55&&x<b.x+b.w/2+.55&&z>b.z-b.d/2-.55&&z<b.z+b.d/2+.55))continue;
      seen.set(k,cellKey(at.x,at.z));queue.push({x:nx,z:nz});
    }
  }
  const end=cellKey(closest.x,closest.z),path=[];let k=end;
  while(k&&k!==start&&path.length<100){const [x,z]=k.split(',').map(Number);path.push({x:x*GRID,z:z*GRID});k=seen.get(k);}
  return path.reverse();
}
export class AIManager{
  constructor(mapId='yard',difficulty='normal',count=3){this.mapId=mapId;this.colliders=rects(mapId);this.difficulty=BOT_LEVELS[difficulty]||BOT_LEVELS.normal;this.bots=[];for(let i=0;i<count;i++)this.add(i);}
  add(index){const sp=MAPS[this.mapId].spawn[(index+1)%MAPS[this.mapId].spawn.length],p=makePlayer(...sp);const b={id:`bot-${index}`,name:`BOT ${String(index+1).padStart(2,'0')}`,color:['#ffae77','#ad97ff','#f18ab3','#f3d47a','#84edbf'][index%5],p,tool:['spark','prism','pulse'][index%3],route:[],routeTime:0,think:0,strafe:1};this.bots.push(b);}
  update(dt,player,tagPlayer,onPlayerTagged){
    for(const bot of this.bots){const b=bot.p;if(b.respawn>0){b.respawn-=dt;if(b.respawn<=0){const spawn=bestSpawn(this.mapId,[player,...this.bots.filter(v=>v!==bot).map(v=>v.p)]);Object.assign(b,makePlayer(spawn.x,spawn.z),{score:b.score,outs:b.outs});}continue;}
      const d=Math.hypot(b.x-player.x,b.z-player.z),visible=clearSight(b.x,b.z,player.x,player.z,this.colliders,b.y+1.4,player.y+1.4);
      bot.routeTime-=dt;bot.think-=dt;
      if(bot.routeTime<=0){bot.route=astar(b,player,this.colliders);bot.routeTime=.8+Math.random()*.8;bot.strafe=Math.random()<.5?-1:1;}
      let target=player;
      if(!visible&&bot.route.length){while(bot.route.length>1&&Math.hypot(b.x-bot.route[0].x,b.z-bot.route[0].z)<2.1)bot.route.shift();target=bot.route[0];}
      const angle=Math.atan2(-(target.x-b.x),-(target.z-b.z));
      const diff=Math.atan2(Math.sin(angle-b.yaw),Math.cos(angle-b.yaw));
      b.yaw+=clamp(diff,-dt*(3.1*this.difficulty.speed),dt*(3.1*this.difficulty.speed));
      b.pitch=0;
      const aiming=visible&&d<(TOOLS[bot.tool].range*.8);
      const input={forward:aiming&&d<8?-.35:1,strafe:aiming?bot.strafe*.3:0,jump:Math.random()<dt*.15,slide:Math.random()<dt*.11&&d>7,sprint:true};
      stepPlayer(b,input,dt,this.colliders);
      b.energy=Math.max(0,b.energy);
      if(aiming&&bot.think<=0&&b.cooldown<=0&&b.energy>=TOOLS[bot.tool].energy){
        bot.think=this.difficulty.reaction+Math.random()*.25;
        const hit=Math.random()<this.difficulty.accuracy;
        b.cooldown=TOOLS[bot.tool].cooldown;b.energy-=TOOLS[bot.tool].energy;
        if(hit&&canTag(b,player,TOOLS[bot.tool],this.colliders))onPlayerTagged(bot,TOOLS[bot.tool].shield);
      }
    }
  }
  tagBot(bot,damage,player){if(!bot||bot.p.respawn>0)return false;bot.p.shield-=damage;if(bot.p.shield<=0){bot.p.respawn=3;bot.p.shield=100;player.score++;bot.p.outs++;return 'out';}return true;}
}
