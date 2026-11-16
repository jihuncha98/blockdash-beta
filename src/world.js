import * as THREE from 'three';
import {MAPS,WEAPONS,RARITIES,rects,overlaps} from '../shared/rules.js';

// Stylized, intentionally non-realistic low-poly props and arena graphics.
export class World{
 constructor(canvas,quality='medium'){
  this.canvas=canvas;this.quality=quality;
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:quality!=='low',powerPreference:'high-performance',alpha:false});
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(90,1,.04,200);this.camera.rotation.order='YXZ';this.scene.add(this.camera);
  this.root=new THREE.Group();this.scene.add(this.root);this.avatarRoot=new THREE.Group();this.scene.add(this.avatarRoot);
  this.weaponGroup=new THREE.Group();this.camera.add(this.weaponGroup);this.weaponKey='M416';this.kick=0;this.bob=0;this.flashTime=0;this.adsAmount=0;this.crouchAmount=0;this.equipTime=.35;this.magMesh=null;
  this.scene.add(new THREE.HemisphereLight('#aabbd4','#10141c',2.1));this.sun=new THREE.DirectionalLight('#ffbf80',2.5);this.sun.position.set(-30,50,26);this.scene.add(this.sun);
  this.avatars=new Map();this.targets=[];this.occluders=[];this.effects=[];this.raycaster=new THREE.Raycaster();this.colliders=[];this.id='yard';this.fov=90;
  this.setWeaponVisual('M416');this.resize();window.addEventListener('resize',()=>this.resize());
 }
 resize(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.quality==='low'?1:this.quality==='medium'?1.35:1.8));}
 setQuality(v){this.quality=v;this.resize();}
 setFov(v){this.fov=v;this.camera.fov=v;this.camera.updateProjectionMatrix();}
 clear(){this.root.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.root.clear();
  for(const a of this.avatars.values()){this.avatarRoot.remove(a.group);this.disposeGroup(a.group);}this.avatars.clear();this.targets=[];this.occluders=[];
  for(const e of this.effects){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}this.effects=[];
 }
 disposeGroup(g){g.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
 box(group,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);group.add(m);return m;}
 build(id='yard',mode='practice'){
  this.clear();this.id=MAPS[id]?id:'yard';const map=MAPS[this.id];this.colliders=rects(this.id);
  this.scene.background=new THREE.Color(map.sky);this.scene.fog=new THREE.Fog(map.sky,68,176);
  const material=(color,metalness=.06)=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness});
  const floor=material(map.floor),wall=material('#374757',.16),roof=material('#515f70',.15),crate=material('#655749',.1),orange=new THREE.MeshBasicMaterial({color:'#e78937'}),trim=material('#101720');
  this.box(this.root,map.half*2,1.2,map.half*2,0,-.6,0,floor);
  const grid=new THREE.GridHelper(map.half*2,map.half,'#5d6b7c','#4b5562');grid.position.y=.018;grid.material.transparent=true;grid.material.opacity=.22;this.root.add(grid);
  for(const [x,z,w,h,d] of map.blocks){const a=this.box(this.root,w,h,d,x,h/2,z,wall);this.occluders.push(a);this.box(this.root,w+.25,.18,d+.25,x,h+.09,z,roof);if(w>=6)this.box(this.root,w*.35,.09,.25,x,h+.22,z+d/2,orange);}
  for(const [x,z] of map.crates){this.occluders.push(this.box(this.root,2.7,2.35,2.7,x,1.175,z,crate));this.box(this.root,2.85,.16,2.85,x,2.42,z,trim);}
  for(const [x,z,w,h,d] of map.platforms){this.occluders.push(this.box(this.root,w,h,d,x,h/2,z,wall));this.box(this.root,w+.17,.18,d+.17,x,h+.10,z,roof);}
  for(const [x,z] of map.spawn){const pad=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.35,.075,20),new THREE.MeshStandardMaterial({color:'#c56f35',metalness:.5,roughness:.4}));pad.position.set(x,.045,z);this.root.add(pad);}
  const h=map.half-2;
  for(const [x,z] of [[-h,-h],[-h,h],[h,-h],[h,h]]){this.box(this.root,.95,5,.95,x,2.5,z,wall);this.box(this.root,1.25,.35,1.25,x,5.18,z,orange);}
  if(this.id==='yard'){
   // Perimeter is visual; crossing the edge counts as out-of-map as specified.
   for(const [x,z,w,d] of [[0,-map.half,2*map.half,1],[0,map.half,2*map.half,1],[-map.half,0,1,2*map.half],[map.half,0,1,2*map.half]])this.box(this.root,w,1.6,d,x,.8,z,wall);
  }
  if(mode==='practice')this.createTargets(8);
  return this.colliders;
 }
 createTargets(n){for(let i=0;i<n;i++){
  const group=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:i%2?'#f1a65c':'#8cc7d0',emissive:i%2?'#ad541b':'#165e6b',emissiveIntensity:.28,metalness:.34,roughness:.25});
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.7,0),mat),ring=new THREE.Mesh(new THREE.TorusGeometry(1.05,.073,6,26),new THREE.MeshBasicMaterial({color:'#f28a32'}));group.add(core,ring);this.root.add(group);
  const t={group,core,ring,base:2.7,phase:i*1.13};this.targets.push(t);this.moveTarget(t);
 }}
 moveTarget(t){const half=MAPS[this.id].half;for(let i=0;i<150;i++){const x=(Math.random()*2-1)*(half-8),z=(Math.random()*2-1)*(half-8);
  if(this.colliders.some(b=>overlaps(x,z,b,2)))continue;
  if(this.targets.some(o=>o!==t&&o.group.position.distanceTo(new THREE.Vector3(x,2.7,z))<5))continue;
  t.base=2.3+Math.random()*1.2;t.group.position.set(x,t.base,z);break;
 }}
 practiceHit(){this.camera.updateMatrixWorld();const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);
  this.raycaster.set(this.camera.position,dir);this.raycaster.far=110;
  const all=this.raycaster.intersectObjects([...this.occluders,...this.targets.map(t=>t.core)],false);
  const hit=all[0];if(!hit)return null;return this.targets.find(t=>t.core===hit.object)||null;
 }
 setWeaponVisual(key){if(!WEAPONS[key])return;this.weaponKey=key;this.disposeGroup(this.weaponGroup);this.weaponGroup.clear();this.equipTime=.45;this.magMesh=null;
  const w=WEAPONS[key],rarity=RARITIES[w.rarity];
  const base=new THREE.MeshStandardMaterial({color:'#3c4651',roughness:.45,metalness:.57,depthTest:false}),dark=new THREE.MeshStandardMaterial({color:'#161d26',roughness:.57,metalness:.4,depthTest:false}),accent=new THREE.MeshStandardMaterial({color:w.rarity==='legendary'?'#bd7a3e':'#cc823e',roughness:.36,metalness:.45,emissive:'#733609',emissiveIntensity:.12,depthTest:false});
  const add=(a,b,c,x,y,z,mat)=>{const m=this.box(this.weaponGroup,a,b,c,x,y,z,mat);m.renderOrder=18;return m;};
  const length=w.kind==='SR'?.96:w.kind==='SG'?.78:w.kind==='SMG'?.48:w.kind==='HG'?.32:.68;
  add(w.kind==='HG'?.2:.24,.18,length,0,0,-length*.25,base);
  this.magMesh=add(.11,.21,.12,0,-.16,.06,dark);
  add(.19,.095,length*.5,0,.115,-length*.3,accent);
  add(.14,.115,length*.22,0,.025,-length*.88,dark);
  if(w.kind!=='HG')this.magMesh=add(.13,.21,.13,0,-.22,-.14,dark);
  if(w.kind==='SR'){add(.1,.095,.25,0,.235,-.32,dark);add(.12,.12,.08,0,.235,-.45,accent);}
  if(w.kind==='SG')add(.26,.1,.36,0,-.08,-.35,base);
  if(w.kind==='SMG')add(.18,.1,.16,0,.15,-.22,dark);
  // Marker stripe: all weapons remain part of the same dark, orange-accented world.
  add(.07,.025,.12,0,.2,-.12,accent);
  this.weaponGroup.userData.rarity=rarity;
 }
 makeAvatar(id,name,color='#e59b60',team=0){if(this.avatars.has(id))return this.avatars.get(id);
  const group=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color,roughness:.7}),trim=new THREE.MeshStandardMaterial({color:team===1?'#6b9acb':team===2?'#e68e57':'#bac4cf',roughness:.7});
  this.box(group,.92,1.0,.5,0,1.0,0,mat);this.box(group,.65,.55,.54,0,1.77,0,trim);
  for(const sign of [-1,1]){this.box(group,.23,.71,.28,sign*.6,1.05,0,mat);this.box(group,.3,.65,.3,sign*.23,.34,0,mat);}
  this.box(group,.43,.10,.045,0,1.81,-.29,new THREE.MeshBasicMaterial({color:'#111c2d'}));
  const shield=new THREE.Mesh(new THREE.TorusGeometry(.85,.025,5,20),new THREE.MeshBasicMaterial({color:'#f28a32',transparent:true,opacity:.6}));shield.rotation.x=Math.PI/2;shield.position.y=1;group.add(shield);
  const a={group,shield,name,team};this.avatarRoot.add(group);this.avatars.set(id,a);return a;
 }
 removeAvatar(id){const a=this.avatars.get(id);if(!a)return;this.avatarRoot.remove(a.group);this.disposeGroup(a.group);this.avatars.delete(id);}
 setAvatar(id,data,alpha=1){const a=this.avatars.get(id);if(!a)return;const p=data.p||data;
  a.group.visible=!(p.respawn>0);if(!a.group.visible)return;
  a.group.position.lerp(new THREE.Vector3(p.x,p.y||0,p.z),alpha);a.group.rotation.y=p.yaw||0;a.group.scale.y=p.slide>0?.72:p.crouch?.85:1;
  a.shield.visible=p.invuln>0;
 }
 setCamera(p,dt=0){this.bob+=Math.hypot(p.vx||0,p.vz||0)*dt*1.25;this.adsAmount+=(Number(!!p.ads)-this.adsAmount)*Math.min(1,dt*13);
  this.crouchAmount+=((p.slide>0?1:p.crouch?.55:0)-this.crouchAmount)*Math.min(1,dt*10);
  const targetY=p.y+1.63-.48*this.crouchAmount;
  this.camera.position.set(p.x,targetY+(p.grounded?Math.sin(this.bob*2)*.015*(p.ads?.35:1):0),p.z);this.camera.rotation.set(p.pitch||0,p.yaw||0,0,'YXZ');
  const fovAdjust=p.ads?(WEAPONS[this.weaponKey]?.kind==='SR'?(this.scope&&this.scope>1?this.fov/this.scope-this.fov:-6):-10):0;
  this.camera.fov+=(this.fov+fovAdjust-this.camera.fov)*Math.min(1,dt*12);this.camera.updateProjectionMatrix();
  this.kick*=Math.exp(-dt*20);this.equipTime=Math.max(0,this.equipTime-dt);
  const reloadTotal=WEAPONS[this.weaponKey]?.reload||2;const reloadProgress=p.reload>0?Math.max(0,1-p.reload/reloadTotal):1;
  const reloadMotion=p.reload>0?Math.sin(Math.PI*reloadProgress):0;const equipMotion=this.equipTime>0?Math.pow(this.equipTime/.45,1.6):0;
  this.weaponGroup.position.set(.35*(1-this.adsAmount)+.04*this.adsAmount,-.33+.16*this.adsAmount-this.kick*.09-.23*reloadMotion-.45*equipMotion,-.67-.09*this.adsAmount);
  this.weaponGroup.rotation.x=this.kick*.14+reloadMotion*.13;this.weaponGroup.rotation.z=Math.sin(this.bob)*.008*(1-this.adsAmount)+reloadMotion*.18;
  if(this.magMesh)this.magMesh.position.y=(WEAPONS[this.weaponKey]?.kind==='HG'?- .16:-.22)-(p.reload>0?Math.max(0,1-Math.abs(reloadProgress-.5)*3)*.28:0);
 }
 fireVisual(){this.kick=Math.min(.75,this.kick+.22);this.flashTime=.08;
  const flash=new THREE.Mesh(new THREE.IcosahedronGeometry(.075,0),new THREE.MeshBasicMaterial({color:'#f7c484',transparent:true,opacity:.85,depthTest:false}));flash.position.set(0,.02,-.77);this.weaponGroup.add(flash);this.effects.push({mesh:flash,time:.08,total:.08,parent:true});
 }
 burst(point,color='#f28a32'){if(!point)return;const mesh=new THREE.Mesh(new THREE.SphereGeometry(.12,7,5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false}));mesh.position.copy(point);this.scene.add(mesh);this.effects.push({mesh,time:.28,total:.28});}
 burstForward(distance=30,color='#f28a32'){this.camera.updateMatrixWorld();const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);this.burst(this.camera.position.clone().addScaledVector(dir,Math.min(80,distance)),color);}
 update(dt,time){for(const t of this.targets){t.group.position.y=t.base+Math.sin(time*1.7+t.phase)*.15;t.core.rotation.y+=dt;t.ring.rotation.z+=dt*.35;}
  for(let i=this.effects.length-1;i>=0;i--){const f=this.effects[i];f.time-=dt;f.mesh.scale.setScalar(1+(1-f.time/f.total)*2.4);f.mesh.material.opacity=Math.max(0,f.time/f.total);
   if(f.time<=0){if(f.parent)this.weaponGroup.remove(f.mesh);else this.scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();this.effects.splice(i,1);}}
  this.renderer.render(this.scene,this.camera);
 }
}
