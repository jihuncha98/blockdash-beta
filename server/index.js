import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Socket,upgradeWebSocket} from './ws.js';
import {MAPS,TOOLS,ROUND_TIME,RESPAWN_TIME,makePlayer,stepPlayer,rects,canTag,clamp,bestSpawn,normalAngle} from '../shared/rules.js';

const safeName=v=>String(v||'GUEST').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,16)||'GUEST';
const code=()=>randomBytes(5).toString('hex').toUpperCase().slice(0,7);
const id=()=>randomBytes(9).toString('hex');
const isFiniteNumber=v=>typeof v==='number'&&Number.isFinite(v);

export function createGameServer({port=3001,host='0.0.0.0',allowedOrigins=process.env.ALLOWED_ORIGINS||''}={}){
  const rooms=new Map(),sockets=new Set();
  const origins=allowedOrigins.split(',').map(s=>s.trim()).filter(Boolean);
  const send=(s,data)=>{if(s&&!s.closed)s.send(data);};
  const emit=(room,data)=>{for(const p of room.players.values())send(p.conn,data);};
  const roomList=()=>[...rooms.values()].filter(r=>r.privacy==='public'&&r.status!=='ended').map(r=>({code:r.code,mode:r.mode,map:r.map,count:[...r.players.values()].filter(p=>p.conn).length,max:8,status:r.status}));
  const server=http.createServer((req,res)=>{
    const origin=req.headers.origin||'*';
    const allow=!origins.length||origins.includes(origin);
    res.setHeader('Access-Control-Allow-Origin',allow?origin:'null');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(req.method!=='GET'){res.writeHead(405);res.end('{}');return;}
    if(req.url==='/health'){res.writeHead(200);res.end(JSON.stringify({ok:true,rooms:rooms.size,connections:sockets.size}));return;}
    if(req.url==='/rooms'){res.writeHead(200);res.end(JSON.stringify(roomList()));return;}
    res.writeHead(404);res.end(JSON.stringify({error:'not found'}));
  });
  const broadcastRoom=r=>emit(r,{type:'room',code:r.code,status:r.status,map:r.map,mode:r.mode,count:[...r.players.values()].filter(p=>p.conn).length});
  const snapshot=r=>({type:'state',code:r.code,status:r.status,time:Math.max(0,Math.ceil(r.time)),mode:r.mode,map:r.map,players:[...r.players.values()].map(o=>({id:o.id,name:o.name,team:o.team,tool:o.tool,x:o.p.x,y:o.p.y,z:o.p.z,yaw:o.p.yaw,pitch:o.p.pitch,shield:o.p.shield,respawn:Math.max(0,o.p.respawn),score:o.p.score,outs:o.p.outs,energy:Math.round(o.p.energy),slide:o.p.slide}))});
  function startRound(r){
    if(r.players.size<2)return;
    r.status='playing';r.time=ROUND_TIME;r.endDelay=0;
    for(const p of r.players.values()){
      const spawn=bestSpawn(r.map,[...r.players.values()].filter(q=>q!==p).map(q=>q.p));
      p.p=makePlayer(spawn.x,spawn.z);p.input={forward:0,strafe:0};p.lastTag=0;
    }
    emit(r,{type:'event',event:'start',message:'경기 시작!'});broadcastRoom(r);
  }
  function onJoin(s,msg){
    if(s.player)return send(s,{type:'error',message:'이미 게임방에 입장했습니다.'});
    const reqCode=String(msg.room||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,9);
    let room=reqCode?rooms.get(reqCode):null;
    if(reqCode&&!room)return send(s,{type:'error',message:'해당 게임방을 찾을 수 없습니다.'});
    if(!room){
      let newCode=code();while(rooms.has(newCode))newCode=code();
      room={code:newCode,mode:['tdm','ffa'].includes(msg.mode)?msg.mode:'ffa',map:MAPS[msg.map]?msg.map:'yard',privacy:msg.privacy==='public'?'public':'private',status:'waiting',time:ROUND_TIME,endDelay:0,colliders:[],players:new Map(),created:Date.now()};
      room.colliders=rects(room.map);rooms.set(room.code,room);
    }
    const current=[...room.players.values()].filter(p=>p.conn);
    if(current.length>=8)return send(s,{type:'error',message:'게임방이 가득 찼습니다.'});
    let player=null;
    const session=String(msg.session||'');
    if(session&&room.players.has(session))player=room.players.get(session);
    if(player&&player.conn){return send(s,{type:'error',message:'이미 접속 중인 세션입니다.'});}
    if(!player){
      const token=id(),index=room.players.size,spawn=MAPS[room.map].spawn[index%MAPS[room.map].spawn.length];
      const team=room.mode==='tdm'?index%2+1:0;
      player={id:id(),session:token,conn:s,name:safeName(msg.name),team,tool:TOOLS[msg.tool]?msg.tool:'spark',p:makePlayer(...spawn),input:{forward:0,strafe:0},lastTag:0,lastPacket:0,disconnectedAt:0};
      room.players.set(token,player);
    }else{player.conn=s;player.disconnectedAt=0;}
    s.player=player;s.room=room;
    send(s,{type:'joined',room:room.code,id:player.id,session:player.session,mode:room.mode,map:room.map,status:room.status});
    broadcastRoom(room);
    if(room.status==='waiting'&&[...room.players.values()].filter(p=>p.conn).length>=2)startRound(room);
    else send(s,snapshot(room));
  }
  function tag(r,attacker){
    if(r.status!=='playing'||attacker.p.respawn>0)return;
    const tool=TOOLS[attacker.tool];if(!tool||attacker.p.cooldown>0||attacker.p.energy<tool.energy)return;
    attacker.p.cooldown=tool.cooldown;attacker.p.energy-=tool.energy;
    const targets=[...r.players.values()].filter(p=>p!==attacker&&p.conn&&p.p.respawn<=0&&(r.mode!=='tdm'||p.team!==attacker.team));
    const possible=targets.filter(p=>canTag(attacker.p,p.p,tool,r.colliders)).sort((a,b)=>Math.hypot(a.p.x-attacker.p.x,a.p.z-attacker.p.z)-Math.hypot(b.p.x-attacker.p.x,b.p.z-attacker.p.z));
    const victim=possible[0];if(!victim)return;
    victim.p.shield-=tool.shield;
    emit(r,{type:'event',event:'tag',source:attacker.id,target:victim.id});
    if(victim.p.shield<=0){
      victim.p.shield=0;victim.p.respawn=RESPAWN_TIME;victim.p.outs++;attacker.p.score++;
      emit(r,{type:'event',event:'out',source:attacker.name,target:victim.name});
    }
  }
  function onMessage(s,msg){
    if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string')return;
    if(msg.type==='join')return onJoin(s,msg);
    const player=s.player,room=s.room;if(!player||!room)return send(s,{type:'error',message:'먼저 게임방에 입장하세요.'});
    if(msg.type==='leave'){s.close();return;}
    if(msg.type==='tool'&&TOOLS[msg.tool]){player.tool=msg.tool;return;}
    if(msg.type==='input'){
      const now=Date.now();if(now-player.lastPacket<25)return;player.lastPacket=now;
      if(isFiniteNumber(msg.yaw))player.p.yaw=normalAngle(msg.yaw);
      if(isFiniteNumber(msg.pitch))player.p.pitch=clamp(msg.pitch,-1.43,1.43);
      const i=msg.input||{};
      player.input={forward:clamp(Number(i.forward)||0,-1,1),strafe:clamp(Number(i.strafe)||0,-1,1),sprint:!!i.sprint,jump:!!i.jump,slide:!!i.slide};
      if(i.tag)tag(room,player);
    }
  }
  server.on('upgrade',(req,socket,head)=>{
    const origin=req.headers.origin||'';
    if(req.url!=='/ws'||origins.length&&!origins.includes(origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    if(sockets.size>=500){socket.destroy();return;}
    const s=upgradeWebSocket(req,socket,head);if(!s)return;
    sockets.add(s);s.onMessage=msg=>onMessage(s,msg);
    s.onClose=()=>{sockets.delete(s);if(s.player&&s.room){s.player.conn=null;s.player.disconnectedAt=Date.now();broadcastRoom(s.room);}};
  });
  let tick=0;
  const timer=setInterval(()=>{
    tick++;const dt=.05,now=Date.now();
    for(const room of [...rooms.values()]){
      for(const [session,p] of room.players){
        if(!p.conn&&p.disconnectedAt&&now-p.disconnectedAt>20000){room.players.delete(session);continue;}
        if(room.status==='playing'&&p.conn){
          if(p.p.respawn>0){p.p.respawn=Math.max(0,p.p.respawn-dt);if(!p.p.respawn){const spawn=bestSpawn(room.map,[...room.players.values()].filter(other=>other!==p).map(other=>other.p));Object.assign(p.p,makePlayer(spawn.x,spawn.z),{score:p.p.score,outs:p.p.outs});}}
          else stepPlayer(p.p,p.input,dt,room.colliders);
          p.input.jump=false;p.input.slide=false;
        }
      }
      if(room.status==='playing'){
        if([...room.players.values()].filter(p=>p.conn).length<2){room.status='waiting';broadcastRoom(room);}
        else {room.time-=dt;if(room.time<=0){room.status='ended';room.time=0;room.endDelay=8;const sorted=[...room.players.values()].sort((a,b)=>b.p.score-a.p.score);
          const teamScores=[1,2].map(t=>[...room.players.values()].filter(p=>p.team===t).reduce((n,p)=>n+p.p.score,0));
          const message=room.mode==='tdm'?`라운드 종료 · 블루 ${teamScores[0]} : 오렌지 ${teamScores[1]}`:`라운드 종료 · 1위 ${sorted[0]?.name||'-'}`;
          emit(room,{type:'event',event:'end',message});broadcastRoom(room);}}
      }else if(room.status==='ended'){
        room.endDelay-=dt;if(room.endDelay<=0){room.status='waiting';broadcastRoom(room);if([...room.players.values()].filter(p=>p.conn).length>=2)startRound(room);}
      }else if(room.status==='waiting'&&[...room.players.values()].filter(p=>p.conn).length>=2)startRound(room);
      if(tick%2===0)emit(room,snapshot(room));
      if(!room.players.size&&now-room.created>20000)rooms.delete(room.code);
    }
    if(tick%400===0){for(const s of sockets){if(now-s.lastSeen>60000)s.close();else s.ping();}}
  },50);
  timer.unref();
  const listen=()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve(server.address());});});
  const close=async()=>{clearInterval(timer);for(const s of [...sockets])s.close();await new Promise(resolve=>server.close(()=>resolve()));};
  return {server,rooms,listen,close};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const game=createGameServer({port:Number(process.env.PORT)||3001});
  game.listen().then(addr=>console.log(`BLOCKDASH multiplayer server running at ws://localhost:${addr.port}/ws`)).catch(e=>{console.error(e);process.exitCode=1;});
}
