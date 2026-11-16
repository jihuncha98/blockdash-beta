import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../server/index.js';
function receive(ws,predicate=()=>true,timeout=5000){return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{ws.removeEventListener('message',handle);reject(new Error('Message timeout'));},timeout);
 const handle=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(predicate(m)){clearTimeout(timer);ws.removeEventListener('message',handle);resolve(m);}};
 ws.addEventListener('message',handle);
});}
async function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.addEventListener('open',()=>resolve(ws),{once:true});ws.addEventListener('error',reject,{once:true});});}
async function joined(ws,opts){const p=receive(ws,m=>m.type==='joined');ws.send(JSON.stringify({type:'join',name:'Player',...opts}));return p;}
test('server health, FFA room join and authoritative movement snapshots',async()=>{
 const game=createGameServer({port:0,host:'127.0.0.1',countdownSeconds:.12,roundSeconds:3});const a=await game.listen(),url=`ws://127.0.0.1:${a.port}/ws`;let ws1,ws2;
 try{const h=await (await fetch(`http://127.0.0.1:${a.port}/health`)).json();assert.equal(h.ok,true);
  ws1=await connect(url);const one=await joined(ws1,{mode:'ffa',map:'yard'});
  ws2=await connect(url);const two=await joined(ws2,{room:one.room,mode:'ffa'});assert.equal(one.room,two.room);assert.notEqual(one.id,two.id);
  const playing=await receive(ws1,m=>m.type==='state'&&m.status==='playing');
  const before=playing.players.find(p=>p.id===one.id);
  ws1.send(JSON.stringify({type:'input',yaw:0,pitch:0,input:{forward:1,sprint:true}}));
  const advanced=await receive(ws1,m=>m.type==='state'&&m.status==='playing'&&m.players.find(p=>p.id===one.id).z<before.z-.07);
  assert.ok(advanced.players.find(p=>p.id===one.id).z<before.z);
  const rooms=await (await fetch(`http://127.0.0.1:${a.port}/rooms`)).json();assert.ok(Array.isArray(rooms));
 }finally{ws1?.close();ws2?.close();await game.close();}
});
test('team mode waits for 2v2 players before starting',async()=>{
 const game=createGameServer({port:0,host:'127.0.0.1',countdownSeconds:.1,roundSeconds:.6});const a=await game.listen(),url=`ws://127.0.0.1:${a.port}/ws`;const sockets=[];
 try{const first=await connect(url);sockets.push(first);const one=await joined(first,{mode:'tdm',teamSize:2,map:'yard'});
  for(let i=0;i<2;i++){const ws=await connect(url);sockets.push(ws);await joined(ws,{room:one.room});}
  assert.equal(game.rooms.get(one.room).status,'waiting');
  const fourth=await connect(url);sockets.push(fourth);await joined(fourth,{room:one.room});
  await receive(first,m=>m.type==='state'&&m.status==='playing');
  const outcome=await receive(first,m=>m.type==='event'&&m.event==='end');assert.equal(typeof outcome.outcome.reward,'number');
 }finally{sockets.forEach(s=>s.close());await game.close();}
});
test('authenticated AI match grants server-calculated BDC to account',async()=>{
 const game=createGameServer({port:0,host:'127.0.0.1',countdownSeconds:.12,roundSeconds:.65});const a=await game.listen(),base=`http://127.0.0.1:${a.port}`;let ws;
 try{const auth=await fetch(base+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'test_user',password:'SecretPass999'})});assert.equal(auth.status,200);
  const {token}=await auth.json();
  const p=await (await fetch(base+'/api/profile',{headers:{Authorization:`Bearer ${token}`}})).json();assert.deepEqual(p.profile.owned,['M416','P92']);
  ws=await connect(`ws://127.0.0.1:${a.port}/ws`);const one=await joined(ws,{mode:'bots',map:'yard',bots:2,difficulty:'easy',authToken:token});assert.match(one.room,/^[A-F0-9]{7}$/);
  const playing=await receive(ws,m=>m.type==='state'&&m.status==='playing');assert.equal(playing.players.length,3);
  const ended=await receive(ws,m=>m.type==='event'&&m.event==='end');assert.ok(ended.outcome.reward>=100);
  const updated=await (await fetch(base+'/api/profile',{headers:{Authorization:`Bearer ${token}`}})).json();assert.equal(updated.profile.bdc,ended.outcome.reward);
  const forbidden=await fetch(base+'/api/draw',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({count:10})});assert.equal(forbidden.status,400);
 }finally{ws?.close();await game.close();}
});
test('invalid room code rejects join',async()=>{const game=createGameServer({port:0,host:'127.0.0.1'});const a=await game.listen();let ws;
 try{ws=await connect(`ws://127.0.0.1:${a.port}/ws`);const p=receive(ws,m=>m.type==='error');ws.send(JSON.stringify({type:'join',room:'BADCODE'}));assert.match((await p).message,/찾을 수/);
 }finally{ws?.close();await game.close();}
});
