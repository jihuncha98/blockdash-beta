import {STARTER_WEAPONS,WEAPONS,BDC,drawWeapon,rewardForMatch} from '../shared/rules.js';
const KEY='blockdash_profile_v2';
const defaults=()=>({nickname:'PLAYER',bdc:0,owned:[...STARTER_WEAPONS],primary:'M416',secondary:'P92',stats:{games:0,wins:0,kills:0,deaths:0,assists:0,bestPractice:0}});
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY));}catch{return null;}};
const save=v=>{try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}};
function sanitize(raw){const p=defaults();if(!raw||typeof raw!=='object')return p;
 p.nickname=String(raw.nickname||'PLAYER').slice(0,16);p.bdc=Math.max(0,Math.min(2e9,Math.floor(Number(raw.bdc)||0)));
 p.owned=[...new Set([...STARTER_WEAPONS,...(Array.isArray(raw.owned)?raw.owned:[]).filter(w=>WEAPONS[w])])];
 p.primary=p.owned.includes(raw.primary)&&WEAPONS[raw.primary]?.kind!=='HG'?raw.primary:'M416';p.secondary=p.owned.includes(raw.secondary)&&WEAPONS[raw.secondary]?.kind==='HG'?raw.secondary:'P92';
 for(const key of Object.keys(p.stats))p.stats[key]=Math.max(0,Math.floor(Number(raw.stats?.[key])||0));return p;}
function secureRandom(){const array=new Uint32Array(1);if(globalThis.crypto?.getRandomValues){crypto.getRandomValues(array);return array[0]/4294967296;}return Math.random();}
export class ProfileStore{
 constructor(){this.guest=sanitize(read());this.data=this.guest;this.token='';this.server='';this.remote=false;
  try{this.token=sessionStorage.getItem('blockdash_token')||'';this.server=sessionStorage.getItem('blockdash_api')||'';}catch{}}
 get nickname(){return this.data.nickname;}get bdc(){return this.data.bdc;}
 async init(){if(this.token&&this.server){try{await this.refresh();}catch{this.token='';this.remote=false;}}}
 async request(path,method='GET',payload){if(!this.server)throw new Error('서버 주소를 입력해줘.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
  try{const res=await fetch(this.server+path,{method,headers:{'Content-Type':'application/json',...(this.token?{'Authorization':`Bearer ${this.token}`}:{})},body:payload===undefined?undefined:JSON.stringify(payload),signal:controller.signal});
   const json=await res.json();if(!res.ok)throw new Error(json.error||'서버 요청에 실패했어.');return json;
  }finally{clearTimeout(timeout);}
 }
 async refresh(){const out=await this.request('/api/profile');this.data=sanitize(out.profile);this.remote=true;return this.data;}
 async auth(server,id,password,register=false){const url=String(server).trim().replace(/\/$/,'');if(!/^https:\/\//.test(url)&&!/^http:\/\/localhost(?::\d+)?$/.test(url)&&!/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(url))throw new Error('계정 서버는 https:// 연결이 필요해.');
  this.server=url;const out=await this.request(register?'/api/auth/register':'/api/auth/login','POST',{id,password});this.token=out.token;
  try{sessionStorage.setItem('blockdash_token',this.token);sessionStorage.setItem('blockdash_api',this.server);}catch{}
  await this.refresh();return this.data;
 }
 logout(){this.remote=false;this.token='';this.data=this.guest;try{sessionStorage.removeItem('blockdash_token');sessionStorage.removeItem('blockdash_api');}catch{}}
 store(){if(!this.remote){this.guest=sanitize(this.data);save(this.guest);}}
 async setNickname(name){const cleaned=String(name||'PLAYER').trim().slice(0,16)||'PLAYER';if(this.remote){const response=await this.request('/api/profile/name','POST',{nickname:cleaned});this.data=sanitize(response.profile);}else{this.data.nickname=cleaned;this.store();}}
 async setLoadout(primary,secondary){if(!this.data.owned.includes(primary)||!this.data.owned.includes(secondary)||WEAPONS[primary]?.kind==='HG'||WEAPONS[secondary]?.kind!=='HG')throw new Error('보유한 무기만 장착할 수 있어.');
  if(this.remote){const response=await this.request('/api/profile/loadout','POST',{primary,secondary});this.data=sanitize(response.profile);}else{this.data.primary=primary;this.data.secondary=secondary;this.store();}}
 async draw(count){if(count!==1&&count!==10)throw new Error('잘못된 개봉 횟수야.');
  if(this.remote){const response=await this.request('/api/draw','POST',{count});this.data=sanitize(response.profile);return response.draws;}
  const cost=count===1?BDC.single:BDC.ten;if(this.data.bdc<cost)throw new Error('BDC가 부족해.');
  this.data.bdc-=cost;const results=[];
  for(let i=0;i<count;i++){const w=drawWeapon(secureRandom),duplicate=this.data.owned.includes(w.key);if(duplicate)this.data.bdc+=BDC.duplicate;else this.data.owned.push(w.key);results.push({key:w.key,rarity:w.rarity,duplicate,refund:duplicate?BDC.duplicate:0});}
  this.store();return results;
 }
 async record(mode,kills,win,score=0,deaths=0,assists=0){if(this.remote){
   if(mode==='practice'){const response=await this.request('/api/practice/record','POST',{score});this.data=sanitize(response.profile);}
   // AI and online match currency is awarded only by the authoritative server.
   return {reward:0,serverManaged:true};
  }
  const reward=rewardForMatch(kills,win,mode);this.data.bdc+=reward;this.data.stats.games++;
  if(win)this.data.stats.wins++;this.data.stats.kills+=kills;this.data.stats.deaths+=deaths;this.data.stats.assists+=assists;
  if(mode==='practice')this.data.stats.bestPractice=Math.max(this.data.stats.bestPractice,score);
  this.store();return {reward,serverManaged:false};
 }
}
