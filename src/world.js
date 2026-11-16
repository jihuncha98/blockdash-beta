import * as THREE from 'three';
import {MAPS,PARKOUR,rects,overlaps} from '../shared/rules.js';

export class World {
  constructor(canvas,quality='medium'){
    this.canvas=canvas;this.quality=quality;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:quality!=='low',powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.18;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(80,1,.05,180);
    this.camera.rotation.order='YXZ';
    this.toolView=new THREE.Group();this.toolView.position.set(.39,-.35,-.65);this.camera.add(this.toolView);this.scene.add(this.camera);this.setToolVisual('spark');
    this.scene.add(new THREE.HemisphereLight('#e3f3ff','#476078',2.35));
    this.sun=new THREE.DirectionalLight('#ffe6ba',2.2);this.sun.position.set(-22,43,17);this.scene.add(this.sun);
    this.root=new THREE.Group();this.scene.add(this.root);
    this.avatarRoot=new THREE.Group();this.scene.add(this.avatarRoot);
    this.avatars=new Map();this.targetItems=[];this.gateItems=[];this.occluders=[];this.particles=[];
    this.raycaster=new THREE.Raycaster();this.size=0;this.id='yard';this.colliders=[];
    this.resize();window.addEventListener('resize',()=>this.resize());
  }
  resize(){
    const w=Math.max(1,window.innerWidth),h=Math.max(1,window.innerHeight);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
    const cap=this.quality==='low'?1:this.quality==='high'?1.7:1.35;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,cap));
  }
  setQuality(value){this.quality=value;this.resize();}
  setToolVisual(type='spark'){
    if(!this.toolView)return;
    for(const mesh of [...this.toolView.children]){this.toolView.remove(mesh);mesh.geometry?.dispose();mesh.material?.dispose();}
    const palettes={spark:['#424a51','#e68a3e'],prism:['#3d4657','#a18ae5'],pulse:['#4c4540','#f0ac53']};
    const [body,trim]=palettes[type]||palettes.spark;
    const steel=new THREE.MeshStandardMaterial({color:body,metalness:.65,roughness:.38,depthTest:false});
    const accent=new THREE.MeshStandardMaterial({color:trim,metalness:.3,roughness:.35,emissive:trim,emissiveIntensity:.12,depthTest:false});
    const dark=new THREE.MeshStandardMaterial({color:'#151a20',metalness:.45,roughness:.58,depthTest:false});
    const add=(w,h,d,x,y,z,mat)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);o.renderOrder=20;this.toolView.add(o);return o;};
    // Decorative sci-fi tag device: non-functional stylized game geometry.
    add(.24,.18,.67,0,0,-.16,steel);
    add(.19,.09,.3,0,.13,-.13,accent);
    add(.13,.24,.16,.01,-.18,.03,dark);
    add(.22,.07,.2,0,-.11,-.17,steel);
    add(.11,.11,type==='prism'?.53:.32,0,.01,-.57,dark);
    add(.15,.07,.09,0,.13,-.48,accent);
    if(type==='prism'){add(.11,.1,.22,0,.23,-.12,dark);add(.06,.05,.09,0,.3,-.12,accent);}
    if(type==='pulse'){add(.3,.17,.15,0,0,-.45,steel);add(.27,.05,.1,0,.13,-.42,accent);}
    if(type==='spark'){add(.15,.07,.18,0,.14,.08,dark);}
  }
  setFov(value){this.camera.fov=value;this.camera.updateProjectionMatrix();}
  clear(){
    this.root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const a=Array.isArray(o.material)?o.material:[o.material];for(const m of a)m.dispose();}});
    this.root.clear();
    for(const item of this.avatars.values()){this.avatarRoot.remove(item.group);item.group.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
    this.avatars.clear();this.targetItems=[];this.gateItems=[];this.occluders=[];
    for(const fx of this.particles){this.scene.remove(fx.mesh);fx.mesh.geometry.dispose();fx.mesh.material.dispose();}this.particles=[];
  }
  build(id='yard',mode='practice'){
    this.clear();this.id=MAPS[id]?id:'yard';this.colliders=rects(this.id);
    const map=MAPS[this.id];this.scene.background=new THREE.Color(map.sky);this.scene.fog=new THREE.Fog(map.sky,55,132);
    const m=(color,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness:.82,metalness});
    const floorMat=m(map.floor),wallMat=m(this.id==='yard'?'#3e6886':'#485f94'),topMat=m('#82b8cc'),crateMat=m('#edaf78'),accentMat=new THREE.MeshBasicMaterial({color:map.accent});
    const box=(x,y,z,w,h,d,mat,occlude=false)=>{
      const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);o.receiveShadow=true;this.root.add(o);if(occlude)this.occluders.push(o);return o;
    };
    box(0,-.6,0,72,1.2,72,floorMat);
    const grid=new THREE.GridHelper(68,34,'#b7e2e5','#b7e2e5');grid.position.y=.015;grid.material.transparent=true;grid.material.opacity=.3;this.root.add(grid);
    for(const [x,z,w,d] of [[0,-35,72,2],[0,35,72,2],[-35,0,2,72],[35,0,2,72]])box(x,3,z,w,6,d,wallMat,true);
    for(const [x,z,w,h,d] of map.blocks){
      box(x,h/2,z,w,h,d,wallMat,true);box(x,h+.13,z,w+.28,.26,d+.28,topMat);
      // Landmark accents are decorative; colliders follow the main boxes only.
      if(w>=6){box(x,h+.31,z,w*.46,.15,.43,accentMat);}
    }
    for(const [x,z] of map.crates){box(x,1.175,z,2.7,2.35,2.7,crateMat,true);box(x,2.4,z,2.82,.13,2.82,topMat);}
    for(const [x,z,w,h,d] of map.platforms){box(x,h/2,z,w,h,d,topMat,true);box(x,h+.18,z,w+.25,.13,d+.25,accentMat);}
    for(const [x,z] of [[-30,-30],[-30,30],[30,30],[30,-30]]){
      box(x,4.2,z,1.6,8.4,1.6,wallMat,true);box(x,8.7,z,2.2,.55,2.2,accentMat);
    }
    for(const [x,z] of map.spawn){
      const pad=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.3,.11,12),new THREE.MeshStandardMaterial({color:map.accent,transparent:true,opacity:.55}));pad.position.set(x,.06,z);this.root.add(pad);
    }
    if(mode==='practice')this.createTargets(8);
    if(mode==='parkour')this.createGates();
    return this.colliders;
  }
  createTargets(n){
    for(let i=0;i<n;i++){
      const group=new THREE.Group(),color=['#65f3fd','#ffd68b','#c6a8ff','#ff9dc6'][i%4];
      const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.7,0),new THREE.MeshBasicMaterial({color}));
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.03,.075,6,22),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85}));
      group.add(core,ring);this.root.add(group);
      const target={group,core,ring,base:2.6,phase:i*.7};this.targetItems.push(target);this.moveTarget(target);
    }
  }
  moveTarget(target){
    let pos=null;
    for(let i=0;i<180;i++){
      const x=(Math.random()*58)-29,z=(Math.random()*58)-29;
      if(this.colliders.some(b=>overlaps(x,z,b,2)))continue;
      if(this.targetItems.some(t=>t!==target&&t.group.position.distanceTo(new THREE.Vector3(x,2.7,z))<5))continue;
      pos={x,z};break;
    }
    const x=pos?.x??0,z=pos?.z??-30;
    target.base=2.5+Math.random()*1.15;target.group.position.set(x,target.base,z);target.group.visible=true;
  }
  createGates(){
    for(const [i,g] of PARKOUR.entries()){
      const group=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:i?'#91acb9':'#63efca',transparent:true,opacity:.8});
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.65,.12,7,34),mat);ring.rotation.y=Math.PI/2;group.add(ring);
      const n=document.createElement('canvas');n.width=128;n.height=128;const ctx=n.getContext('2d');ctx.fillStyle='#ffffff';ctx.font='bold 78px system-ui';ctx.textAlign='center';ctx.fillText(String(i+1),64,90);
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(n),transparent:true,depthTest:false}));label.scale.set(1.3,1.3,1);label.position.y=2.2;group.add(label);
      group.position.set(g.x,g.y,g.z);this.root.add(group);this.gateItems.push({group,ring});
    }
  }
  updateGates(index){for(const [i,item] of this.gateItems.entries())item.ring.material.color.set(i===index?'#65ffe2':i<index?'#718891':'#c7b4ff');}
  makeAvatar(id,name,color='#f8b467',team=0){
    if(this.avatars.has(id))return this.avatars.get(id);
    const group=new THREE.Group();
    const material=new THREE.MeshStandardMaterial({color,roughness:.68});
    const trim=new THREE.MeshStandardMaterial({color:team===1?'#79cfff':team===2?'#ff9b95':'#e7f3fd',roughness:.65});
    const add=(w,h,d,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);group.add(mesh);return mesh;};
    add(.95,1.03,.52,0,1.02,0,material);add(.67,.58,.55,0,1.83,0,trim);
    add(.24,.73,.32,-.63,1.03,0,material);add(.24,.73,.32,.63,1.03,0,material);
    add(.32,.71,.32,-.25,.33,0,material);add(.32,.71,.32,.25,.33,0,material);
    add(.44,.13,.05,0,1.84,-.29,new THREE.MeshBasicMaterial({color:'#142638'}));
    const avatar={group,id,name,team,base:0,phase:Math.random()*6,visible:true};this.avatarRoot.add(group);this.avatars.set(id,avatar);return avatar;
  }
  removeAvatar(id){const a=this.avatars.get(id);if(a){this.avatarRoot.remove(a.group);a.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.avatars.delete(id);}}
  setAvatar(id,data,alpha=1){
    const av=this.avatars.get(id);if(!av)return;
    av.group.visible=!(data.respawn>0);if(!av.group.visible)return;
    av.group.position.lerp(new THREE.Vector3(data.x,data.y||0,data.z),alpha);
    av.group.rotation.y=data.yaw||0;
    av.group.scale.y=data.slide>0?.72:1;
  }
  tagRay(){
    this.camera.updateMatrixWorld();const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);
    this.raycaster.set(this.camera.position,dir);this.raycaster.far=60;
    const targets=this.targetItems.map(t=>t.core).filter(o=>o.parent.visible);
    const hit=this.raycaster.intersectObjects([...this.occluders,...targets,...[...this.avatars.values()].filter(a=>a.group.visible).flatMap(a=>a.group.children)],false)[0];
    if(!hit)return {type:'none',point:this.camera.position.clone().addScaledVector(dir,32)};
    const target=this.targetItems.find(t=>t.core===hit.object);
    const avatar=[...this.avatars.values()].find(a=>a.group.children.includes(hit.object));
    return {type:target?'target':avatar?'avatar':'wall',target,avatar,point:hit.point};
  }
  burst(point,color='#7ce8f1'){
    const geo=new THREE.SphereGeometry(.2,8,6),mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false});
    const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(point);this.scene.add(mesh);this.particles.push({mesh,time:.3});
  }
  update(dt,time){
    for(const target of this.targetItems){target.group.position.y=target.base+Math.sin(time*1.8+target.phase)*.19;target.core.rotation.y+=dt*1.1;target.ring.rotation.z+=dt*.5;}
    for(const [i,gate] of this.gateItems.entries())gate.ring.rotation.z=Math.sin(time*.8+i)*.06;
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.time-=dt;p.mesh.scale.setScalar(1+(1-p.time/.3)*4);p.mesh.material.opacity=Math.max(0,p.time/.3);if(p.time<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.particles.splice(i,1);}}
    this.renderer.render(this.scene,this.camera);
  }
  setCamera(p){this.camera.position.set(p.x,p.y+(p.slide>0?1.1:1.63),p.z);this.camera.rotation.set(p.pitch||0,p.yaw||0,0,'YXZ');}
}
