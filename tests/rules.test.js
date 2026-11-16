import test from 'node:test';
import assert from 'node:assert/strict';
import {MAPS,TOOLS,rects,makePlayer,stepPlayer,canTag,blocked,bestSpawn,clearSight} from '../shared/rules.js';
const run=(p,input,colliders,seconds=1)=>{for(let i=0;i<Math.round(seconds*60);i++)stepPlayer(p,input,1/60,colliders);return p;};
test('maps and tag tools have distinct, valid data',()=>{
  assert.equal(Object.keys(MAPS).length,2);assert.equal(Object.keys(TOOLS).length,3);
  for(const [name,map] of Object.entries(MAPS)){
    assert.ok(map.spawn.length>=8,name);assert.ok(rects(name).length>10);
    for(const [x,z] of map.spawn)assert.equal(blocked(x,z,0,rects(name)),false,`invalid spawn ${name} ${x},${z}`);
  }
});
test('W moves forward for yaw=0',()=>{const p=makePlayer(0,20);run(p,{forward:1},[],1);assert.ok(p.z<16,`z ${p.z}`);assert.ok(Math.abs(p.x)<.1);});
test('W is camera-relative for yaw 90 degrees right',()=>{const p=makePlayer(0,0);p.yaw=-Math.PI/2;run(p,{forward:1},[],1);assert.ok(p.x>4,`x ${p.x}`);assert.ok(Math.abs(p.z)<.1);});
test('D is to the camera right after turning',()=>{const p=makePlayer(0,0);p.yaw=-Math.PI/2;run(p,{strafe:1},[],1);assert.ok(p.z>4,`z ${p.z}`);});
test('diagonal speed remains capped',()=>{const a=makePlayer(),b=makePlayer();run(a,{forward:1},[],.8);run(b,{forward:1,strafe:1},[],.8);assert.ok(Math.abs(Math.hypot(a.vx,a.vz)-Math.hypot(b.vx,b.vz))<.05);});
test('collider blocks horizontal walking',()=>{const p=makePlayer(0,8);const c=[{x:0,z:0,w:6,h:4,d:6}];run(p,{forward:1},c,3);assert.ok(p.z>=3.45&&p.z<4.1,`z ${p.z}`);});
test('jump returns to ground without falling through',()=>{const p=makePlayer();run(p,{jump:true},[],.1);assert.ok(p.y>0);run(p,{},[],1.2);assert.equal(p.y,0);assert.equal(p.grounded,true);});
test('landing on roof works if above its top',()=>{const c=[{x:0,z:0,w:6,h:2,d:6}];const p=makePlayer(0,0);p.y=3;p.vy=-1;p.grounded=false;run(p,{},c,.45);assert.equal(p.y,2);});
test('tag score requires sight and aligned yaw',()=>{const a=makePlayer(0,10),b=makePlayer(0,0);assert.equal(canTag(a,b,TOOLS.spark,[]),true);
  a.yaw=Math.PI;assert.equal(canTag(a,b,TOOLS.spark,[]),false);
  a.yaw=0;assert.equal(canTag(a,b,TOOLS.spark,[{x:0,z:5,w:6,h:5,d:1}]),false);
});
test('best spawn selects farthest reasonable spawn',()=>{const p=bestSpawn('yard',[makePlayer(0,21)]);assert.ok(Math.hypot(p.x,p.z-21)>10);});
