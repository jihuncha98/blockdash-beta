// BLOCKDASH v2.1: fictional arcade arena rules shared by browser and Node.
export const GAME_VERSION='2.1.0';
export const ROUND_TIME=360;
export const RESPAWN_TIME=5;
export const SPAWN_PROTECTION=3;
export const HEALTH=100;
export const REGEN_DELAY=5;
export const REGEN_RATE=15;
export const PLAYER_RADIUS=.47;
export const PLAYER_HEIGHT=1.8;
export const GRAVITY=24;
export const JUMP_SPEED=Math.sqrt(2*GRAVITY*1.5);
export const MOVE_SPEED=6;
export const SPRINT_SPEED=8.5;
export const CROUCH_SPEED=3.5;
export const SLIDE_SPEED=10;
export const SLIDE_DURATION=.8;
export const SLIDE_COOLDOWN=2;
export const AIR_CONTROL=.65;
export const MAX_PLAYERS=8;
export const RELOAD_TIME=Object.freeze({AR:2,SMG:1.7,SR:2.5,SG:2.2,HG:1.4});
export const RARITIES=Object.freeze({common:{name:'일반',weight:70,color:'#aeb5c0',index:100},rare:{name:'희귀',weight:25,color:'#5798ee',index:103},epic:{name:'영웅',weight:4.5,color:'#a779f2',index:106},legendary:{name:'전설',weight:.5,color:'#ffc167',index:110}});
const W=(key,kind,rarity,damage,rpm,mag,recoil,auto=false)=>Object.freeze({key,name:key,kind,rarity,damage,rpm,mag,recoil,auto,reload:RELOAD_TIME[kind],pellets:kind==='SG'?10:1});
export const WEAPONS=Object.freeze({
 M416:W('M416','AR','common',17,700,40,.245,true),AKM:W('AKM','AR','rare',20,620,40,.385,true),AUG:W('AUG','AR','epic',18,750,40,.210,true),Groza:W('Groza','AR','legendary',19,800,40,.350,true),
 UMP45:W('UMP45','SMG','common',15,650,35,.175,true),'Micro UZI':W('Micro UZI','SMG','rare',11,950,35,.140,true),Vector:W('Vector','SMG','rare',12,1000,33,.154,true),P90:W('P90','SMG','epic',13,900,50,.126,true),
 Kar98k:W('Kar98k','SR','common',60,50,7,1.050),M24:W('M24','SR','rare',68,55,7,1.190),'Mosin-Nagant':W('Mosin-Nagant','SR','epic',72,60,7,1.260),AWM:W('AWM','SR','legendary',125,45,5,1.400),
 S1897:W('S1897','SG','common',60,65,5,.840),S686:W('S686','SG','rare',70,105,2,1.050),S12K:W('S12K','SG','epic',45,270,10,.595,true),DBS:W('DBS','SG','legendary',55,210,14,.700,true),
 P92:W('P92','HG','common',18,370,15,.210),P1911:W('P1911','HG','rare',22,330,7,.280),R1895:W('R1895','HG','rare',28,210,7,.385),Deagle:W('Deagle','HG','epic',30,260,7,.490)
});
export const STARTER_WEAPONS=Object.freeze(['M416','P92']);
export const BOT_LEVELS=Object.freeze({easy:{reaction:.8,accuracy:.44,speed:.72},normal:{reaction:.5,accuracy:.69,speed:.88},hard:{reaction:.3,accuracy:.86,speed:1}});
export const MAPS=Object.freeze({
 yard:{name:'BLOCK YARD',half:50,sky:'#151d2b',floor:'#293543',accent:'#f28a32',spawn:[[-36,36],[36,-36],[36,36],[-36,-36],[0,37],[0,-37],[33,0],[-33,0]],blocks:[
 [-26,-24,10,4,7],[-27,24,10,4,8],[27,-24,10,4,8],[27,24,10,4,8],[-12,-5,6,3.5,13],[12,5,6,3.5,13],[0,0,8,5,8],[-39,0,4,3,12],[39,0,4,3,12],[0,-40,15,4,3],[0,40,15,4,3],[-13,35,6,2.5,5],[13,-35,6,2.5,5]
 ],crates:[[-34,-8],[34,8],[-8,18],[8,-18],[-27,4],[27,-4],[-20,-36],[20,36]],platforms:[]},
 sky:{name:'SKY GRID',half:45,sky:'#131a2b',floor:'#253247',accent:'#f28a32',spawn:[[0,32],[32,0],[-32,0],[0,-32],[31,31],[-31,-31],[31,-31],[-31,31]],blocks:[
 [-23,-21,8,5,8],[23,-21,8,5,8],[-23,21,8,5,8],[23,21,8,5,8],[0,0,9,4,9],[0,-37,14,4,3],[0,37,14,4,3],[-37,0,3,4,14],[37,0,3,4,14],[-13,0,4,3,5],[13,0,4,3,5]
 ],crates:[[-34,-34],[34,34],[-34,34],[34,-34],[-10,-30],[11,30]],platforms:[[-17,-34,6,1.25,4],[17,-34,6,1.25,4],[-17,34,6,1.25,4],[17,34,6,1.25,4]]}
});
export const MODES=Object.freeze({practice:'연습',bots:'AI 대전',ffa:'개인전',tdm:'팀전'});
export const BDC=Object.freeze({single:700,ten:6000,duplicate:350,participation:100,kill:20,victory:150});
export function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
export function normalAngle(value){return Math.atan2(Math.sin(value),Math.cos(value));}
export function rects(mapId='yard'){
 const map=MAPS[mapId]||MAPS.yard;
 return [...map.blocks.map(([x,z,w,h,d])=>({x,z,w,h,d,kind:'wall'})),...map.crates.map(([x,z])=>({x,z,w:2.7,h:2.35,d:2.7,kind:'crate'})),...map.platforms.map(([x,z,w,h,d])=>({x,z,w,h,d,kind:'platform'}))];
}
export function overlaps(x,z,box,r=PLAYER_RADIUS){const nx=clamp(x,box.x-box.w/2,box.x+box.w/2),nz=clamp(z,box.z-box.d/2,box.z+box.d/2);return (x-nx)**2+(z-nz)**2<r*r;}
export function blocked(x,z,feet,colliders){return colliders.some(b=>feet<b.h-.04&&feet+PLAYER_HEIGHT>.05&&overlaps(x,z,b));}
export function clearSight(ax,az,bx,bz,colliders,ay=1.5,by=1.5){
 const d=Math.hypot(ax-bx,az-bz),steps=Math.max(1,Math.ceil(d/.55));
 for(let i=1;i<steps;i++){const t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t,y=ay+(by-ay)*t;
 if(colliders.some(b=>y>=0&&y<b.h-.08&&x>b.x-b.w/2&&x<b.x+b.w/2&&z>b.z-b.d/2&&z<b.z+b.d/2))return false;}return true;
}
export function initialAmmo(primary='M416',secondary='P92'){return {[primary]:WEAPONS[primary]?.mag||40,[secondary]:WEAPONS[secondary]?.mag||15};}
export function makePlayer(x=0,z=32,primary='M416',secondary='P92'){
 return {x,z,y:0,vx:0,vz:0,vy:0,yaw:0,pitch:0,grounded:true,slide:0,slideReady:0,crouch:false,ads:false,
 hp:HEALTH,respawn:0,invuln:0,regenWait:0,score:0,kills:0,deaths:0,assists:0,streak:0,primary,secondary,slot:0,
 ammo:initialAmmo(primary,secondary),reload:0,reloadWeapon:null,fireCooldown:0,damageLog:{}};
}
export function equipped(p){return p.slot===1?p.secondary:p.primary;}
export function setSlot(p,slot){if(slot!==0&&slot!==1)return false; if(p.slot===slot)return true;p.slot=slot;p.reload=0;p.reloadWeapon=null;return true;}
export function setLoadout(p,primary,secondary){if(!WEAPONS[primary]||WEAPONS[primary].kind==='HG'||WEAPONS[secondary]?.kind!=='HG')return false;p.primary=primary;p.secondary=secondary;p.slot=0;p.ammo=initialAmmo(primary,secondary);p.reload=0;p.reloadWeapon=null;return true;}
export function startReload(p){const key=equipped(p),w=WEAPONS[key];if(!w||p.reload>0||p.ammo[key]>=w.mag||p.respawn>0)return false;p.reload=w.reload;p.reloadWeapon=key;return true;}
export function tickCombat(p,dt){
 p.fireCooldown=Math.max(0,p.fireCooldown-dt);
 if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(p.reload===0&&p.reloadWeapon){p.ammo[p.reloadWeapon]=WEAPONS[p.reloadWeapon].mag;p.reloadWeapon=null;}}
 if(p.respawn>0)return;
 p.invuln=Math.max(0,p.invuln-dt);
 if(p.regenWait>0)p.regenWait=Math.max(0,p.regenWait-dt);else if(p.hp>0)p.hp=Math.min(HEALTH,p.hp+REGEN_RATE*dt);
}
export function fireAttempt(p){const key=equipped(p),w=WEAPONS[key];if(!w||p.respawn>0||p.fireCooldown>.0001||p.reload>0)return {ok:false,reason:'locked'};
 if((p.ammo[key]??0)<=0){startReload(p);return {ok:false,reason:'empty'};}
 p.ammo[key]-=1;p.fireCooldown=60/w.rpm;if(p.ammo[key]===0)startReload(p);return {ok:true,weapon:w};
}
export function stepPlayer(p,input,dt,colliders,mapId='yard'){
 dt=clamp(dt,0,.05);const f=clamp(Number(input.forward)||0,-1,1),s=clamp(Number(input.strafe)||0,-1,1),norm=Math.max(1,Math.hypot(f,s)),fw=f/norm,st=s/norm;
 const dx=-Math.sin(p.yaw)*fw+Math.cos(p.yaw)*st,dz=-Math.cos(p.yaw)*fw-Math.sin(p.yaw)*st,moving=Math.hypot(fw,st)>.05;
 p.slideReady=Math.max(0,p.slideReady-dt);p.crouch=!!input.crouch&&!p.slide;p.ads=!!input.ads;
 if(input.slide&&p.grounded&&p.slide<=0&&p.slideReady<=0&&moving){p.slide=SLIDE_DURATION;p.slideReady=SLIDE_COOLDOWN;p.vx=dx*SLIDE_SPEED;p.vz=dz*SLIDE_SPEED;}
 if(input.jump&&p.grounded){p.vy=JUMP_SPEED;p.grounded=false;p.slide=0;}
 if(p.slide>0){p.slide=Math.max(0,p.slide-dt);p.vx*=Math.exp(-dt*1.1);p.vz*=Math.exp(-dt*1.1);}
 else {let speed=p.crouch?CROUCH_SPEED:input.sprint?SPRINT_SPEED:MOVE_SPEED;if(p.ads)speed*=.85;
 const control=p.grounded?1:AIR_CONTROL,alpha=1-Math.exp(-13*control*dt);
 p.vx+=(dx*speed-p.vx)*alpha;p.vz+=(dz*speed-p.vz)*alpha;}
 const oldY=p.y;p.vy-=GRAVITY*dt;let y=p.y+p.vy*dt;
 if(p.vy<=0){let floor=0;for(const b of colliders)if(overlaps(p.x,p.z,b)&&oldY>=b.h-.12&&y<=b.h&&b.h>floor)floor=b.h;
 if(y<=floor){y=floor;p.vy=0;p.grounded=true;}else p.grounded=false;}else p.grounded=false;
 p.y=Math.max(0,y);if(p.y===0){p.vy=0;p.grounded=true;}
 const nx=p.x+p.vx*dt;if(!blocked(nx,p.z,p.y,colliders))p.x=nx;else p.vx=0;
 const nz=p.z+p.vz*dt;if(!blocked(p.x,nz,p.y,colliders))p.z=nz;else p.vz=0;
 return p;
}
export function offMap(p,mapId='yard'){const h=(MAPS[mapId]||MAPS.yard).half;return Math.abs(p.x)>h||Math.abs(p.z)>h;}
export function bestSpawn(mapId,players=[],team=0){const map=MAPS[mapId]||MAPS.yard;let choices=map.spawn;
 if(team===1)choices=choices.filter((_,i)=>i%2===0);if(team===2)choices=choices.filter((_,i)=>i%2===1);
 return choices.reduce((best,point)=>{const nearest=Math.min(100,...players.filter(p=>p.respawn<=0).map(p=>Math.hypot(p.x-point[0],p.z-point[1])));
 const visible=players.filter(p=>p.respawn<=0&&Math.hypot(p.x-point[0],p.z-point[1])<27&&clearSight(point[0],point[1],p.x,p.z,rects(mapId))).length;
 const value=nearest-visible*22;return value>best.value?{value,x:point[0],z:point[1]}:best;},{value:-Infinity,x:choices[0][0],z:choices[0][1]});
}
export function revive(p,x,z){const carry={score:p.score,kills:p.kills,deaths:p.deaths,assists:p.assists,primary:p.primary,secondary:p.secondary};Object.assign(p,makePlayer(x,z,carry.primary,carry.secondary),carry,{invuln:SPAWN_PROTECTION});return p;}
export function hitSpread(w,p){const base=w.kind==='SG'?(p.ads?8:10):w.kind==='SR'?.2:w.kind==='AR'?(p.ads?.72:1.2):w.kind==='SMG'?(p.ads?1.08:1.8):(p.ads?.9:1.5);
 let m=p.slide>0?1.3:!p.grounded?1.4:Math.hypot(p.vx,p.vz)>MOVE_SPEED+.4?1.2:1;
 if(p.crouch)m*=.9;return base*m;
}
const rad=a=>a*Math.PI/180;
export function directionFor(p,spreadAngle=0,random=Math.random){const yaw=p.yaw+(random()+random()-1)*rad(spreadAngle)/2,pitch=p.pitch+(random()+random()-1)*rad(spreadAngle)/2;
 return {x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};}
function rayBox(origin,dir,b){let min=0,max=110;const bounds=[[b.x-b.w/2,b.x+b.w/2,'x'],[0,b.h,'y'],[b.z-b.d/2,b.z+b.d/2,'z']];for(const [low,high,axis] of bounds){const v=dir[axis],o=origin[axis];if(Math.abs(v)<1e-8){if(o<low||o>high)return Infinity;continue;}let a=(low-o)/v,c=(high-o)/v;if(a>c)[a,c]=[c,a];min=Math.max(min,a);max=Math.min(max,c);if(max<min)return Infinity;}return min;}
function raySphere(o,d,c,r){const x=o.x-c.x,y=o.y-c.y,z=o.z-c.z,b=x*d.x+y*d.y+z*d.z,c2=x*x+y*y+z*z-r*r,disc=b*b-c2;if(disc<0)return Infinity;const t=-b-Math.sqrt(disc);return t>0?t:Infinity;}
export function raycastCombat(shooter,targets,w,colliders,random=Math.random){
 const origin={x:shooter.x,y:shooter.y+(shooter.slide>0?1.05:shooter.crouch?1.23:1.64),z:shooter.z};const hits=new Map();const rays=[];
 for(let i=0;i<w.pellets;i++){const dir=directionFor(shooter,hitSpread(w,shooter),random);
 let nearest=Math.min(110,...colliders.map(b=>rayBox(origin,dir,b))),found=null;
 for(const candidate of targets){if(candidate===shooter||candidate.respawn>0)continue;
 const p=candidate.p||candidate;const body=raySphere(origin,dir,{x:p.x,y:p.y+1.05,z:p.z},.55);
 const head=raySphere(origin,dir,{x:p.x,y:p.y+1.77,z:p.z},.33);
 const distance=Math.min(body,head);if(distance<nearest){nearest=distance;found={candidate,head:head<body};}}
 if(found){const damage=w.damage/w.pellets*(found.head?1.5:1);hits.set(found.candidate,(hits.get(found.candidate)||0)+damage);rays.push({hit:true,head:found.head,distance:nearest});}
 else rays.push({hit:false,distance:Number.isFinite(nearest)?nearest:45});
 }
 return {hits,rays};
}
export function dealDamage(victim,attacker,amount,players,now=0){if(victim.respawn>0||victim.invuln>0||amount<=0)return {applied:0,killed:false};
 const applied=Math.min(victim.hp,amount);victim.hp=Math.max(0,victim.hp-amount);victim.regenWait=REGEN_DELAY;
 victim.damageLog[attacker.id??attacker.name??'unknown']=now;
 if(victim.hp>0)return {applied,killed:false};
 victim.respawn=RESPAWN_TIME;victim.deaths++;victim.streak=0;attacker.kills++;attacker.streak++;attacker.score+=100;
 const assisting=[];for(const other of players){if(other===attacker||other===victim)continue;const key=other.id??other.name??'unknown';if(now-(victim.damageLog[key]??-Infinity)<=5){other.assists++;other.score+=25;assisting.push(other);}}
 victim.damageLog={};return {applied,killed:true,assisting};
}
export function rarityDraw(random=Math.random){const n=random()*100;let sum=0;for(const [key,r] of Object.entries(RARITIES)){sum+=r.weight;if(n<sum)return key;}return 'legendary';}
export function drawWeapon(random=Math.random){const rarity=rarityDraw(random),choices=Object.values(WEAPONS).filter(w=>w.rarity===rarity);return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];}
export function rewardForMatch(kills,win,mode){return mode==='practice'?0:BDC.participation+BDC.kill*Math.max(0,Math.floor(kills))+Number(!!win)*BDC.victory;}
