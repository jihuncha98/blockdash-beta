import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../server/index.js';
function receive(ws,predicate=()=>true,timeout=3000){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.removeEventListener('message',onMessage);reject(new Error('message timeout'));},timeout);
  const onMessage=event=>{let msg;try{msg=JSON.parse(event.data);}catch{return;}if(predicate(msg)){clearTimeout(timer);ws.removeEventListener('message',onMessage);resolve(msg);}};
  ws.addEventListener('message',onMessage);
});}
function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.addEventListener('open',()=>resolve(ws),{once:true});ws.addEventListener('error',reject,{once:true});});}
test('health, room creation, two-player join, movement and snapshots',async()=>{
  const game=createGameServer({port:0,host:'127.0.0.1'});const addr=await game.listen(),url=`ws://127.0.0.1:${addr.port}/ws`;
  let a,b;
  try{
    const health=await fetch(`http://127.0.0.1:${addr.port}/health`);assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
    a=await connect(url);const aj=receive(a,m=>m.type==='joined');a.send(JSON.stringify({type:'join',name:'Alpha',mode:'ffa',map:'yard',tool:'spark'}));const one=await aj;assert.match(one.room,/^[A-F0-9]{7}$/);
    b=await connect(url);const bj=receive(b,m=>m.type==='joined');b.send(JSON.stringify({type:'join',name:'Bravo',room:one.room,mode:'ffa'}));const two=await bj;assert.equal(two.room,one.room);assert.notEqual(two.id,one.id);
    const playing=await receive(a,m=>m.type==='state'&&m.status==='playing'&&m.players.length===2);
    assert.equal(playing.players.length,2);
    const original=playing.players.find(p=>p.id===one.id);
    a.send(JSON.stringify({type:'input',yaw:0,pitch:0,input:{forward:1}}));
    const advanced=await receive(a,m=>m.type==='state'&&m.players.find(p=>p.id===one.id)?.z<original.z-.09,3000);
    assert.ok(advanced.players.find(p=>p.id===one.id).z<original.z);
    const rooms=await (await fetch(`http://127.0.0.1:${addr.port}/rooms`)).json();assert.ok(Array.isArray(rooms));
  }finally{a?.close();b?.close();await game.close();}
});
test('invalid room code returns server error',async()=>{
  const game=createGameServer({port:0,host:'127.0.0.1'});const addr=await game.listen();let a;
  try{a=await connect(`ws://127.0.0.1:${addr.port}/ws`);const message=receive(a,m=>m.type==='error');a.send(JSON.stringify({type:'join',room:'NOTFOUND'}));assert.match((await message).message,/찾을 수/);}finally{a?.close();await game.close();}
});
