// BLOCKDASH shared deterministic arena rules (runs in browsers and Node).
export const GAME_VERSION = '1.0.0-beta.1';
export const ARENA_HALF = 34;
export const PLAYER_RADIUS = 0.47;
export const PLAYER_HEIGHT = 1.8;
export const GRAVITY = 24;
export const JUMP_SPEED = 8.7;
export const MOVE_SPEED = 7.2;
export const SPRINT_SPEED = 10.3;
export const SLIDE_SPEED = 13.5;
export const ROUND_TIME = 180;
export const TAG_RANGE = 45;
export const RESPAWN_TIME = 3;
export const BOT_LEVELS = Object.freeze({easy:{reaction:.75,accuracy:.53,speed:.72},normal:{reaction:.43,accuracy:.76,speed:.9},hard:{reaction:.23,accuracy:.9,speed:1}});
export const TOOLS = Object.freeze({
  spark: {name:'SPARK',label:'연속형',cooldown:.24,energy:9,shield:17,range:35,color:'#65f3fd'},
  prism: {name:'PRISM',label:'정밀형',cooldown:.82,energy:32,shield:46,range:55,color:'#b899ff'},
  pulse: {name:'PULSE',label:'근거리형',cooldown:.67,energy:24,shield:38,range:14,color:'#ffbc76'}
});
export const MAPS = Object.freeze({
  yard: {name:'BLOCK YARD',accent:'#64e9f1',sky:'#9ecde3',floor:'#80b8ad',spawn:[[0,21],[20,19],[-20,-20],[11,-19],[-20,17],[0,-22],[22,0],[-22,5]], blocks:[
    [-17,-15,8,4,7],[-16,12,8,4,8],[18,-16,9,4,8],[18,13,8,4,8],[-7,-3,5,3.4,13],[8,4,5,3.4,13],[0,0,6,5,6],[-28,0,4,3,10],[28,0,4,3,10],[0,-28,15,4,3],[0,28,15,4,3],[-10,23,6,2.5,4],[11,-23,6,2.5,4],[-24,-26,4,2.8,4],[25,25,4,2.8,4]
  ], crates:[[-25,-8],[25,7],[-8,14],[9,-13],[-21,0],[20,-3]], platforms:[]},
  sky: {name:'SKY GRID',accent:'#aab6ff',sky:'#9cadf2',floor:'#768fba',spawn:[[0,22],[22,0],[-22,0],[0,-22],[23,22],[-23,-22],[26,-18],[-26,18]], blocks:[
    [-17,-14,8,5,8],[17,-14,8,5,8],[-17,14,8,5,8],[17,14,8,5,8],[0,0,8,4,8],[0,-26,13,4,3],[0,26,13,4,3],[-27,0,3,4,13],[27,0,3,4,13],[-10,0,4,3,5],[10,0,4,3,5]
  ], crates:[[-24,-24],[24,24],[-24,24],[24,-24],[-9,-23],[8,22]], platforms:[[-12,-28,5,2.3,4],[12,-28,5,2.3,4],[-12,28,5,2.3,4],[12,28,5,2.3,4]]}
});
export const PARKOUR = Object.freeze([
  {x:0,z:21,y:1},{x:-15,z:21,y:1},{x:-25,z:13,y:1},{x:-24,z:-3,y:1},
  {x:-22,z:-11,y:1},{x:0,z:-19,y:1},{x:22,z:-12,y:1},{x:24,z:8,y:1},{x:0,z:10,y:1}
]);
export function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
export function normalAngle(value){return Math.atan2(Math.sin(value),Math.cos(value));}
export function rects(mapId='yard'){
  const map=MAPS[mapId]||MAPS.yard;
  const blocks=map.blocks.map(([x,z,w,h,d])=>({x,z,w,h,d,kind:'wall'}));
  const crates=map.crates.map(([x,z])=>({x,z,w:2.7,h:2.35,d:2.7,kind:'crate'}));
  const platforms=map.platforms.map(([x,z,w,h,d])=>({x,z,w,h,d,kind:'platform'}));
  return [...blocks,...crates,...platforms];
}
export function overlaps(x,z,box,r=PLAYER_RADIUS){
  const nx=clamp(x,box.x-box.w/2,box.x+box.w/2);
  const nz=clamp(z,box.z-box.d/2,box.z+box.d/2);
  return (x-nx)**2+(z-nz)**2<r*r;
}
export function blocked(x,z,feet,colliders){
  return colliders.some(box=>feet<box.h-.04 && feet+PLAYER_HEIGHT>.05 && overlaps(x,z,box));
}
export function clearSight(ax,az,bx,bz,colliders,ay=1.4,by=1.4){
  const d=Math.hypot(ax-bx,az-bz),steps=Math.max(1,Math.ceil(d/.75));
  for(let i=1;i<steps;i++){
    const t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t,y=ay+(by-ay)*t;
    if(colliders.some(b=>y>=0&&y<b.h-.12&&x>b.x-b.w/2&&x<b.x+b.w/2&&z>b.z-b.d/2&&z<b.z+b.d/2))return false;
  }
  return true;
}
export function makePlayer(x=0,z=21){return {x,z,y:0,vx:0,vy:0,vz:0,yaw:0,pitch:0,grounded:true,slide:0,shield:100,respawn:0,cooldown:0,energy:100,score:0,outs:0,combo:0};}
export function stepPlayer(p,input,dt,colliders){
  // Player-local forward vector, consistent with Three.js yaw=0 looking -Z.
  const f=clamp(Number(input.forward)||0,-1,1),s=clamp(Number(input.strafe)||0,-1,1);
  const norm=Math.max(1,Math.hypot(f,s)),fw=f/norm,st=s/norm;
  const dx=-Math.sin(p.yaw)*fw+Math.cos(p.yaw)*st;
  const dz=-Math.cos(p.yaw)*fw-Math.sin(p.yaw)*st;
  const moving=Math.hypot(fw,st)>.05;
  if(input.slide&&p.grounded&&p.slide<=0&&moving){p.slide=.75;const v=Math.max(Math.hypot(p.vx,p.vz),SLIDE_SPEED);p.vx=dx*v;p.vz=dz*v;}
  if(input.jump&&p.grounded){p.vy=JUMP_SPEED;p.grounded=false;p.slide=0;}
  if(p.slide>0){p.slide=Math.max(0,p.slide-dt);p.vx*=Math.exp(-dt*1.1);p.vz*=Math.exp(-dt*1.1);}
  else {const speed=input.sprint?SPRINT_SPEED:MOVE_SPEED,alpha=1-Math.exp(-(p.grounded?13:4)*dt);p.vx+=(dx*speed-p.vx)*alpha;p.vz+=(dz*speed-p.vz)*alpha;}
  const previousFeet=p.y;
  p.vy-=GRAVITY*dt;
  let newY=p.y+p.vy*dt;
  if(p.vy<=0){
    let floor=0;
    for(const b of colliders){
      if(overlaps(p.x,p.z,b) && previousFeet>=b.h-.12 && newY<=b.h && b.h>floor)floor=b.h;
    }
    if(newY<=floor){newY=floor;p.vy=0;p.grounded=true;}else p.grounded=false;
  }else p.grounded=false;
  p.y=Math.max(0,newY);
  if(p.y===0){p.vy=0;p.grounded=true;}
  const nx=clamp(p.x+p.vx*dt,-ARENA_HALF+1,ARENA_HALF-1);
  if(!blocked(nx,p.z,p.y,colliders))p.x=nx;else p.vx=0;
  const nz=clamp(p.z+p.vz*dt,-ARENA_HALF+1,ARENA_HALF-1);
  if(!blocked(p.x,nz,p.y,colliders))p.z=nz;else p.vz=0;
  p.cooldown=Math.max(0,p.cooldown-dt);
  p.energy=Math.min(100,p.energy+13*dt);
  return p;
}
export function canTag(source,target,tool,colliders){
  if(!source||!target||source.respawn>0||target.respawn>0)return false;
  const x=target.x-source.x,z=target.z-source.z,dy=(target.y+1.2)-(source.y+1.4);
  const distance=Math.hypot(x,dy,z);
  if(distance>tool.range||distance<.01)return false;
  const forward={x:-Math.sin(source.yaw)*Math.cos(source.pitch),z:-Math.cos(source.yaw)*Math.cos(source.pitch),y:Math.sin(source.pitch)};
  const projection=(x*forward.x+z*forward.z+dy*forward.y)/distance;
  const cone=Math.max(.955,1-(.58/distance)**2/2); // generous visual tagging cone for arcade play
  return projection>=cone&&clearSight(source.x,source.z,target.x,target.z,colliders,source.y+1.4,target.y+1.2);
}
export function bestSpawn(mapId,players=[]){
  const spawns=(MAPS[mapId]||MAPS.yard).spawn;
  return spawns.reduce((best,p)=>{
    const nearest=Math.min(100,...players.map(o=>Math.hypot(o.x-p[0],o.z-p[1])));
    return nearest>best.nearest?{nearest,x:p[0],z:p[1]}:best;
  },{nearest:-1,x:spawns[0][0],z:spawns[0][1]});
}
