import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {upgradeWebSocket} from './ws.js';
import {ProfileDb} from './profiles.js';
import {AIManager} from '../src/ai.js';
import {MAPS,WEAPONS,ROUND_TIME,RESPAWN_TIME,makePlayer,stepPlayer,rects,clamp,bestSpawn,revive,normalAngle,tickCombat,fireAttempt,startReload,setSlot,raycastCombat,dealDamage,offMap,rewardForMatch,MAX_PLAYERS} from '../shared/rules.js';
const code=()=>randomBytes(4).toString('hex').toUpperCase().slice(0,7),id=()=>randomBytes(8).toString('hex');
const safeName=v=>String(v||'PLAYER').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,16)||'PLAYER';
const validNumber=v=>typeof v==='number'&&Number.isFinite(v);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function readJson(req){let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(text.length>8192)throw new Error('요청이 너무 커.');}try{return JSON.parse(text||'{}');}catch{throw new Error('잘못된 요청 형식이야.');}}
export function createGameServer({port=3001,host='0.0.0.0',allowedOrigins=process.env.ALLOWED_ORIGINS||'',dataFile=process.env.BLOCKDASH_DATA_FILE||':memory:',countdownSeconds=3,roundSeconds=ROUND_TIME}={}){
 const db=new ProfileDb(dataFile),rooms=new Map(),sockets=new Set(),origins=allowedOrigins.split(',').map(x=>x.trim()).filter(Boolean);
 const send=(s,msg)=>{if(s&&!s.closed)s.send(msg);};
 const members=r=>[...r.players.values()].filter(o=>o.conn);
 const emit=(r,msg)=>{for(const o of r.players.values())send(o.conn,msg);};
 const roomList=()=>[...rooms.values()].filter(r=>r.privacy==='public'&&r.status!=='ended').map(r=>({code:r.code,mode:r.mode,map:r.map,count:members(r).length,max:r.max,status:r.status,teamSize:r.teamSize}));
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'',allowed=!origins.length||!origin||origins.includes(origin);
  if(origin&&allowed)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){res.writeHead(allowed?204:403);res.end();return;}
  if(!allowed){json(res,403,{error:'접근이 허용되지 않았어.'});return;}
  try{
   if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,rooms:rooms.size,connections:sockets.size,version:'2.1.0'});
   if(req.method==='GET'&&req.url==='/rooms')return json(res,200,roomList());
   if(req.method==='POST'&&['/api/auth/register','/api/auth/login'].includes(req.url)){
    const body=await readJson(req);const result=req.url.endsWith('register')?db.create(body.id,body.password):db.login(body.id,body.password);return json(res,200,result);
   }
   if(req.url?.startsWith('/api/')){
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const a=db.auth(token);if(!a)return json(res,401,{error:'로그인이 필요해.'});
    if(req.url==='/api/profile'&&req.method==='GET')return json(res,200,{profile:db.profile(a.user)});
    if(req.url==='/api/profile/name'&&req.method==='POST')return json(res,200,{profile:db.update(a.id,{nickname:(await readJson(req)).nickname})});
    if(req.url==='/api/profile/loadout'&&req.method==='POST'){const body=await readJson(req);return json(res,200,{profile:db.update(a.id,{primary:body.primary,secondary:body.secondary})});}
    if(req.url==='/api/draw'&&req.method==='POST')return json(res,200,db.draw(a.id,(await readJson(req)).count));
    if(req.url==='/api/practice/record'&&req.method==='POST'){const body=await readJson(req);const points=Math.max(0,Math.min(1e8,Math.floor(Number(body.score)||0)));
      a.user.profile.stats.bestPractice=Math.max(a.user.profile.stats.bestPractice,points);a.user.profile.stats.games++;db.persist();return json(res,200,{profile:db.profile(a.user)});}
   }
   return json(res,404,{error:'해당 경로를 찾을 수 없어.'});
  }catch(e){json(res,400,{error:String(e.message||e)});}
 });
 const broadcastRoom=r=>emit(r,{type:'room',code:r.code,mode:r.mode,map:r.map,status:r.status,count:members(r).length,max:r.max});
 const state=r=>({type:'state',code:r.code,mode:r.mode,map:r.map,status:r.status,time:Math.max(0,r.time),countdown:Math.max(0,r.countdown||0),players:[...r.players.values()].map(o=>({
  id:o.id,name:o.name,team:o.team,x:o.p.x,y:o.p.y,z:o.p.z,yaw:o.p.yaw,pitch:o.p.pitch,hp:o.p.hp,score:o.p.score,kills:o.p.kills,deaths:o.p.deaths,assists:o.p.assists,respawn:o.p.respawn,invuln:o.p.invuln,slide:o.p.slide,crouch:o.p.crouch,ads:o.p.ads,primary:o.p.primary,secondary:o.p.secondary,slot:o.p.slot,ammo:o.p.ammo,reload:o.p.reload
 })).concat((r.ai?.bots||[]).map(b=>({id:b.id,name:b.name,team:0,x:b.p.x,y:b.p.y,z:b.p.z,yaw:b.p.yaw,pitch:b.p.pitch,hp:b.p.hp,score:b.p.score,kills:b.p.kills,deaths:b.p.deaths,assists:b.p.assists,respawn:b.p.respawn,invuln:b.p.invuln,slide:b.p.slide,crouch:b.p.crouch,ads:b.p.ads,primary:b.p.primary,secondary:b.p.secondary,slot:b.p.slot,ammo:b.p.ammo,reload:b.p.reload}))) });
 const announce=r=>emit(r,state(r));
 function begin(r){r.status='countdown';r.countdown=countdownSeconds;r.time=roundSeconds;r.lastOutcome=null;r.elapsed=0;
  if(r.mode==='bots')r.ai=new AIManager(r.map,r.difficulty,r.botCount);
  const all=[...r.players.values()];for(let i=0;i<all.length;i++){const o=all[i],others=all.filter(x=>x!==o).map(x=>x.p),spawn=bestSpawn(r.map,others,o.team);
   o.p=makePlayer(spawn.x,spawn.z,o.primary,o.secondary);o.p.id=o.id;o.input={};o.lastFire=false;}
  broadcastRoom(r);emit(r,{type:'event',event:'countdown',message:'경기 시작'});
 }
 function onJoin(s,msg){if(s.player)return send(s,{type:'error',message:'이미 게임에 참가했어.'});
  const requested=String(msg.room||'').trim().toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,7);let r=requested?rooms.get(requested):null;
  if(requested&&!r)return send(s,{type:'error',message:'게임방을 찾을 수 없어.'});
  if(!r){let c=code();while(rooms.has(c))c=code();
   const mode=['ffa','tdm','bots'].includes(msg.mode)?msg.mode:'ffa',teamSize=clamp(Number(msg.teamSize)||2,2,4),max=mode==='tdm'?teamSize*2:mode==='bots'?1:MAX_PLAYERS;
   r={code:c,mode,map:MAPS[msg.map]?msg.map:'yard',teamSize,max,botCount:clamp(Number(msg.bots)||3,1,7),difficulty:['easy','normal','hard'].includes(msg.difficulty)?msg.difficulty:'normal',privacy:msg.privacy==='public'?'public':'private',status:'waiting',time:ROUND_TIME,countdown:0,endDelay:0,created:Date.now(),players:new Map(),colliders:rects(msg.map)};rooms.set(c,r);
  }
  const token=String(msg.session||'');let o=token?r.players.get(token):null;
  if(!o&&r.status!=='waiting'&&r.mode==='tdm')return send(s,{type:'error',message:'팀전이 진행 중이야. 다음 경기에 참가해줘.'});
  if(!o&&r.status==='ended')return send(s,{type:'error',message:'결과 정산 중인 방이야.'});
  if(o?.conn)return send(s,{type:'error',message:'이미 접속한 세션이야.'});
  if(!o&&r.players.size>=r.max)return send(s,{type:'error',message:'게임방이 가득 찼어.'});
  const authenticated=db.auth(String(msg.authToken||''));
  if(msg.authToken&&!authenticated)return send(s,{type:'error',message:'로그인이 만료됐어. 다시 로그인해줘.'});
  if(!o){const session=id(),identity=id(),index=r.players.size,team=r.mode==='tdm'?(index%2)+1:0;
   const profile=authenticated?.user.profile;
   const primary=profile?.primary||(WEAPONS[msg.primary]?.kind!=='HG'&&WEAPONS[msg.primary]?msg.primary:'M416');
   const secondary=profile?.secondary||(WEAPONS[msg.secondary]?.kind==='HG'?msg.secondary:'P92');
   const spawn=MAPS[r.map].spawn[index%8];const p=makePlayer(...spawn,primary,secondary);p.id=identity;
   o={id:identity,session,conn:s,name:profile?.nickname||safeName(msg.name),team,primary,secondary,account:authenticated?.id||null,p,input:{},lastFire:false,lastPacket:0,disconnectedAt:0};r.players.set(session,o);
  }else{o.conn=s;o.disconnectedAt=0;}
  s.player=o;s.room=r;
  send(s,{type:'joined',room:r.code,id:o.id,session:o.session,mode:r.mode,map:r.map,status:r.status,max:r.max});broadcastRoom(r);
  if(r.status==='waiting'&&members(r).length>=(r.mode==='tdm'?r.max:r.mode==='bots'?1:2))begin(r);else send(s,state(r));
 }
 function shot(r,o){const p=o.p,attempt=fireAttempt(p);if(!attempt.ok)return;
  const enemy=[...r.players.values()].filter(t=>t!==o&&t.conn&&t.p.respawn<=0&&(r.mode!=='tdm'||t.team!==o.team));
  const aiEnemies=r.ai?.bots||[];
  const ray=raycastCombat(p,[...enemy.map(e=>e.p),...aiEnemies.map(b=>b.p)],attempt.weapon,r.colliders);
  const all=[...r.players.values()].map(x=>x.p).concat(aiEnemies.map(b=>b.p));
  for(const [target,damage] of ray.hits){const outcome=dealDamage(target,p,damage,all,Date.now()/1000);const other=enemy.find(e=>e.p===target)||aiEnemies.find(b=>b.p===target);
   if(outcome.applied>0)emit(r,{type:'event',event:'hit',source:o.id,target:other?.id,damage:Math.round(outcome.applied)});
   if(outcome.killed)emit(r,{type:'event',event:'kill',source:o.id,target:other?.id,sourceName:o.name,targetName:other?.name,assists:outcome.assisting.map(x=>x.id)});
  }
  emit(r,{type:'event',event:'shot',source:o.id,weapon:attempt.weapon.key});
 }
 function end(r){r.status='ended';r.time=0;r.endDelay=15;
  const entries=[...r.players.values()],ordered=[...entries].sort((a,b)=>b.p.score-a.p.score||b.p.kills-a.p.kills||a.p.deaths-b.p.deaths);
  const teamScore=[1,2].map(t=>entries.filter(o=>o.team===t).reduce((n,o)=>n+o.p.score,0));
  const teamKills=[1,2].map(t=>entries.filter(o=>o.team===t).reduce((n,o)=>n+o.p.kills,0));
  const winnerTeam=teamScore[0]===teamScore[1]?(teamKills[0]===teamKills[1]?0:(teamKills[0]>teamKills[1]?1:2)):(teamScore[0]>teamScore[1]?1:2);
  for(const o of entries){const top=ordered[0],rival=r.mode==='bots'?[...r.ai.bots.map(b=>b.p)].sort((a,b)=>b.score-a.score||b.kills-a.kills||a.deaths-b.deaths)[0]:null;
   const win=r.mode==='tdm'?winnerTeam!==0&&winnerTeam===o.team:r.mode==='bots'?(o.p.score>(rival?.score||0)||o.p.score===(rival?.score||0)&&o.p.kills>(rival?.kills||0)):o.p.score===top.p.score&&o.p.kills===top.p.kills&&o.p.deaths===top.p.deaths;
   const reward=o.conn?(o.account?db.award(o.account,r.mode,o.p,win):rewardForMatch(o.p.kills,win,r.mode)):0;
   send(o.conn,{type:'event',event:'end',message:'경기 종료',outcome:{win,score:o.p.score,kills:o.p.kills,deaths:o.p.deaths,assists:o.p.assists,reward,teamScore}});
  }
  broadcastRoom(r);
 }
 function onMessage(s,msg){if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string')return;
  if(msg.type==='join')return onJoin(s,msg);const o=s.player,r=s.room;if(!o||!r)return send(s,{type:'error',message:'먼저 방에 입장해줘.'});
  if(msg.type==='leave'){s.close();return;}
  if(msg.type==='fire'&&r.status==='playing'){if(validNumber(msg.yaw))o.p.yaw=normalAngle(msg.yaw);if(validNumber(msg.pitch))o.p.pitch=clamp(msg.pitch,-1.43,1.43);
    const w=WEAPONS[o.p.slot===1?o.p.secondary:o.p.primary];if(w&&(w.auto||!o.lastFire))shot(r,o);o.lastFire=true;return;}
  if(msg.type==='loadout'&&o.p.respawn>0){const primary=String(msg.primary||''),secondary=String(msg.secondary||'');const user=o.account?db.users[o.account]?.profile:null;
   if(WEAPONS[primary]?.kind!=='HG'&&WEAPONS[secondary]?.kind==='HG'&&(!user||(user.owned.includes(primary)&&user.owned.includes(secondary)))){o.primary=primary;o.secondary=secondary;o.p.primary=primary;o.p.secondary=secondary;o.p.ammo={[primary]:WEAPONS[primary].mag,[secondary]:WEAPONS[secondary].mag};o.p.slot=0;o.p.reload=0;o.p.reloadWeapon=null;}return;}
  if(msg.type==='input'){
   const now=Date.now();if(now-o.lastPacket<24)return;o.lastPacket=now;
   const p=o.p;if(validNumber(msg.yaw))p.yaw=normalAngle(msg.yaw);if(validNumber(msg.pitch))p.pitch=clamp(msg.pitch,-1.43,1.43);
   const i=msg.input||{},slot=Number(i.slot);if(slot===0||slot===1)setSlot(p,slot);
   o.input={forward:clamp(Number(i.forward)||0,-1,1),strafe:clamp(Number(i.strafe)||0,-1,1),sprint:!!i.sprint,crouch:!!i.crouch,ads:!!i.ads,jump:!!i.jump,slide:!!i.slide,fire:!!i.fire};
   if(i.reload)startReload(p);
  }
 }
 server.on('upgrade',(req,socket,head)=>{const origin=req.headers.origin||'';
  if(req.url!=='/ws'||origins.length&&!origins.includes(origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  if(sockets.size>=500){socket.destroy();return;}
  const s=upgradeWebSocket(req,socket,head);if(!s)return;sockets.add(s);s.onMessage=msg=>onMessage(s,msg);
  s.onClose=()=>{sockets.delete(s);if(s.player&&s.room){s.player.conn=null;s.player.disconnectedAt=Date.now();broadcastRoom(s.room);}};
 });
 let tick=0;const timer=setInterval(()=>{tick++;const dt=1/60,now=Date.now();
  for(const r of [...rooms.values()]){
   for(const [session,o] of r.players){if(!o.conn&&o.disconnectedAt&&now-o.disconnectedAt>20000){r.players.delete(session);continue;}
    const p=o.p;if(r.status==='playing'&&o.conn){
     if(p.respawn>0){p.respawn=Math.max(0,p.respawn-dt);if(p.respawn===0){const spawn=bestSpawn(r.map,[...r.players.values()].filter(x=>x!==o).map(x=>x.p),o.team);revive(p,spawn.x,spawn.z);p.id=o.id;}}
     else{stepPlayer(p,o.input,dt,r.colliders,r.map);tickCombat(p,dt);
      if(offMap(p,r.map)){p.respawn=RESPAWN_TIME;p.deaths++;p.streak=0;emit(r,{type:'event',event:'fall',source:o.id});}
      else{
       const w=WEAPONS[p.slot===1?p.secondary:p.primary];
       if(o.input.fire&&(w.auto||!o.lastFire))shot(r,o);
      }
     }
     if(!o.input.fire)o.lastFire=false;else o.lastFire=true;
     o.input.jump=false;o.input.slide=false;
    }
   }
   if(r.status==='countdown'){r.countdown-=dt;if(r.countdown<=0){r.status='playing';r.countdown=0;emit(r,{type:'event',event:'start',message:'시작!'});broadcastRoom(r);}}
   else if(r.status==='playing'){
    if(members(r).length<(r.mode==='tdm'?r.max:r.mode==='bots'?1:2)){r.status='waiting';broadcastRoom(r);}
    else{r.elapsed=(r.elapsed||0)+dt;if(r.ai){const own=members(r)[0]?.p;if(own){r.ai.update(dt,own,r.elapsed,e=>{if(e.type==='kill')emit(r,{type:'event',event:'kill',source:e.source,target:r.players.values().next().value?.id,sourceName:e.source,targetName:e.target});});}}
     r.time-=dt;if(r.time<=0)end(r);}
   }else if(r.status==='ended'){r.endDelay-=dt;if(r.endDelay<=0){r.status='waiting';broadcastRoom(r);if(members(r).length>=(r.mode==='tdm'?r.max:r.mode==='bots'?1:2))begin(r);}}
   else if(r.status==='waiting'&&members(r).length>=(r.mode==='tdm'?r.max:r.mode==='bots'?1:2))begin(r);
   if(tick%6===0)announce(r);
   if(!r.players.size&&now-r.created>20000)rooms.delete(r.code);
  }
  if(tick%1200===0)for(const s of sockets){if(now-s.lastSeen>60000)s.close();else s.ping();}
 },1000/60);timer.unref();
 const listen=()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve(server.address());});});
 const close=async()=>{clearInterval(timer);for(const s of [...sockets])s.close();await new Promise(resolve=>server.close(()=>resolve()));};
 return {server,rooms,db,listen,close};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const game=createGameServer({port:Number(process.env.PORT)||3001,dataFile:process.env.BLOCKDASH_DATA_FILE||'./server/data/profiles.json'});
 game.listen().then(a=>console.log(`BLOCKDASH v2.1 server: http://localhost:${a.port}/health`)).catch(e=>{console.error(e);process.exitCode=1;});
}
