import * as THREE from 'three';
import {WEAPONS,RARITIES} from '../shared/rules.js';
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
const rarityRank={common:0,rare:1,epic:2,legendary:3};
export class Cinematic{
 constructor(settings){this.settings=settings;this.root=document.getElementById('cinematic');this.canvas=document.getElementById('cinematic-canvas');this.skip=document.getElementById('cinematic-skip');this.done=document.getElementById('cinematic-done');this.title=document.getElementById('cinematic-title');this.sub=document.getElementById('cinematic-subtitle');this.grid=document.getElementById('cinematic-grid');
  this.renderer=null;this.busy=false;this.skip.onclick=()=>this.finish();this.done.onclick=()=>this.close();
 }
 init(){if(this.renderer)return;
  this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:this.settings.quality!=='low',powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.settings.quality==='low'?1:1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#11151b');this.camera=new THREE.PerspectiveCamera(42,1,.1,100);this.camera.position.set(5,3.1,8.7);this.camera.lookAt(0,.55,0);
  this.scene.add(new THREE.HemisphereLight('#8396b5','#13151a',2.1));const warm=new THREE.DirectionalLight('#ffcb86',2.5);warm.position.set(-3,8,6);this.scene.add(warm);
  this.glow=new THREE.PointLight('#f28a32',0,9);this.glow.position.set(0,.9,0);this.scene.add(this.glow);
  this.platform=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,.3,48),new THREE.MeshStandardMaterial({color:'#2b323b',roughness:.65,metalness:.55}));this.platform.position.y=-1.05;this.scene.add(this.platform);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.0,.03,8,80),new THREE.MeshBasicMaterial({color:'#b17643'}));ring.rotation.x=Math.PI/2;ring.position.y=-.88;this.scene.add(ring);
  this.group=new THREE.Group();this.scene.add(this.group);
  const metal=new THREE.MeshStandardMaterial({color:'#525e6a',metalness:.65,roughness:.36}),edge=new THREE.MeshStandardMaterial({color:'#ca864b',metalness:.5,roughness:.35}),dark=new THREE.MeshStandardMaterial({color:'#252d38',metalness:.55,roughness:.45});
  const crate=new THREE.Mesh(new THREE.BoxGeometry(2.25,1.35,1.45),metal);this.group.add(crate);
  for(const z of [-.75,.75]){const strip=new THREE.Mesh(new THREE.BoxGeometry(2.36,.16,.12),edge);strip.position.set(0,0,z);this.group.add(strip);}
  for(const x of [-1.11,1.11]){const strip=new THREE.Mesh(new THREE.BoxGeometry(.12,1.4,1.57),dark);strip.position.set(x,0,0);this.group.add(strip);}
  const mark=new THREE.Mesh(new THREE.BoxGeometry(.9,.08,.05),edge);mark.position.set(0,.12,.76);this.group.add(mark);
  this.lidPivot=new THREE.Group();this.lidPivot.position.set(0,.74,-.72);this.group.add(this.lidPivot);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(2.48,.28,1.67),metal);lid.position.set(0,.12,.75);this.lidPivot.add(lid);
  for(const x of [-.86,.86]){const a=new THREE.Mesh(new THREE.BoxGeometry(.14,.34,1.7),edge);a.position.set(x,.12,.75);this.lidPivot.add(a);}
  this.weapon=new THREE.Group();this.scene.add(this.weapon);this.makeWeapon('M416');
  this.particles=[];for(let i=0;i<55;i++){
   const item=new THREE.Mesh(new THREE.OctahedronGeometry(.018+Math.random()*.038,0),new THREE.MeshBasicMaterial({color:'#f5a859',transparent:true,opacity:.75}));item.position.set((Math.random()-.5)*5,Math.random()*3-.75,(Math.random()-.5)*4);this.scene.add(item);
   this.particles.push({mesh:item,velocity:.2+Math.random()*.5,phase:Math.random()*6.28});
  }
  this.resize();addEventListener('resize',()=>this.resize());
 }
 resize(){if(!this.renderer)return;const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
 makeWeapon(key){this.weapon.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.weapon.clear();const w=WEAPONS[key]||WEAPONS.M416;
  const steel=new THREE.MeshStandardMaterial({color:'#70808d',metalness:.65,roughness:.36}),accent=new THREE.MeshStandardMaterial({color:'#d99a57',metalness:.48,roughness:.32}),black=new THREE.MeshStandardMaterial({color:'#252e38',metalness:.3,roughness:.55});
  const b=(sx,sy,sz,x,y,z,mat)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);o.position.set(x,y,z);this.weapon.add(o);};
  const len=w.kind==='SR'?2.35:w.kind==='SG'?2.0:w.kind==='HG'?1.0:w.kind==='SMG'?1.3:1.8;
  b(.52,.35,len,0,0,0,steel);b(.45,.13,len*.64,0,.22,-.12,accent);b(.24,.26,len*.42,0,0,-len*.58,black);b(.29,.64,.3,0,-.45,.35,black);
  if(w.kind==='SR'){b(.28,.24,.55,0,.48,-.2,black);b(.2,.2,.14,0,.51,-.5,accent);}
  if(w.kind==='SG')b(.62,.18,.72,0,-.1,-.5,accent);
  this.weapon.rotation.y=.2;
 }
 cue(type='start'){if(!this.settings.sound)return;try{const audio=this.audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();
  const notes=type==='legendary'?[196,294,392,588]:type==='epic'?[220,330,440]:type==='reveal'?[392,494]:[164,247];
  for(let i=0;i<notes.length;i++){const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.08;
   o.type='triangle';o.frequency.setValueAtTime(notes[i],t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.024,t+.03);g.gain.exponentialRampToValueAtTime(.0001,t+.42);
   o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.45);}
 }catch{}}
 async play(draws){if(!draws?.length)return;this.init();this.busy=true;this.draws=draws;this.best=draws.reduce((a,b)=>rarityRank[a.rarity]>=rarityRank[b.rarity]?a:b);
  this.duration=draws.length===10?7:({common:2,rare:3,epic:4,legendary:6}[this.best.rarity]||3);this.startTime=performance.now();this.revealed=false;
  this.root.className=`cinematic rarity-${this.best.rarity}`;this.root.hidden=false;this.skip.hidden=false;this.done.hidden=true;this.title.textContent='개봉 중';this.sub.textContent='';this.grid.replaceChildren();
  for(let i=0;i<draws.length;i++){const d=draws[i],c=document.createElement('div');c.className='reveal-card';c.style.borderColor=RARITIES[d.rarity].color;
   const tier=document.createElement('small');tier.textContent=RARITIES[d.rarity].name;const name=document.createElement('strong');name.textContent=d.key;
   const extra=document.createElement('span');extra.className='new';extra.textContent=d.duplicate?'+350 BDC':'새 무기';c.append(tier,name,extra);this.grid.append(c);}
  this.makeWeapon(this.best.key);this.cue('start');this.group.visible=true;this.weapon.visible=false;this.animate();
  return new Promise(resolve=>{this.resolve=resolve;});
 }
 animate(){if(!this.busy)return;
  const elapsed=(performance.now()-this.startTime)/1000,t=Math.min(1,elapsed/this.duration),reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const threshold=reduced?.08:.27,openT=ease((t-threshold)/.33),revealT=ease((t-.52)/.23);
  this.group.position.y=(1-ease(t/.28))*3-.02;
  this.lidPivot.rotation.x=-openT*1.95;this.group.rotation.y=Math.sin(elapsed*.4)*.045;
  this.glow.color.set(RARITIES[this.best.rarity].color);this.glow.intensity=6*openT;
  this.weapon.visible=t>.45;this.weapon.position.y=-.2+revealT*1.15+Math.sin(elapsed*1.6)*.08;this.weapon.scale.setScalar(.05+revealT*.95);this.weapon.rotation.y+=.012;
  const opacity=Math.max(0,1-revealT*.8);this.group.traverse(o=>{if(o.isMesh&&o.material){o.material.transparent=true;o.material.opacity=opacity;}});
  for(const p of this.particles){p.mesh.position.y+=p.velocity*.016*(1+openT*3);if(p.mesh.position.y>4)p.mesh.position.y=-.9;p.mesh.rotation.y+=.02;p.mesh.visible=this.settings.quality!=='low';}
  const cards=[...this.grid.children];cards.forEach((c,i)=>{if(t>.45+(i+1)*(this.draws.length===10?.045:.12))c.classList.add('shown');});
  if(t>=1){this.finish();return;}
  this.renderer.render(this.scene,this.camera);this.animFrame=requestAnimationFrame(()=>this.animate());
 }
 finish(){if(!this.busy||this.revealed)return;this.revealed=true;cancelAnimationFrame(this.animFrame);this.skip.hidden=true;this.done.hidden=false;this.weapon.visible=true;this.group.visible=false;this.glow.intensity=3;
  this.title.textContent=this.draws.length===1?this.best.key:'획득 결과';this.sub.textContent=this.draws.length===1?RARITIES[this.best.rarity].name:`${this.draws.length}개 획득`;
  for(const c of this.grid.children)c.classList.add('shown');this.cue(this.best.rarity);
  this.renderer.render(this.scene,this.camera);
 }
 close(){if(!this.busy)return;this.busy=false;cancelAnimationFrame(this.animFrame);this.root.hidden=true;this.resolve?.();this.resolve=null;}
}
