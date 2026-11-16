import {World} from './world.js';
import {Controls} from './controls.js';
import {AIManager} from './ai.js';
import {Network} from './network.js';
import {MAPS,TOOLS,PARKOUR,ROUND_TIME,makePlayer,stepPlayer,clamp,bestSpawn,GAME_VERSION} from '../shared/rules.js';

const $=id=>document.getElementById(id), modeNames={practice:'연습장',bots:'AI 대전',ffa:'개인전',tdm:'팀전',parkour:'파쿠르'};
const toolKeys=Object.keys(TOOLS), safeRead=(key,def)=>{try{return JSON.parse(localStorage.getItem(key))??def;}catch{return def;}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const settings=Object.assign({mouseSensitivity:1,touchSensitivity:1,fov:80,quality:'medium',sound:true},safeRead('blockdash_settings_v1',{}));
const stats=Object.assign({games:0,wins:0,outs:0,bestPractice:0,bestParkour:0,botWins:0},safeRead('blockdash_stats_v1',{}));
const options={mode:'practice',map:'yard',tool:'spark',difficulty:'normal',bots:3,name:safeRead('blockdash_name','PLAYER'),server:safeRead('blockdash_server','')};
let world,controls,network,ai,player=makePlayer(0,21),state='lobby',timeLeft=ROUND_TIME,elapsed=0,feedUntil=0,score=0,parkourIndex=0,tagHeld=false;
let tagCooldown=0,remote=new Map(),snapshot=null,roomCode='',onlinePending=false,lastFrame=performance.now(),sendTimer=0,renderTime=0,soundCtx=null,roundRecorded=false;
let lastInput={forward:0,strafe:0},myId='';

function showError(message){const banner=$('error');banner.textContent=message;banner.hidden=false;console.error('BLOCKDASH:',message);}
window.addEventListener('error',e=>{if(e.message)showError(`게임 오류: ${e.message}`);});
window.addEventListener('unhandledrejection',e=>{showError(`연결 또는 실행 오류: ${String(e.reason?.message||e.reason)}`);});
function banner(msg){$('lobby-message').textContent=msg;}
function feed(msg,duration=1.5){const el=$('feed');el.textContent=msg;el.classList.add('show');feedUntil=renderTime+duration;}
function beep(type='tag'){
  if(!settings.sound)return;
  try{soundCtx??=new (window.AudioContext||window.webkitAudioContext)();if(soundCtx.state==='suspended')soundCtx.resume();const osc=soundCtx.createOscillator(),gain=soundCtx.createGain();
    osc.type=type==='out'?'triangle':'sine';osc.frequency.setValueAtTime(type==='out'?320:type==='hit'?620:440,soundCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(type==='out'?160:type==='hit'?1000:260,soundCtx.currentTime+.10);
    gain.gain.setValueAtTime(.045,soundCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,soundCtx.currentTime+.12);
    osc.connect(gain);gain.connect(soundCtx.destination);osc.start();osc.stop(soundCtx.currentTime+.13);
  }catch{}
}
function saveSettings(){
  settings.mouseSensitivity=Number($('mouse-sensitivity').value);settings.touchSensitivity=Number($('touch-sensitivity').value);settings.fov=Number($('fov').value);settings.quality=$('quality').value;settings.sound=$('sound-toggle').checked;
  safeWrite('blockdash_settings_v1',settings);world?.setQuality(settings.quality);world?.setFov(settings.fov);
}
function updateStats(){
  $('stats-content').innerHTML=`<div class="stat-grid">${[
    ['총 경기',stats.games],['AI 대전 승리',stats.botWins],['태그 아웃',stats.outs],['연습장 최고 점수',stats.bestPractice],['파쿠르 최고 기록',stats.bestParkour?stats.bestParkour.toFixed(1)+'초':'-'],['개인전 기록','온라인 서버 미연결']
  ].map(([name,val])=>`<div><strong>${String(val)}</strong><span>${name}</span></div>`).join('')}</div>`;
}
function updateForm(){
  const online=options.mode==='ffa'||options.mode==='tdm';$('network-options').hidden=!online;$('ai-options').hidden=options.mode!=='bots';
  $('play-button').textContent=state==='paused'?'▶ 계속 플레이':online?'◈ 게임방 입장':'▶ 게임 시작';
  $('lobby-notice').textContent=online?'별도 서버 연결 필요':'싱글플레이는 서버 없이 실행';
  for(const btn of document.querySelectorAll('[data-mode]'))btn.classList.toggle('selected',btn.dataset.mode===options.mode);
}
function initUI(){
  $('nickname').value=options.name;$('server-url').value=options.server;
  for(const [id,value] of [['mouse-sensitivity',settings.mouseSensitivity],['touch-sensitivity',settings.touchSensitivity],['fov',settings.fov],['quality',settings.quality]])$(id).value=value;
  $('sound-toggle').checked=settings.sound;
  for(const input of ['mouse-sensitivity','touch-sensitivity','fov','quality','sound-toggle'])$(input).addEventListener('change',saveSettings);
  for(const button of document.querySelectorAll('.mode-card'))button.addEventListener('click',()=>{options.mode=button.dataset.mode;state='lobby';updateForm();});
  $('map-select').addEventListener('change',e=>options.map=e.target.value);
  $('tool-select').addEventListener('change',e=>options.tool=e.target.value);
  $('difficulty-select').addEventListener('change',e=>options.difficulty=e.target.value);
  $('bot-count').addEventListener('change',e=>options.bots=Number(e.target.value));
  $('nickname').addEventListener('change',e=>{options.name=e.target.value.trim().slice(0,16)||'PLAYER';safeWrite('blockdash_name',options.name);});
  $('server-url').addEventListener('change',e=>{options.server=e.target.value.trim();safeWrite('blockdash_server',options.server);});
  $('play-button').addEventListener('click',onPlay);
  $('scoreboard-button').addEventListener('click',()=>showBoard($('match-board').hidden));
  $('copy-room').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roomCode);feed('방 코드 복사됨',1);}catch{feed('방 코드: '+roomCode,2);}});
  $('pause-button').addEventListener('click',pause);
  $('settings-toggle').addEventListener('click',()=>{$('settings-modal').hidden=false;});
  $('stats-toggle').addEventListener('click',()=>{updateStats();$('stats-modal').hidden=false;});
  for(const btn of document.querySelectorAll('[data-close]'))btn.addEventListener('click',()=>{$(btn.dataset.close).hidden=true;});
  for(const modal of document.querySelectorAll('.modal-backdrop'))modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true;});
  updateForm();
}
function setTool(tool){
  if(!TOOLS[tool])return;options.tool=tool;$('tool-select').value=tool;
  if(network?.connected)network.send({type:'tool',tool});
  $('tool-name').textContent=TOOLS[tool].name;
  feed(`${TOOLS[tool].name} 선택`,.9);
}
function cycleTool(){setTool(toolKeys[(toolKeys.indexOf(options.tool)+1)%toolKeys.length]);}
function beginGame(online=false,joined=null){
  state='playing';roundRecorded=false;timeLeft=online?ROUND_TIME:options.mode==='practice'?90:ROUND_TIME;elapsed=0;score=0;parkourIndex=0;tagCooldown=0;sendTimer=0;renderTime=0;
  if(online&&joined){options.map=joined.map;options.mode=joined.mode;roomCode=joined.room;myId=joined.id;}
  const map=MAPS[options.map];const spawn=map.spawn[0];player=makePlayer(spawn[0],spawn[1]);player.yaw=0;player.pitch=0;
  world.build(options.map,options.mode);world.setFov(settings.fov);
  ai=options.mode==='bots'?new AIManager(options.map,options.difficulty,options.bots):null;
  remote.clear();snapshot=null;
  if(ai){for(const bot of ai.bots)world.makeAvatar(bot.id,bot.name,bot.color);}
  $('hud').hidden=false;$('overlay').hidden=true;$('match-board').hidden=true;$('copy-room').hidden=!online;$('hud-mode').textContent=modeNames[options.mode];$('hud-map').textContent=map.name+(roomCode?` · ROOM ${roomCode}`:'');
  $('tool-name').textContent=TOOLS[options.tool].name;
  controls.start();
  if(options.mode==='parkour'){world.updateGates(0);feed('게이트 1부터 차례로 통과하세요!',3);}
  else if(online)feed(`방 코드 ${roomCode} · 플레이어를 기다립니다`,3);
  else feed('달리기 + 점프 + 슬라이드로 시작!',2.3);
}
function resume(){state='playing';$('overlay').hidden=true;controls.start();banner('');}
async function onPlay(){
  if(onlinePending)return;
  if(state==='paused')return resume();
  options.name=$('nickname').value.trim().slice(0,16)||'PLAYER';safeWrite('blockdash_name',options.name);
  if(options.mode==='ffa'||options.mode==='tdm'){
    let address=$('server-url').value.trim();
    if(!address){banner('멀티플레이에는 게임 서버 주소가 필요합니다. README의 서버 배포 단계를 참고하세요. 싱글플레이는 지금 바로 실행할 수 있습니다.');return;}
    if(!address.endsWith('/ws'))address=address.replace(/\/$/,'')+'/ws';
    safeWrite('blockdash_server',address);options.server=address;
    const code=$('room-code').value.trim(),privacy=$('room-privacy').value;
    onlinePending=true;$('play-button').disabled=true;banner('서버 연결 중…');
    try{
      if(!code&&privacy==='public'){
        try{const url=address.replace(/^ws/,'http').replace(/\/ws$/,'/rooms');const response=await fetch(url,{signal:AbortSignal.timeout(3500)});
          if(response.ok){const list=await response.json(),found=list.find(r=>r.mode===options.mode&&r.map===options.map&&r.count<8);
            if(found)$('room-code').value=found.code;}
        }catch{}
      }
      network?.close();network=new Network();
      const joined=await network.connect(address,{name:options.name,mode:options.mode,map:options.map,tool:options.tool,room:$('room-code').value.trim().toUpperCase(),privacy},
        {onState:onSnapshot,onEvent:onServerEvent,onRoom:onRoom,onClose:onDisconnect,onError:banner});
      beginGame(true,joined);
    }catch(error){banner(`연결 실패: ${error.message}`);network?.close();network=null;}
    finally{onlinePending=false;$('play-button').disabled=false;}
    return;
  }
  network?.close();network=null;roomCode='';beginGame();
}
function onRoom(r){if(!r||state!=='playing')return;const text=r.status==='waiting'?`ROOM ${r.code} · 다른 플레이어 대기 중 (${r.count}/8)`:`ROOM ${r.code} · ${r.count}/8`;
  $('hud-map').textContent=MAPS[options.map].name+' · '+text;
}
function onServerEvent(e){if(e.event==='tag'){beep('hit');if(e.source===myId)feed('TAG!',.9);}
  else if(e.event==='out'){feed(`${e.source} → ${e.target}`,2);beep('out');}
  else if(e.event==='start')feed(e.message,2);
  else if(e.event==='end'){feed(e.message,5);finishRound(e.message);}
}
function onDisconnect(){if(state==='playing'||state==='paused'){state='lobby';controls.stop();$('hud').hidden=true;$('overlay').hidden=false;banner('게임 서버 연결이 종료됐습니다. 게임방 코드로 재접속할 수 있습니다.');updateForm();}}
function onSnapshot(data){snapshot=data;
  if(state!=='playing')return;
  const ids=new Set();for(const p of data.players){if(p.id===myId)continue;ids.add(p.id);
    if(!remote.has(p.id)){world.makeAvatar(p.id,p.name,p.team===1?'#6ed8f7':p.team===2?'#fa9d81':'#d3a3fc',p.team);remote.set(p.id,p);}
    remote.set(p.id,p);
  }
  for(const id of remote.keys())if(!ids.has(id)){remote.delete(id);world.removeAvatar(id);}
  const own=data.players.find(p=>p.id===myId);
  if(own){
    player.shield=own.shield;player.energy=own.energy;player.score=own.score;player.outs=own.outs;player.respawn=own.respawn;
    const error=Math.hypot(player.x-own.x,player.z-own.z);
    if(error>2.5){player.x=own.x;player.z=own.z;player.y=own.y;}
    else if(error>.22){player.x+=(own.x-player.x)*.22;player.z+=(own.z-player.z)*.22;player.y+=(own.y-player.y)*.22;}
  }
  timeLeft=data.time;
}
function showBoard(show){if(state!=='playing')return;const el=$('match-board');el.hidden=!show;if(show)updateBoard();}
function updateBoard(){
  const list=$('board-list');list.replaceChildren();
  let entries=[];
  if(network?.connected&&snapshot){entries=snapshot.players.map(p=>({name:p.name,id:p.id,score:p.score,team:p.team}));}
  else{entries=[{name:options.name,id:'self',score:player.score,team:0},...(ai?.bots||[]).map(b=>({name:b.name,id:b.id,score:b.p.score,team:0}))];}
  entries.sort((a,b)=>b.score-a.score);
  entries.forEach((entry,i)=>{const row=document.createElement('div');row.className='board-row'+((entry.id===myId||entry.id==='self')?' mine':'');
    const text=document.createElement('span');text.textContent=`${i+1}. ${entry.team===1?'🔹 ':entry.team===2?'🔸 ':''}${entry.name}`;
    const value=document.createElement('b');value.textContent=String(entry.score);row.append(text,value);list.append(row);
  });
}
function pause(){
  if(state!=='playing')return;
  state='paused';controls.stop();$('overlay').hidden=false;$('match-board').hidden=true;banner(network?.connected?'온라인 경기는 계속 진행 중입니다. 돌아가려면 계속 플레이를 누르세요.':'일시정지 · 계속 플레이를 누르면 이어서 진행됩니다.');updateForm();
  if(network?.connected)network.send({type:'input',yaw:player.yaw,pitch:player.pitch,input:{forward:0,strafe:0}});
}
function finishRound(reason='라운드 종료'){
  if(state!=='playing'&&state!=='paused')return;
  state='finished';controls.stop();$('hud').hidden=true;$('match-board').hidden=true;$('overlay').hidden=false;
  if(!roundRecorded){roundRecorded=true;stats.games++;
    if(options.mode==='practice')stats.bestPractice=Math.max(stats.bestPractice,player.score);
    if(options.mode==='parkour'&&parkourIndex>=PARKOUR.length)stats.bestParkour=stats.bestParkour?Math.min(stats.bestParkour,elapsed):elapsed;
    if(options.mode==='bots'){stats.outs+=player.score;const botsBest=Math.max(0,...(ai?.bots||[]).map(b=>b.p.score));if(player.score>botsBest)stats.botWins++;}
    safeWrite('blockdash_stats_v1',stats);
  }
  banner(`${reason} · 내 점수 ${player.score}점 · 다시 시작하려면 게임 시작을 누르세요.`);
  if(network){network.close();network=null;roomCode='';}
  updateForm();
}
function tag(){
  if(state!=='playing'||player.respawn>0)return;
  const tool=TOOLS[options.tool];if(tagCooldown>0||player.energy<tool.energy)return;
  tagCooldown=tool.cooldown;player.energy-=tool.energy;beep();
  if(network?.connected)return; // online tag requests are submitted to authoritative server each input update
  const hit=world.tagRay();world.burst(hit.point,tool.color);
  if(hit.type==='target'&&options.mode==='practice'){
    player.score+=10;world.moveTarget(hit.target);feed('+10 · PERFECT TAG',1);beep('hit');
  }else if(hit.type==='avatar'&&options.mode==='bots'){
    const bot=ai.bots.find(b=>b.id===hit.avatar.id);
    if(bot&&bot.p.respawn<=0){const result=ai.tagBot(bot,tool.shield,player);if(result==='out'){feed(`+1 · ${bot.name} TAG OUT`,1.6);beep('out');}else if(result)feed('TAG!',.7);}
  }
}
function updateParkour(){
  const p=PARKOUR[parkourIndex];if(!p)return;
  if(Math.hypot(player.x-p.x,player.y+1.1-p.y,player.z-p.z)<2.7){parkourIndex++;world.updateGates(parkourIndex);feed(`CHECKPOINT ${parkourIndex} / ${PARKOUR.length}`,1);beep('hit');
    if(parkourIndex>=PARKOUR.length){finishRound(`완주 성공! ${elapsed.toFixed(2)}초`);}}
}
function localGame(dt){
  if(options.mode==='bots'&&ai){
    ai.update(dt,player,()=>{},(bot,damage)=>{
      if(player.respawn>0)return;player.shield=Math.max(0,player.shield-damage);
      if(player.shield<=0){player.respawn=3;player.outs++;bot.p.score++;feed(`${bot.name}에게 TAG OUT · 3초 후 재등장`,2);beep('out');}
    });
    for(const bot of ai.bots)world.setAvatar(bot.id,bot.p,1);
  }
  if(player.respawn>0){player.respawn=Math.max(0,player.respawn-dt);if(player.respawn===0){const spawn=bestSpawn(options.map,(ai?.bots||[]).map(v=>v.p));player=Object.assign(makePlayer(spawn.x,spawn.z),{score:player.score,outs:player.outs});}}
  else if(options.mode==='parkour')updateParkour();
  elapsed+=dt;if(options.mode!=='parkour'){timeLeft=Math.max(0,timeLeft-dt);if(timeLeft<=0)finishRound('시간 종료');}
}
function updateHUD(){
  const time=options.mode==='parkour'?elapsed:timeLeft;
  $('hud-time').textContent=`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;
  $('hud-score').textContent=options.mode==='parkour'?`${parkourIndex}/${PARKOUR.length}`:String(player.score);
  if(options.mode==='tdm'&&snapshot?.players){const b=snapshot.players.filter(p=>p.team===1).reduce((n,p)=>n+p.score,0),o=snapshot.players.filter(p=>p.team===2).reduce((n,p)=>n+p.score,0);$('hud-mode').textContent=`블루 ${b} : ${o} 오렌지`;}else $('hud-mode').textContent=modeNames[options.mode];
  $('shield-label').textContent=String(Math.ceil(player.shield));$('energy-label').textContent=String(Math.floor(player.energy));
  $('shield-bar').style.width=`${clamp(player.shield,0,100)}%`; $('energy-bar').style.width=`${clamp(player.energy,0,100)}%`;
  $('life-status').textContent=player.respawn>0?`재등장 ${player.respawn.toFixed(1)}초`:'보호막';
  $('hud-speed').textContent=`${Math.hypot(player.vx,player.vz).toFixed(1)} m/s`;
  $('tool-name').textContent=TOOLS[options.tool].name;
}
function tick(dt){
  if(state!=='playing')return;
  const look=controls.takeLook();player.yaw+=look.x;player.pitch=clamp(player.pitch+look.y,-1.43,1.43);
  const input=controls.input();lastInput=input;
  if(input.change)cycleTool();
  if(network?.connected){
    if(player.respawn<=0&&snapshot?.status==='playing')stepPlayer(player,input,dt,world.colliders);
    sendTimer+=dt;
    if(sendTimer>=.055){sendTimer=0;
      network.send({type:'input',yaw:player.yaw,pitch:player.pitch,input:{forward:input.forward,strafe:input.strafe,sprint:input.sprint,jump:input.jump,slide:input.slide,tag:input.tag}});
    }
    for(const [id,data] of remote)world.setAvatar(id,data,1-Math.exp(-dt*10));
    if(snapshot&&snapshot.status==='waiting')timeLeft=ROUND_TIME;
  }else{
    if(player.respawn<=0)stepPlayer(player,input,dt,world.colliders);
    localGame(dt);
  }
  tagCooldown=Math.max(0,tagCooldown-dt);
  if(input.tag&&(!network?.connected||snapshot?.status==='playing'))tag();
  world.setCamera(player);updateHUD();if(!$('match-board').hidden)updateBoard();
}
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.032,Math.max(0,(now-lastFrame)/1000));lastFrame=now;renderTime+=dt;
  if(state==='playing'){const steps=Math.max(1,Math.ceil(dt/.017));for(let i=0;i<steps;i++)tick(dt/steps);}
  if(feedUntil<renderTime)$('feed').classList.remove('show');
  world?.update(dt,now/1000);
}
function bootstrap(){
  initUI();
  try{world=new World($('game'),settings.quality);world.build('yard','practice');world.setFov(settings.fov);
    controls=new Controls($('game'),settings);
    controls.onPause=pause;controls.onScoreboard=showBoard;controls.onTag=()=>{if(state==='playing'&&!network?.connected)tag();};
    controls.onSelectTool=index=>setTool(toolKeys[index]);
    world.setCamera(player);requestAnimationFrame(frame);
  }catch(e){showError('3D 게임 초기화에 실패했습니다. WebGL 지원과 브라우저 업데이트를 확인하세요. '+e.message);}
}
bootstrap();
