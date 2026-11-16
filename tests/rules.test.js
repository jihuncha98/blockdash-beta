import test from 'node:test';
import assert from 'node:assert/strict';
import {
 GAME_VERSION,MAPS,WEAPONS,RARITIES,HEALTH,ROUND_TIME,RESPAWN_TIME,SPAWN_PROTECTION,BDC,
 rects,makePlayer,stepPlayer,blocked,bestSpawn,offMap,hitSpread,fireAttempt,tickCombat,startReload,setSlot,setLoadout,revive,raycastCombat,dealDamage,drawWeapon,rarityDraw,rewardForMatch
} from '../shared/rules.js';
const walk=(p,input,seconds=1,colliders=[],map='yard')=>{for(let i=0;i<Math.round(seconds*60);i++)stepPlayer(p,input,1/60,colliders,map);return p;};
test('v2 metadata and all 20 fixed fictional weapons',()=>{
 assert.equal(WEAPONS.M416.damage,17);assert.equal(WEAPONS.AWM.damage,125);assert.equal(ROUND_TIME,360);assert.equal(RESPAWN_TIME,5);assert.equal(SPAWN_PROTECTION,3);
 assert.equal(Object.keys(WEAPONS).length,20);assert.equal(new Set(Object.keys(WEAPONS)).size,20);
 assert.deepEqual(Object.fromEntries(Object.keys(RARITIES).map(r=>[r,Object.values(WEAPONS).filter(w=>w.rarity===r).length])),{common:5,rare:7,epic:5,legendary:3});
 for(const w of Object.values(WEAPONS))assert.ok(w.damage>0&&w.mag>0&&w.reload>0&&w.rpm>0&&w.recoil>0);
});
test('automatic and single fire modes match approved list',()=>{
 const auto=Object.values(WEAPONS).filter(w=>w.auto).map(w=>w.key);
 assert.deepEqual(auto.sort(),['M416','AKM','AUG','Groza','UMP45','Micro UZI','Vector','P90','S12K','DBS'].sort());
});
test('map dimensions and no spawn embedded in solid geometry',()=>{
 assert.equal(MAPS.yard.half,50);assert.equal(MAPS.sky.half,45);
 for(const [key,map] of Object.entries(MAPS)){assert.equal(map.spawn.length,8);assert.ok(rects(key).length>=12);
  for(const [x,z] of map.spawn)assert.equal(blocked(x,z,0,rects(key)),false,`${key} spawn ${x},${z}`);}
});
test('forward and sideways movement follow camera',()=>{let p=makePlayer(0,20);walk(p,{forward:1});assert.ok(p.z<16);assert.ok(Math.abs(p.x)<.1);
 p=makePlayer(0,0);p.yaw=-Math.PI/2;walk(p,{forward:1});assert.ok(p.x>4);});
test('diagonal is normalized',()=>{const a=makePlayer(),b=makePlayer();walk(a,{forward:1},.8);walk(b,{forward:1,strafe:1},.8);assert.ok(Math.abs(Math.hypot(a.vx,a.vz)-Math.hypot(b.vx,b.vz))<.08);});
test('sprint is faster and ADS speed reduces movement',()=>{const a=makePlayer(),b=makePlayer(),c=makePlayer();walk(a,{forward:1});walk(b,{forward:1,sprint:true});walk(c,{forward:1,sprint:true,ads:true});
 assert.ok(Math.hypot(b.vx,b.vz)>Math.hypot(c.vx,c.vz));assert.ok(Math.hypot(c.vx,c.vz)>Math.hypot(a.vx,a.vz));});
test('crouch is slower and jump rises and lands',()=>{const a=makePlayer(),b=makePlayer();walk(a,{forward:1,crouch:true});walk(b,{forward:1});assert.ok(Math.hypot(a.vx,a.vz)<Math.hypot(b.vx,b.vz));
 const p=makePlayer();walk(p,{jump:true},.12);assert.ok(p.y>0);walk(p,{},1);assert.equal(p.y,0);assert.equal(p.grounded,true);});
test('sliding is limited by cooldown',()=>{const p=makePlayer();walk(p,{forward:1,sprint:true},.3);stepPlayer(p,{forward:1,slide:true},1/60,[]);assert.ok(p.slide>.7);assert.ok(p.slideReady>1.9);
 walk(p,{forward:1},.9);stepPlayer(p,{forward:1,slide:true},1/60,[]);assert.equal(p.slide,0);});
test('collision and roof landing',()=>{const c=[{x:0,z:0,w:6,h:2,d:6}],p=makePlayer(0,8);walk(p,{forward:1},3,c);assert.ok(p.z>=3.4&&p.z<4.1);
 const a=makePlayer(0,0);a.y=3;a.vy=-1;a.grounded=false;walk(a,{},.5,c);assert.equal(a.y,2);});
test('off-map is a separate instant elimination trigger',()=>{const p=makePlayer(45.5,0);assert.equal(offMap(p,'sky'),true);assert.equal(offMap(p,'yard'),false);});
test('ADS spread 40 percent lower on AR and SMG and unchanged on SR',()=>{const p=makePlayer();assert.equal(hitSpread(WEAPONS.M416,p),1.2);p.ads=true;assert.equal(hitSpread(WEAPONS.M416,p),.72);
 assert.equal(hitSpread(WEAPONS.Kar98k,p),.2);p.ads=false;assert.equal(hitSpread(WEAPONS.Kar98k,p),.2);});
test('spread movement multipliers combine',()=>{const p=makePlayer();p.crouch=true;assert.ok(Math.abs(hitSpread(WEAPONS.P92,p)-1.35)<.00001);
 p.grounded=false;p.crouch=false;assert.ok(Math.abs(hitSpread(WEAPONS.P92,p)-2.1)<.00001);});
test('firing drains magazine and requires cooldown',()=>{const p=makePlayer();const x=fireAttempt(p);assert.equal(x.ok,true);assert.equal(p.ammo.M416,39);assert.equal(fireAttempt(p).ok,false);
 tickCombat(p,60/700);assert.equal(fireAttempt(p).ok,true);});
test('empty magazine triggers automatic reload and refills',()=>{const p=makePlayer();p.ammo.M416=1;assert.equal(fireAttempt(p).ok,true);assert.equal(p.reload,2);
 tickCombat(p,2.01);assert.equal(p.ammo.M416,40);assert.equal(p.reload,0);});
test('weapon change cancels reload without magic ammo refill',()=>{const p=makePlayer();p.ammo.M416=15;assert.ok(startReload(p));setSlot(p,1);assert.equal(p.reload,0);assert.equal(p.ammo.M416,15);});
test('loadout requires primary gun and pistol',()=>{const p=makePlayer();assert.equal(setLoadout(p,'P92','M416'),false);assert.equal(setLoadout(p,'AKM','P1911'),true);assert.equal(p.ammo.AKM,40);});
test('respawn heals, refills and grants invulnerability but preserves score',()=>{const p=makePlayer();p.hp=4;p.score=325;p.kills=3;p.deaths=2;p.respawn=0;p.ammo.M416=2;
 revive(p,1,2);assert.equal(p.hp,HEALTH);assert.equal(p.score,325);assert.equal(p.ammo.M416,40);assert.equal(p.invuln,3);});
test('server-side abstract hitscan checks head and body damage',()=>{const s=makePlayer(0,10),t=makePlayer(0,0);const head=raycastCombat(s,[t],WEAPONS.M416,[],()=>.5);assert.equal(head.hits.get(t),25.5);
 s.pitch=-.06;const body=raycastCombat(s,[t],WEAPONS.M416,[],()=>.5);assert.equal(body.hits.get(t),17);});
test('cover blocks hits and no range damage falloff',()=>{const s=makePlayer(0,10),t=makePlayer(0,0);const wall=[{x:0,z:5,w:7,h:4,d:2}];assert.equal(raycastCombat(s,[t],WEAPONS.AWM,wall,()=>.5).hits.size,0);
 assert.ok(raycastCombat(s,[t],WEAPONS.AWM,[],()=>.5).hits.get(t)>=125);});
test('shotgun consists of 10 pellets and can miss independently',()=>{const s=makePlayer(0,4),t=makePlayer(0,0);const out=raycastCombat(s,[t],WEAPONS.S1897,[],()=>.5);assert.equal(out.rays.length,10);assert.ok(out.hits.get(t)>0);});
test('damage, kills, assists and regen cooldown',()=>{const victim=makePlayer(),a=makePlayer(),b=makePlayer();a.id='a';b.id='b';victim.id='v';
 assert.equal(dealDamage(victim,b,20,[a,b,victim],1).killed,false);
 const r=dealDamage(victim,a,90,[a,b,victim],4);assert.equal(r.killed,true);assert.equal(a.score,100);assert.equal(a.kills,1);assert.equal(b.score,25);assert.equal(b.assists,1);assert.equal(victim.respawn,5);
});
test('spawn protection blocks hits even after attacking',()=>{const v=makePlayer(),a=makePlayer();v.invuln=3;fireAttempt(v);assert.equal(dealDamage(v,a,125,[a,v],0).applied,0);assert.equal(v.hp,100);});
test('draw probability boundaries are exact',()=>{assert.equal(rarityDraw(()=>0),'common');assert.equal(rarityDraw(()=>.7),'rare');assert.equal(rarityDraw(()=>.95),'epic');assert.equal(rarityDraw(()=>.995),'legendary');assert.equal(drawWeapon(()=>.999).rarity,'legendary');});
test('virtual BDC rewards and box prices',()=>{assert.equal(BDC.single,700);assert.equal(BDC.ten,6000);assert.equal(BDC.duplicate,350);
 assert.equal(rewardForMatch(3,true,'bots'),310);assert.equal(rewardForMatch(2,false,'ffa'),140);assert.equal(rewardForMatch(100,true,'practice'),0);});
test('best respawn prefers farthest and least visible',()=>{const p=bestSpawn('yard',[makePlayer(-36,36)]);assert.ok(Math.hypot(p.x+36,p.z-36)>10);});
