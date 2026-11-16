import {clamp} from '../shared/rules.js';
const editableIds=['joy-zone','fire-button','ads-button','jump-button','slide-button','crouch-button','reload-button','swap-button','scope-button'];
export class Controls{
 constructor(canvas,settings){
  this.canvas=canvas;this.settings=settings;this.touchDevice=matchMedia('(any-pointer: coarse)').matches||navigator.maxTouchPoints>0;
  this.active=false;this.editing=false;this.keys=new Set();this.fireDown=false;this.adsDown=false;this.lookX=0;this.lookY=0;
  this.joystick={id:null,x:0,y:0};this.lookPointer=null;this.lookLast={x:0,y:0};this.aimPointer=null;this.aimLast={x:0,y:0};
  this.jumpQueued=false;this.slideQueued=false;this.reloadQueued=false;this.swapQueued=false;this.scopeQueued=false;
  this.joyZone=document.getElementById('joy-zone');this.joyRing=document.getElementById('joy-ring');this.joyKnob=document.getElementById('joy-knob');this.lookZone=document.getElementById('look-zone');
  this.mobile=document.getElementById('mobile-controls');this.layout=this.loadLayout();this.applyLayout();this.bindKeyboard();this.bindPointer();
 }
 loadLayout(){try{return JSON.parse(localStorage.getItem('blockdash_touch_layout_v2'))||{};}catch{return {};}}
 saveLayout(){try{localStorage.setItem('blockdash_touch_layout_v2',JSON.stringify(this.layout));}catch{}}
 applyLayout(){for(const id of editableIds){const pos=this.layout[id],el=document.getElementById(id);if(!pos||!el)continue;
  el.style.left=`${pos.x}%`;el.style.top=`${pos.y}%`;el.style.right='auto';el.style.bottom='auto';el.style.transform=`translate(-50%,-50%) scale(${pos.scale||1})`;
 }}
 bindKeyboard(){window.addEventListener('keydown',e=>{if(!this.active)return;
  if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  this.keys.add(e.code);if(e.repeat)return;
  if(e.code==='Space')this.jumpQueued=true;if(e.code==='KeyC')this.slideQueued=true;
  if(e.code==='KeyR')this.reloadQueued=true;if(e.code==='KeyQ')this.swapQueued=true;
  if(e.code==='KeyV')this.scopeQueued=true;
  if(e.code==='KeyZ')this.onRespawnCycle?.('primary');
  if(e.code==='KeyX')this.onRespawnCycle?.('secondary');
  if(e.code==='Digit1')this.onSlot?.(0);if(e.code==='Digit2')this.onSlot?.(1);
  if(e.code==='Escape')this.onPause?.();if(e.code==='Tab')this.onScoreboard?.(true);
 });
 window.addEventListener('keyup',e=>{this.keys.delete(e.code);if(e.code==='Tab')this.onScoreboard?.(false);});
 window.addEventListener('blur',()=>{this.keys.clear();this.fireDown=false;this.adsDown=false;if(this.active)this.onPause?.();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active)this.onPause?.();});
 document.addEventListener('contextmenu',e=>{if(this.active)e.preventDefault();});
 }
 bindPointer(){
  window.addEventListener('mousemove',e=>{if(!this.active||this.touchDevice)return;if(document.pointerLockElement===this.canvas)this.look(e.movementX,e.movementY,this.settings.mouseSensitivity);});
  this.canvas.addEventListener('pointerdown',e=>{if(!this.active||this.touchDevice)return;if(document.pointerLockElement!==this.canvas)this.canvas.requestPointerLock?.()?.catch?.(()=>{});
   if(e.button===0){this.fireDown=true;this.onFire?.();}if(e.button===2)this.adsDown=true;});
  window.addEventListener('pointerup',e=>{if(e.button===0)this.fireDown=false;if(e.button===2)this.adsDown=false;});
  document.addEventListener('pointerlockchange',()=>{if(this.active&&!this.touchDevice&&document.pointerLockElement!==this.canvas)this.onPause?.();});
  const on=(el,type,fn)=>el.addEventListener(type,e=>{if(!this.active)return;e.preventDefault();fn(e);},{passive:false});
  on(this.joyZone,'pointerdown',e=>{if(this.joystick.id!==null)return;this.joystick.id=e.pointerId;this.joyZone.setPointerCapture(e.pointerId);this.moveJoy(e);});
  on(this.joyZone,'pointermove',e=>{if(e.pointerId===this.joystick.id)this.moveJoy(e);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])on(this.joyZone,name,e=>{if(e.pointerId===this.joystick.id){this.joystick={id:null,x:0,y:0};this.joyKnob.style.transform='translate(0,0)';}});
  on(this.lookZone,'pointerdown',e=>{if(this.lookPointer===null){this.lookPointer=e.pointerId;this.lookLast={x:e.clientX,y:e.clientY};this.lookZone.setPointerCapture(e.pointerId);}});
  on(this.lookZone,'pointermove',e=>{if(e.pointerId!==this.lookPointer)return;this.look(e.clientX-this.lookLast.x,e.clientY-this.lookLast.y,this.settings.touchSensitivity*1.65);this.lookLast={x:e.clientX,y:e.clientY};});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])on(this.lookZone,name,e=>{if(e.pointerId===this.lookPointer)this.lookPointer=null;});
  const fire=document.getElementById('fire-button');on(fire,'pointerdown',e=>{this.fireDown=true;this.onFire?.();this.aimPointer=e.pointerId;this.aimLast={x:e.clientX,y:e.clientY};fire.setPointerCapture(e.pointerId);});
  on(fire,'pointermove',e=>{if(e.pointerId!==this.aimPointer)return;this.look(e.clientX-this.aimLast.x,e.clientY-this.aimLast.y,this.settings.touchSensitivity*1.65);this.aimLast={x:e.clientX,y:e.clientY};});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])on(fire,name,e=>{if(e.pointerId===this.aimPointer){this.fireDown=false;this.aimPointer=null;}});
  const ads=document.getElementById('ads-button');on(ads,'pointerdown',e=>{this.adsDown=true;ads.setPointerCapture(e.pointerId);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])on(ads,name,()=>{this.adsDown=false;});
  for(const [id,key] of [['jump-button','jumpQueued'],['slide-button','slideQueued'],['reload-button','reloadQueued'],['swap-button','swapQueued'],['scope-button','scopeQueued']])on(document.getElementById(id),'pointerdown',()=>{this[key]=true;});
  const crouch=document.getElementById('crouch-button');on(crouch,'pointerdown',e=>{this.crouchDown=true;crouch.setPointerCapture(e.pointerId);});for(const name of ['pointerup','pointercancel','lostpointercapture'])on(crouch,name,()=>this.crouchDown=false);
 }
 moveJoy(e){const r=this.joyRing.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,radius=r.width*.3;
  let x=(e.clientX-cx)/radius,y=(e.clientY-cy)/radius;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}this.joystick.x=x;this.joystick.y=y;this.joyKnob.style.transform=`translate(${x*radius}px,${y*radius}px)`;
 }
 look(x,y,m=1){this.lookX-=x*.00235*m;this.lookY-=y*.00235*m;}
 takeLook(){const result={x:this.lookX,y:this.lookY};this.lookX=0;this.lookY=0;return result;}
 input(){const key=k=>this.keys.has(k),f=(Number(key('KeyW')||key('ArrowUp'))-Number(key('KeyS')||key('ArrowDown'))-this.joystick.y),s=(Number(key('KeyD')||key('ArrowRight'))-Number(key('KeyA')||key('ArrowLeft'))+this.joystick.x);
  const out={forward:clamp(f,-1,1),strafe:clamp(s,-1,1),sprint:key('ShiftLeft')||key('ShiftRight')||(this.touchDevice&&Math.hypot(this.joystick.x,this.joystick.y)>.82),
   crouch:key('ControlLeft')||key('ControlRight')||!!this.crouchDown,ads:this.adsDown,fire:this.fireDown,
   jump:this.jumpQueued,slide:this.slideQueued,reload:this.reloadQueued,swap:this.swapQueued,scope:this.scopeQueued};
  this.jumpQueued=false;this.slideQueued=false;this.reloadQueued=false;this.swapQueued=false;this.scopeQueued=false;return out;
 }
 start(){this.editing=false;this.active=true;this.keys.clear();this.mobile.hidden=!this.touchDevice;
  if(!this.touchDevice)this.canvas.requestPointerLock?.()?.catch?.(()=>{});
 }
 stop(){this.active=false;this.keys.clear();this.fireDown=false;this.adsDown=false;this.crouchDown=false;this.joystick={id:null,x:0,y:0};this.joyKnob.style.transform='translate(0,0)';this.mobile.hidden=true;
  if(document.pointerLockElement===this.canvas)document.exitPointerLock?.();}
 beginEdit(onDone){this.stop();this.editing=true;this.mobile.hidden=false;this.mobile.classList.add('editing');document.getElementById('edit-control-bar').hidden=false;
  let selected=editableIds[0];const choose=id=>{selected=id;for(const key of editableIds)document.getElementById(key).classList.toggle('selected',key===id);};choose(selected);
  const move=(e,id)=>{if(!this.editing)return;const el=document.getElementById(id),x=clamp(e.clientX/innerWidth*100,5,95),y=clamp(e.clientY/innerHeight*100,5,95);
   const scale=this.layout[id]?.scale||1;this.layout[id]={x,y,scale};this.applyLayout();choose(id);};
  const disposers=[];
  for(const id of editableIds){const el=document.getElementById(id);let pointer=null;
   const down=e=>{e.preventDefault();pointer=e.pointerId;el.setPointerCapture(e.pointerId);move(e,id);};
   const drag=e=>{if(pointer===e.pointerId)move(e,id);};const up=e=>{if(pointer===e.pointerId){pointer=null;this.saveLayout();}};
   el.addEventListener('pointerdown',down);el.addEventListener('pointermove',drag);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
   disposers.push(()=>{el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',drag);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);});
  }
  const resize=delta=>{const el=document.getElementById(selected),rect=el.getBoundingClientRect(),old=this.layout[selected]||{x:(rect.left+rect.width/2)/innerWidth*100,y:(rect.top+rect.height/2)/innerHeight*100,scale:1};
   old.scale=clamp((old.scale||1)+delta,.65,1.55);this.layout[selected]=old;this.applyLayout();this.saveLayout();};
  const down=()=>resize(-.1),up=()=>resize(.1);document.getElementById('size-down').addEventListener('click',down);document.getElementById('size-up').addEventListener('click',up);
  document.getElementById('edit-control-done').onclick=()=>{this.editing=false;this.mobile.classList.remove('editing');this.mobile.hidden=true;document.getElementById('edit-control-bar').hidden=true;
   document.getElementById('size-down').removeEventListener('click',down);document.getElementById('size-up').removeEventListener('click',up);disposers.forEach(fn=>fn());this.saveLayout();onDone?.();};
 }
}
