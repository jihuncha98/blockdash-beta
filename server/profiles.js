import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {BDC,WEAPONS,STARTER_WEAPONS,RARITIES,drawWeapon,rewardForMatch} from '../shared/rules.js';
const safeProfile=id=>({nickname:id.slice(0,16),bdc:0,owned:[...STARTER_WEAPONS],primary:'M416',secondary:'P92',stats:{games:0,wins:0,kills:0,deaths:0,assists:0,bestPractice:0}});
const random=()=>crypto.randomInt(0,1_000_000)/1_000_000;
export class ProfileDb{
 constructor(filepath=':memory:'){this.path=filepath;this.users={};this.tokens=new Map();this.failures=new Map();if(filepath!==':memory:'&&fs.existsSync(filepath)){
  try{this.users=JSON.parse(fs.readFileSync(filepath,'utf8'));}catch{throw new Error('프로필 저장 파일을 읽을 수 없습니다. 원본 파일을 확인해 주세요.');}}
 }
 persist(){if(this.path===':memory:')return;fs.mkdirSync(path.dirname(this.path),{recursive:true});const temp=this.path+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.users,null,2),{mode:0o600});fs.renameSync(temp,this.path);}
 validId(id){return typeof id==='string'&&/^[a-zA-Z0-9_.-]{3,24}$/.test(id);}
 validPass(p){return typeof p==='string'&&p.length>=8&&p.length<=128;}
 issue(id){const token=crypto.randomBytes(32).toString('hex');this.tokens.set(token,{id,until:Date.now()+7*24*3600e3});return token;}
 profile(user){return structuredClone(user.profile);}
 auth(token){const s=this.tokens.get(String(token||''));if(!s)return null;if(s.until<Date.now()){this.tokens.delete(token);return null;}return this.users[s.id]?{id:s.id,user:this.users[s.id]}:null;}
 create(id,password){if(!this.validId(id)||!this.validPass(password))throw new Error('아이디는 3~24자 영문·숫자, 비밀번호는 8자 이상으로 입력해줘.');
  id=id.toLowerCase();if(this.users[id])throw new Error('이미 사용 중인 아이디야.');
  const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(password,salt,64).toString('hex');
  this.users[id]={salt,hash,profile:safeProfile(id)};this.persist();return {token:this.issue(id),profile:this.profile(this.users[id])};
 }
 login(id,password){id=String(id||'').toLowerCase();const history=this.failures.get(id)||{count:0,until:0};if(history.count>=5&&history.until>Date.now())throw new Error('잠시 후 다시 시도해줘.');
  const u=this.users[id];let match=false;if(u&&typeof password==='string'){
   const actual=crypto.scryptSync(password,u.salt,64),expected=Buffer.from(u.hash,'hex');match=actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
  }
  if(!match){const count=history.until<Date.now()?1:history.count+1;this.failures.set(id,{count,until:Date.now()+60_000});throw new Error('아이디 또는 비밀번호를 확인해줘.');}
  this.failures.delete(id);return {token:this.issue(id),profile:this.profile(u)};
 }
 update(id,patch){const u=this.users[id];if(!u)throw new Error('사용자 정보가 없어.');
  if(patch.nickname!==undefined){const nickname=String(patch.nickname).trim().slice(0,16);if(!nickname)throw new Error('닉네임이 비어 있어.');u.profile.nickname=nickname;}
  if(patch.primary!==undefined||patch.secondary!==undefined){const p=patch.primary,s=patch.secondary;
   if(!u.profile.owned.includes(p)||!u.profile.owned.includes(s)||WEAPONS[p]?.kind==='HG'||WEAPONS[s]?.kind!=='HG')throw new Error('보유한 무기를 선택해줘.');
   u.profile.primary=p;u.profile.secondary=s;}
  this.persist();return this.profile(u);
 }
 draw(id,count){const u=this.users[id];if(count!==1&&count!==10)throw new Error('1회 또는 10회만 선택할 수 있어.');
  const cost=count===1?BDC.single:BDC.ten;if(u.profile.bdc<cost)throw new Error('BDC가 부족해.');
  u.profile.bdc-=cost;const results=[];
  for(let i=0;i<count;i++){const w=drawWeapon(random),duplicate=u.profile.owned.includes(w.key);if(duplicate)u.profile.bdc+=BDC.duplicate;else u.profile.owned.push(w.key);
   results.push({key:w.key,rarity:w.rarity,duplicate,refund:duplicate?BDC.duplicate:0});}
  this.persist();return {draws:results,profile:this.profile(u)};
 }
 award(id,mode,stats,win){const u=this.users[id];if(!u||mode==='practice')return 0;
  const p=u.profile,reward=rewardForMatch(stats.kills,win,mode);p.bdc+=reward;p.stats.games++;p.stats.kills+=stats.kills;p.stats.deaths+=stats.deaths;p.stats.assists+=stats.assists;if(win)p.stats.wins++;
  this.persist();return reward;
 }
}
