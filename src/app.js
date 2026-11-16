import {World} from './world.js';
import {Controls} from './controls.js';
import {AIManager} from './ai.js';
import {Network} from './network.js';
import {ProfileStore} from './profile.js';
import {Cinematic} from './cinematic.js';
import {MAPS,MODES,WEAPONS,RARITIES,ROUND_TIME,HEALTH,RESPAWN_TIME,makePlayer,revive,bestSpawn,stepPlayer,tickCombat,clamp,offMap,fireAttempt,startReload,setSlot,setLoadout,equipped,raycastCombat,dealDamage} from '../shared/rules.js';
const $=id=>document.getElementById(id);
const read=(key,backup)=>{try{return JSON.parse(localStorage.getItem(key))??backup;}catch{return backup;}};
const write=(key,val)=>{try{localStorage.setItem(key,JSON.stringify(val));}catch{}};
const settings=Object.assign({mouseSensitivity:1,touchSensitivity:1,fov:90,quality:'medium',fpsCap:60,shake:.5,sound:true},read('blockdash_settings_v2',{}));
const profile=new ProfileStore();const options={mode:'practice',map:'yard',difficulty:'normal',bots:3,server:read('blockdash_server_v2',''),teamSize:2};
const cinematic=new Cinematic(settings);
let world=null,controls=null,ai=null,network=null,player=makePlayer(0,32),state='lobby',snapshot=null,remote=new Map();
let timeLeft=ROUND_TIME,countdown=0,onlineId='',roomCode='',lastFrame=performance.now(),lastRender=0,sendTimer=0,fireLatched=false,clock=0,hitUntil=0,hurtUntil=0,noticeUntil=0,feedItems=[],scoreboardVisible=false,roundRecorded=false,scope=1,previousRespawn=0,gameStarted=false,pausedOnline=false,recoilDebt=0,recoilWait=0;
let soundCtx=null;
const safeText=(id,text)=>{$(id).textContent=String(text);};
function error(message){$('error').hidden=false;safeText('error',message);console.error('BLOCKDASH:',message);}
window.addEventListener('error',e=>{if(e.message)error(`오류: ${e.message}`);});
window.addEventListener('unhandledrejection',e=>{error(`오류: ${String(e.reason?.message||e.reason)}`);});
function message(text){safeText('lobby-message',text);}
function chirp(type='click'){
 if(!settings.sound)return;try{soundCtx??=new (window.AudioContext||window.webkitAudioContext)();if(soundCtx.state==='suspended')soundCtx.resume();
  const osc=soundCtx.createOscillator(),gain=soundCtx.createGain(),t=soundCtx.currentTime;
  osc.type=type==='victory'?'triangle':type==='shot'?'sawtooth':'sine';
  const tones={shot:[240,75,.08,.014],hit:[700,870,.1,.028],kill:[350,620,.15,.033],hurt:[130,80,.16,.03],reload:[400,290,.13,.009],victory:[330,520,.5,.024],click:[450,540,.1,.012],countdown:[550,440,.12,.018]};
  const [a,b,d,v]=tones[type]||tones.click;osc.frequency.setValueAtTime(a,t);osc.frequency.exponentialRampToValueAtTime(Math.max(1,b),t+d);
  gain.gain.setValueAtTime(v,t);gain.gain.exponentialRampToValueAtTime(.001,t+d);osc.connect(gain);gain.connect(soundCtx.destination);osc.start(t);osc.stop(t+d+.02);
 }catch{}
}
function notice(text,duration=1){safeText('notice',text);noticeUntil=clock+duration;}
function feed(text){feedItems.unshift({text:String(text),until:clock+3});feedItems=feedItems.slice(0,5);renderFeed();}
function renderFeed(){const container=$('feed');container.replaceChildren();for(const item of feedItems){const div=document.createElement('div');div.className='feed-entry';div.textContent=item.text;container.append(div);}}
function marker(){hitUntil=clock+.17;$('hitmarker').classList.add('show');chirp('hit');}
function hurt(){hurtUntil=clock+.26;$('hurt').classList.add('show');chirp('hurt');}
function closeModal(id){$(id).hidden=true;}
function openModal(id){$(id).hidden=false;}
function optionsRefresh(){
 const online=['ffa','tdm'].includes(options.mode);$('online-fields').hidden=!online;$('team-size-row').hidden=options.mode!=='tdm';$('ai-row').hidden=options.mode!=='bots';
 for(const el of document.querySelectorAll('.mode-card'))el.classList.toggle('selected',el.dataset.mode===options.mode);
}
function weaponOptions(selectId,kind,selected){const el=$(selectId);el.replaceChildren();for(const key of profile.data.owned){const w=WEAPONS[key];if(!w||(kind==='primary'&&w.kind==='HG')||(kind==='secondary'&&w.kind!=='HG'))continue;
 const option=document.createElement('option');option.value=key;option.textContent=`${key} · ${RARITIES[w.rarity].name}`;el.append(option);}
 if([...el.options].some(o=>o.value===selected))el.value=selected;
}
function refreshProfile(){safeText('bdc-balance',profile.bdc.toLocaleString('ko-KR'));safeText('shop-balance',profile.bdc.toLocaleString('ko-KR'));
 $('account-status').textContent=profile.remote?'계정 연결됨':'게스트';$('nickname').value=profile.nickname;
 weaponOptions('primary-select','primary',profile.data.primary);weaponOptions('secondary-select','secondary',profile.data.secondary);
 $('logout-button').hidden=!profile.remote;
}
function renderInventory(){const root=$('inventory-list');root.replaceChildren();for(const w of Object.values(WEAPONS)){
 const owned=profile.data.owned.includes(w.key),active=[profile.data.primary,profile.data.secondary].includes(w.key);
 const card=document.createElement('button');card.className='inventory-card'+(owned?'':' locked')+(active?' active':'');card.style.borderTopColor=RARITIES[w.rarity].color;card.disabled=!owned;
 const type=document.createElement('span');type.textContent=`${w.kind} · ${RARITIES[w.rarity].name}`;const name=document.createElement('strong');name.textContent=w.name;const stat=document.createElement('span');stat.textContent=active?'장착 중':owned?'장착하기':'미보유';card.append(type,name,stat);
 if(owned)card.onclick=async()=>{try{await profile.setLoadout(w.kind==='HG'?profile.data.primary:w.key,w.kind==='HG'?w.key:profile.data.secondary);refreshProfile();renderInventory();chirp();}catch(e){message(e.message);}};
 root.append(card);
 }}
function renderStats(){const s=profile.data.stats;const root=$('stats-content');root.replaceChildren();const div=document.createElement('div');div.className='stat-grid';for(const [key,value] of [['총 경기',s.games],['승리',s.wins],['처치',s.kills],['데스',s.deaths],['어시스트',s.assists],['연습 최고점',s.bestPractice]]){
 const card=document.createElement('div');card.className='stat-item';const name=document.createElement('small');name.textContent=key;const number=document.createElement('b');number.textContent=String(value);card.append(name,number);div.append(card);
 }root.append(div);}
function saveSettings(){settings.mouseSensitivity=Number($('mouse-sensitivity').value);settings.touchSensitivity=Number($('touch-sensitivity').value);settings.fov=Number($('fov').value);settings.quality=$('quality').value;settings.fpsCap=Number($('fps-cap').value);settings.shake=Number($('shake').value);settings.sound=$('sound-toggle').checked;
 write('blockdash_settings_v2',settings);world?.setQuality(settings.quality);world?.setFov(settings.fov);
}
function initSettings(){for(const [key,id] of [['mouseSensitivity','mouse-sensitivity'],['touchSensitivity','touch-sensitivity'],['fov','fov'],['quality','quality'],['fpsCap','fps-cap'],['shake','shake'],['sound','sound-toggle']]){
 const el=$(id);if(el.type==='checkbox')el.checked=!!settings[key];else el.value=String(settings[key]);el.addEventListener('input',saveSettings);el.addEventListener('change',saveSettings);
 }}
function initUI(){initSettings();refreshProfile();optionsRefresh();
 $('server-url').value=options.server;const serverHint=profile.server||'';$('account-server').value=serverHint;
 for(const card of document.querySelectorAll('.mode-card'))card.onclick=()=>{if(['playing','countdown','paused','waiting'].includes(state))return;options.mode=card.dataset.mode;optionsRefresh();chirp();};
 $('map-select').onchange=()=>{options.map=$('map-select').value;world?.build(options.map,'practice');};
 $('difficulty-select').onchange=()=>options.difficulty=$('difficulty-select').value;
 $('bot-count').onchange=()=>options.bots=Number($('bot-count').value);
 $('team-size').onchange=()=>options.teamSize=Number($('team-size').value);
 $('primary-select').onchange=async()=>{try{await profile.setLoadout($('primary-select').value,profile.data.secondary);refreshProfile();}catch(e){message(e.message);refreshProfile();}};
 $('secondary-select').onchange=async()=>{try{await profile.setLoadout(profile.data.primary,$('secondary-select').value);refreshProfile();}catch(e){message(e.message);refreshProfile();}};
 $('nickname').addEventListener('change',async()=>{try{await profile.setNickname($('nickname').value);refreshProfile();}catch(e){message(e.message);}});
 $('play-button').onclick=play;
 $('settings-toggle').onclick=()=>openModal('settings-modal');$('shop-toggle').onclick=()=>{refreshProfile();openModal('shop-modal');};
 $('inventory-toggle').onclick=()=>{renderInventory();openModal('inventory-modal');};$('stats-toggle').onclick=()=>{renderStats();openModal('stats-modal');};$('account-toggle').onclick=()=>openModal('account-modal');
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
 $('draw-one').onclick=()=>draw(1);$('draw-ten').onclick=()=>draw(10);
 $('login-button').onclick=()=>auth(false);$('register-button').onclick=()=>auth(true);$('logout-button').onclick=()=>{profile.logout();refreshProfile();safeText('account-message','게스트 모드로 전환했어.');};
 $('pause-button').onclick=pause;$('scoreboard-button').onclick=()=>showBoard(!scoreboardVisible);
 $('copy-room').onclick=()=>{if(roomCode)navigator.clipboard?.writeText(roomCode).then(()=>notice('방 코드 복사됨')).catch(()=>notice(roomCode));};
 $('result-lobby').onclick=toLobby;$('result-again').onclick=()=>{closeModal('result-modal');toLobby();play();};
 $('edit-controls').onclick=()=>{closeModal('settings-modal');$('overlay').hidden=true;controls.beginEdit(()=>{$('overlay').hidden=false;openModal('settings-modal');});};
}
async function auth(register){const server=$('account-server').value.trim(),name=$('account-name').value.trim(),pass=$('account-password').value;
 if(!server||!name||!pass){safeText('account-message','주소, 아이디, 비밀번호를 입력해줘.');return;}
 const button=$(register?'register-button':'login-button');button.disabled=true;
 try{await profile.auth(server,name,pass,register);safeText('account-message',register?'계정을 만들었어.':'로그인했어.');refreshProfile();$('account-password').value='';
  if(!options.server){options.server=server.replace(/^http/,'ws')+'/ws';$('server-url').value=options.server;}
 }catch(e){safeText('account-message',e.message);}finally{button.disabled=false;}
}
async function draw(count){const b=$(count===1?'draw-one':'draw-ten');b.disabled=true;
 try{const draws=await profile.draw(count);refreshProfile();closeModal('shop-modal');await cinematic.play(draws);refreshProfile();renderInventory();openModal('shop-modal');safeText('shop-message',`${draws.length}개 획득했어.`);
 }catch(e){safeText('shop-message',e.message);}finally{b.disabled=false;}
}
function resetRound(cloudAI=false){roundRecorded=false;clock=0;timeLeft=ROUND_TIME;countdown=3;fireLatched=false;feedItems=[];renderFeed();remote.clear();snapshot=null;scope=1;gameStarted=false;previousRespawn=0;recoilDebt=0;recoilWait=0;
 player=makePlayer(MAPS[options.map].spawn[0][0],MAPS[options.map].spawn[0][1],profile.data.primary,profile.data.secondary);
 player.id='self';world.build(options.map,options.mode);world.setWeaponVisual(profile.data.primary);world.setCamera(player,1/60);
 $('hud-map').textContent=MAPS[options.map].name;$('copy-room').hidden=true;ai=null;
 if(options.mode==='bots'&&!cloudAI)ai=new AIManager(options.map,options.difficulty,options.bots);
 if(ai)for(const b of ai.bots)world.makeAvatar(b.id,b.name,['#bfa178','#9c9cbb','#9babb0','#d6b17b'][Number(b.id.split('-')[1])%4]);
}
function startCanvas(){document.querySelectorAll('.modal-bg').forEach(m=>m.hidden=true);$('overlay').hidden=true;$('hud').hidden=false;$('scoreboard').hidden=true;scoreboardVisible=false;
 controls.start();$('play-button').textContent='경기 시작';$('result-modal').hidden=true;
}
async function play(){if(state==='paused'){resume();return;}if(['playing','countdown','waiting'].includes(state))return;
 options.map=$('map-select').value;options.difficulty=$('difficulty-select').value;options.bots=Number($('bot-count').value);options.teamSize=Number($('team-size').value);
 try{await profile.setNickname($('nickname').value);}catch(e){message(e.message);return;}
 const cloudAI=options.mode==='bots'&&profile.remote;resetRound(cloudAI);network?.close();network=null;onlineId='';roomCode='';
 if(['ffa','tdm'].includes(options.mode)||cloudAI){
  let address=cloudAI?(options.server||$('server-url').value.trim()||profile.server.replace(/^http/,'ws')+'/ws'):$('server-url').value.trim();if(!address){message('온라인 게임은 서버 주소가 필요해.');return;}
  if(!/\/ws$/.test(address))address=address.replace(/\/$/,'')+'/ws';options.server=address;write('blockdash_server_v2',address);
  const button=$('play-button');button.disabled=true;message('서버에 연결하는 중…');
  try{
   if(!cloudAI&&$('room-privacy').value==='public'&&!$('room-code').value.trim()){
    try{const listUrl=address.replace(/^ws/,'http').replace(/\/ws$/,'/rooms');const list=await (await fetch(listUrl,{signal:AbortSignal.timeout(3000)})).json();
     const found=list.find(r=>r.mode===options.mode&&r.map===options.map&&r.count<r.max&&r.status==='waiting'&&(options.mode!=='tdm'||r.teamSize===options.teamSize));if(found)$('room-code').value=found.code;
    }catch{}
   }
   network=new Network();const joined=await network.connect(address,{name:profile.nickname,mode:options.mode,map:options.map,primary:profile.data.primary,secondary:profile.data.secondary,
    room:cloudAI?'':$('room-code').value.trim(),privacy:cloudAI?'private':$('room-privacy').value,teamSize:options.teamSize,authToken:profile.remote?profile.token:'',bots:options.bots,difficulty:options.difficulty},
    {onState:onSnapshot,onEvent:onServerEvent,onRoom:onRoom,onClose:onDisconnect,onError:message});
   onlineId=joined.id;roomCode=joined.room;state='waiting';startCanvas();$('copy-room').hidden=cloudAI;notice(`방 ${roomCode} · 참가 대기`,3);
  }catch(e){message(`연결 실패: ${e.message}`);network?.close();network=null;state='lobby';}
  finally{button.disabled=false;}
  return;
 }
 state='countdown';startCanvas();notice('3',1.0);chirp('countdown');
}
function onRoom(r){if(!r)return;roomCode=r.code;safeText('hud-map',`${MAPS[options.map].name} · ${r.code} · ${r.count}/${r.max}`);
 if(r.status==='waiting'&&state!=='finished')notice(`대기 중 · ${r.count}/${r.max}`,2);
}
function onServerEvent(e){if(e.event==='shot'){
  if(e.source!==onlineId){/* stylized remote fire feedback can be added without obscuring HUD */}
 }else if(e.event==='hit'){if(e.target===onlineId)hurt();if(e.source===onlineId)marker();}
 else if(e.event==='kill'){feed(`${e.sourceName} → ${e.targetName}`);if(e.source===onlineId){notice('처치',.8);chirp('kill');}if(e.target===onlineId)notice('5초 후 부활',1.4);}
 else if(e.event==='fall'&&e.source===onlineId){notice('5초 후 부활',1.2);}
 else if(e.event==='start'){state='playing';gameStarted=true;notice('시작!',1);chirp('countdown');}
 else if(e.event==='countdown'){state='countdown';countdown=3;notice('3',1);}
 else if(e.event==='end'){finishRound(e.outcome||{},'경기 종료');}
}
function onDisconnect(){if(['playing','countdown','waiting','paused'].includes(state)){
  controls.stop();state='lobby';$('hud').hidden=true;$('overlay').hidden=false;message('연결이 끊어졌어. 방 코드를 확인하고 다시 참가해줘.');updatePlayButton();
 }}
function onSnapshot(data){snapshot=data;if(!['playing','countdown','waiting','paused'].includes(state))return;
 timeLeft=data.time;
 if(data.status==='waiting'&&state!=='paused')state='waiting';
 else if(data.status==='countdown'&&state!=='paused'){state='countdown';const c=Math.ceil(data.countdown);if(countdown!==c&&c>0){notice(String(c),.8);chirp('countdown');}countdown=c;}
 else if(data.status==='playing'&&state!=='paused'){if(state!=='playing'){notice('시작!',1);}state='playing';gameStarted=true;}
 const visible=new Set();for(const remoteData of data.players){if(remoteData.id===onlineId)continue;visible.add(remoteData.id);if(!remote.has(remoteData.id)){
  world.makeAvatar(remoteData.id,remoteData.name,remoteData.team===1?'#729ac6':remoteData.team===2?'#e79b64':'#aebec8',remoteData.team);
 }remote.set(remoteData.id,remoteData);
 }
 for(const id of remote.keys())if(!visible.has(id)){remote.delete(id);world.removeAvatar(id);}
 const own=data.players.find(x=>x.id===onlineId);if(!own)return;
 const before=player.hp;const previousWeapon=equipped(player);const lag=Math.hypot(player.x-own.x,player.z-own.z);
 if(lag>3){player.x=own.x;player.z=own.z;player.y=own.y;}else{player.x+=(own.x-player.x)*.28;player.z+=(own.z-player.z)*.28;player.y+=(own.y-player.y)*.28;}
 Object.assign(player,{hp:own.hp,score:own.score,kills:own.kills,deaths:own.deaths,assists:own.assists,respawn:own.respawn,invuln:own.invuln,slide:own.slide,crouch:own.crouch,ads:own.ads,
 primary:own.primary,secondary:own.secondary,slot:own.slot,ammo:own.ammo,reload:own.reload});
 if(equipped(player)!==previousWeapon)world.setWeaponVisual(equipped(player));
 if(player.hp<before)hurt();
}
function changeSlot(slot){if(!['playing','countdown','waiting'].includes(state)||player.respawn>0)return;
 if(setSlot(player,slot)){world.setWeaponVisual(equipped(player));scope=1;chirp('reload');}
}
async function cycleRespawn(kind){if(player.respawn<=0||!['playing','waiting'].includes(state))return;
 const candidates=profile.data.owned.filter(k=>kind==='primary'?WEAPONS[k]?.kind!=='HG':WEAPONS[k]?.kind==='HG');if(candidates.length<2)return;
 const current=kind==='primary'?player.primary:player.secondary,next=candidates[(candidates.indexOf(current)+1)%candidates.length];
 const primary=kind==='primary'?next:player.primary,secondary=kind==='secondary'?next:player.secondary;
 if(setLoadout(player,primary,secondary)){
  if(network?.connected)network.send({type:'loadout',primary,secondary});
  notice(`${primary} / ${secondary}`,2);
 }
}
function swap(){if(player.respawn>0){cycleRespawn('secondary');return;}changeSlot(player.slot===0?1:0);}
function aimScope(){if(player.respawn>0){cycleRespawn('primary');return;}
 if(WEAPONS[equipped(player)]?.kind!=='SR')return;const scopes=[1,2,4,6];scope=scopes[(scopes.indexOf(scope)+1)%scopes.length];world.scope=scope;notice(scope===1?'레드닷':`${scope}배 조준`,.75);
}
function addRecoil(w){const increment=(w.recoil*Math.PI/180)*(player.ads?.8:1);player.pitch=clamp(player.pitch+increment,-1.43,1.43);recoilDebt+=increment;recoilWait=.1;}
function recoverRecoil(dt){if(recoilWait>0){recoilWait=Math.max(0,recoilWait-dt);return;}if(recoilDebt<=0)return;const amount=Math.min(recoilDebt,6*Math.PI/180*dt);recoilDebt-=amount;player.pitch=clamp(player.pitch-amount,-1.43,1.43);}
function fireLocal(){const outcome=fireAttempt(player);if(!outcome.ok)return;
 const w=outcome.weapon;world.fireVisual();addRecoil(w);chirp('shot');
 // This is a deliberately fictional arcade raycast, not real-world ballistics.
 if(options.mode==='practice'){
  const target=world.practiceHit();if(target){player.score+=10;world.moveTarget(target);marker();notice('+10',.5);}
 }else if(options.mode==='bots'&&ai){const ray=raycastCombat(player,ai.bots.map(b=>b.p),w,world.colliders);
  for(const [target,damage] of ray.hits){const before=target.hp;const result=dealDamage(target,player,damage,[player,...ai.bots.map(b=>b.p)],clock);if(target.hp<before)marker();
   if(result.killed){const bot=ai.bots.find(b=>b.p===target);notice('처치',.8);feed(`플레이어 → ${bot?.name||'BOT'}`);chirp('kill');}}
 }
}
function fallLocal(){player.hp=0;player.deaths++;player.streak=0;player.respawn=RESPAWN_TIME;notice('5초 후 부활',2);feed('맵 밖으로 떨어짐');}
function localUpdate(dt){
 if(options.mode==='bots'&&ai){const old=player.hp;ai.update(dt,player,clock,e=>{
   if(e.target==='플레이어'&&e.type==='kill'){notice('5초 후 부활',1.5);feed(`${e.source} → 플레이어`);}else if(e.type==='kill')feed(`${e.source} → ${e.target}`);
  });if(player.hp<old)hurt();for(const b of ai.bots)world.setAvatar(b.id,b.p,1);
 }
 if(player.respawn>0){player.respawn=Math.max(0,player.respawn-dt);if(player.respawn===0){const spawn=bestSpawn(options.map,(ai?.bots||[]).map(b=>b.p));revive(player,spawn.x,spawn.z);player.id='self';world.setWeaponVisual(equipped(player));notice('부활',.65);}}
 else{tickCombat(player,dt);if(offMap(player,options.map))fallLocal();}
 timeLeft=Math.max(0,timeLeft-dt);if(timeLeft===0)finishRound({},'시간 종료');
}
function isVictory(){if(options.mode==='bots'){const entries=[player,...ai.bots.map(b=>b.p)].sort((a,b)=>b.score-a.score||b.kills-a.kills||a.deaths-b.deaths);return entries[0]===player;}
 return false;}
async function finishRound(outcome={},reason='경기 종료'){
 if(state==='finished'||state==='lobby')return;state='finished';controls.stop();$('hud').hidden=true;$('scoreboard').hidden=true;scoreboardVisible=false;$('overlay').hidden=false;
 const online=!!network?.connected,summary={score:outcome.score??player.score,kills:outcome.kills??player.kills,deaths:outcome.deaths??player.deaths,assists:outcome.assists??player.assists,win:outcome.win??isVictory()};
 let reward=outcome.reward??0;
 if(!roundRecorded){roundRecorded=true;
  if(!online){const saved=await profile.record(options.mode,summary.kills,summary.win,summary.score,summary.deaths,summary.assists);reward=saved.reward;}
  else if(profile.remote){try{await profile.refresh();}catch{}}
  else{const saved=await profile.record(options.mode,summary.kills,summary.win,summary.score,summary.deaths,summary.assists);reward=saved.reward;}
 }
 $('result-title').textContent=summary.win?'승리':options.mode==='practice'?'연습 종료':'패배';
 $('result-modal').classList.toggle('won',!!summary.win);$('result-modal').classList.toggle('lost',!summary.win&&options.mode!=='practice');
 $('result-reason').textContent=reason;
 const root=$('result-metrics');root.replaceChildren();for(const [label,value] of [['점수',summary.score],['처치',summary.kills],['데스',summary.deaths]]){
  const d=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=label;strong.textContent=String(value);d.append(small,strong);root.append(d);
 }
 $('reward-line').textContent=options.mode==='practice'?'연습 모드 · BDC 보상 없음':profile.remote&&!online?'계정 AI 보상은 서버 검증 전까지 지급되지 않아.':`+${reward} BDC`;
 openModal('result-modal');refreshProfile();chirp(summary.win?'victory':'click');network?.close();network=null;updatePlayButton();
}
function toLobby(){network?.close();network=null;roomCode='';state='lobby';controls?.stop();$('hud').hidden=true;$('overlay').hidden=false;$('scoreboard').hidden=true;closeModal('result-modal');updatePlayButton();world?.build(options.map,'practice');}
function pause(){if(!['playing','countdown','waiting'].includes(state))return;
 pausedOnline=!!network?.connected;state='paused';controls.stop();$('overlay').hidden=false;$('scoreboard').hidden=true;scoreboardVisible=false;message(pausedOnline?'온라인 경기는 계속 진행 중이야.':'일시정지');updatePlayButton();
 if(network?.connected)network.send({type:'input',input:{forward:0,strafe:0,fire:false}});
}
function updatePlayButton(){const el=$('play-button');el.textContent=state==='paused'?'계속 플레이':'경기 시작';}
function resume(){state=network?.connected?(snapshot?.status==='playing'?'playing':snapshot?.status==='countdown'?'countdown':'waiting'):'playing';$('overlay').hidden=true;controls.start();updatePlayButton();}
function showBoard(show){if(!['playing','waiting','countdown'].includes(state))return;scoreboardVisible=show;$('scoreboard').hidden=!show;if(show)renderBoard();}
function renderBoard(){const list=$('scoreboard-list');list.replaceChildren();let entries=[];
 if(network?.connected&&snapshot)entries=snapshot.players.map(p=>({id:p.id,name:p.name,score:p.score,kills:p.kills,deaths:p.deaths,team:p.team}));
 else entries=[{id:'self',name:profile.nickname,score:player.score,kills:player.kills,deaths:player.deaths,team:0},...(ai?.bots||[]).map(b=>({id:b.id,name:b.name,score:b.p.score,kills:b.p.kills,deaths:b.p.deaths,team:0}))];
 entries.sort((a,b)=>b.score-a.score||b.kills-a.kills||a.deaths-b.deaths);
 for(const [index,p] of entries.entries()){const row=document.createElement('div');row.className='board-entry'+((p.id===onlineId||p.id==='self')?' mine':'');
  for(const val of [`${index+1}. ${p.team===1?'블루 ':p.team===2?'오렌지 ':''}${p.name}`,p.score,p.kills,p.deaths]){const span=document.createElement('span');span.textContent=String(val);row.append(span);}list.append(row);
 }
}
function updateHUD(){safeText('hud-mode',MODES[options.mode]);safeText('hud-score',player.score);const t=Math.max(0,Math.ceil(timeLeft));safeText('hud-time',`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`);
 safeText('hp-value',Math.max(0,Math.ceil(player.hp)));$('hp-fill').style.width=`${clamp(player.hp,0,HEALTH)}%`;
 const w=WEAPONS[equipped(player)]||WEAPONS.M416;safeText('weapon-name',w.name);safeText('weapon-kind',`${w.kind} · ${RARITIES[w.rarity].name}`);safeText('ammo-current',player.ammo[w.key]??w.mag);safeText('ammo-max',w.mag);safeText('secondary-name',player.slot===0?player.secondary:player.primary);
 $('reload-status').textContent=player.reload>0?`재장전 ${player.reload.toFixed(1)}초`:w.kind==='SR'&&scope>1?`${scope}배`:'';
 $('life-status').textContent=player.respawn>0?`부활 ${player.respawn.toFixed(1)}초 · 대기 중 Z/X로 무기 변경`:player.invuln>0?`무적 ${player.invuln.toFixed(1)}초`:'';
 $('crosshair').style.opacity=player.ads?'0.35':'1';
}
function tick(dt){if(state==='waiting'){if(network?.connected&&snapshot?.status==='countdown')state='countdown';return;}
 if(state==='countdown'){if(!network?.connected){countdown-=dt;const now=Math.ceil(countdown);if(now>=1&&now!==Math.ceil(countdown+dt)){notice(String(now),.9);chirp('countdown');}if(countdown<=0){state='playing';notice('시작!',.9);chirp('countdown');}}
  return;
 }
 if(state!=='playing')return;
 const look=controls.takeLook();player.yaw+=look.x;player.pitch=clamp(player.pitch+look.y,-1.43,1.43);
 const input=controls.input();if(input.swap)swap();if(input.scope)aimScope();
 if(input.reload&&player.respawn<=0){if(startReload(player))chirp('reload');}
 if(player.respawn<=0){stepPlayer(player,input,dt,world.colliders,options.map);player.ads=!!input.ads;}
 if(network?.connected){
  // Client predicts its own motion; server recalculates hits and combat rewards.
  sendTimer+=dt;if(sendTimer>=.05){sendTimer=0;network.send({type:'input',yaw:player.yaw,pitch:player.pitch,input:{forward:input.forward,strafe:input.strafe,sprint:input.sprint,
   crouch:input.crouch,ads:input.ads,jump:input.jump,slide:input.slide,fire:input.fire,reload:input.reload,slot:player.slot}});}
  for(const [id,p] of remote)world.setAvatar(id,p,1-Math.exp(-dt*10));
  if(input.fire){const w=WEAPONS[equipped(player)];if(w.auto||!fireLatched){const out=fireAttempt(player);if(out.ok){world.fireVisual();addRecoil(out.weapon);chirp('shot');}}}
 }else{
  if(input.fire){const w=WEAPONS[equipped(player)];if(w.auto||!fireLatched)fireLocal();}
  localUpdate(dt);
 }
 fireLatched=!!input.fire;recoverRecoil(dt);
 world.scope=scope;world.setCamera(player,dt);updateHUD();if(scoreboardVisible)renderBoard();
}
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.06,Math.max(0,(now-lastFrame)/1000));lastFrame=now;clock+=dt;
 if(['playing','countdown','waiting'].includes(state)){const steps=Math.max(1,Math.ceil(dt/(1/60)));for(let i=0;i<steps;i++)tick(dt/steps);}
 if(clock>hitUntil)$('hitmarker').classList.remove('show');if(clock>hurtUntil)$('hurt').classList.remove('show');if(noticeUntil&&clock>noticeUntil){safeText('notice','');noticeUntil=0;}
 if(feedItems.some(e=>e.until<clock)){feedItems=feedItems.filter(e=>e.until>=clock);renderFeed();}
 const cap=settings.fpsCap||Infinity;const elapsed=now-lastRender;if(elapsed<1000/cap-1)return;lastRender=now;
 world?.update(dt,now/1000);
}
async function bootstrap(){
 initUI();try{world=new World($('game'),settings.quality);world.build('yard','practice');world.setFov(settings.fov);controls=new Controls($('game'),settings);
  controls.onPause=pause;controls.onScoreboard=showBoard;controls.onFire=()=>{if(state==='playing'&&network?.connected)network.send({type:'fire',yaw:player.yaw,pitch:player.pitch});};controls.onSlot=changeSlot;controls.onRespawnCycle=cycleRespawn;
  world.setCamera(player,1/60);requestAnimationFrame(frame);await profile.init();refreshProfile();
 }catch(e){error('3D 화면을 시작할 수 없어. 브라우저의 WebGL 지원과 인터넷 연결을 확인해줘. '+e.message);}
}
bootstrap();
