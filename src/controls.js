import {clamp} from '../shared/rules.js';

export class Controls{
  constructor(canvas,settings){
    this.canvas=canvas;this.settings=settings;this.touchDevice=matchMedia('(pointer:coarse)').matches;
    this.keys=new Set();this.active=false;this.downTag=false;this.lookX=0;this.lookY=0;
    this.joystick={x:0,y:0,id:null};this.lookId=null;this.lookPos={x:0,y:0};this.tagId=null;this.tagPos={x:0,y:0};
    this.jumpQueued=false;this.slideQueued=false;this.toolQueued=false;this.mouseDragging=false;
    this.joyZone=document.querySelector('#joy-zone');this.joyRing=document.querySelector('#joy-ring');this.knob=document.querySelector('#joy-knob');
    this.lookZone=document.querySelector('#look-zone');this.tagButton=document.querySelector('#tag-button');
    window.addEventListener('keydown',event=>{
      if(!this.active)return;
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
      this.keys.add(event.code);
      if(event.code==='Space'&&!event.repeat)this.jumpQueued=true;
      if(event.code==='KeyC'&&!event.repeat)this.slideQueued=true;
      if(['Digit1','Digit2','Digit3'].includes(event.code)&&!event.repeat)this.onSelectTool?.(Number(event.code.slice(5))-1);
      if(event.code==='KeyQ'&&!event.repeat)this.toolQueued=true;
      if(event.code==='Escape')this.onPause?.();
      if(event.code==='Tab'){event.preventDefault();this.onScoreboard?.(true);}
    });
    window.addEventListener('keyup',event=>{this.keys.delete(event.code);if(event.code==='Tab')this.onScoreboard?.(false);});
    window.addEventListener('blur',()=>{this.keys.clear();this.downTag=false;if(this.active)this.onPause?.();});
    window.addEventListener('mousemove',event=>{
      if(!this.active||this.touchDevice)return;
      if(document.pointerLockElement===canvas||this.mouseDragging)this.look(event.movementX,event.movementY,this.settings.mouseSensitivity);
    });
    canvas.addEventListener('pointerdown',event=>{
      if(!this.active||this.touchDevice)return;
      if(document.pointerLockElement!==canvas){this.mouseDragging=true;canvas.requestPointerLock?.()?.catch?.(()=>{});}
      if(event.button===0){this.downTag=true;this.onTag?.();}
    });
    window.addEventListener('pointerup',event=>{if(event.button===0)this.downTag=false;this.mouseDragging=false;});
    document.addEventListener('pointerlockchange',()=>{
      if(this.active&&!this.touchDevice&&document.pointerLockElement!==canvas){this.mouseDragging=false;this.onPause?.();}
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active)this.onPause?.();});
    document.addEventListener('contextmenu',event=>{if(this.active)event.preventDefault();});
    this.bindTouch();
  }
  look(x,y,multiplier=1){this.lookX-=x*.00235*multiplier;this.lookY-=y*.00235*multiplier;}
  takeLook(){const v={x:this.lookX,y:this.lookY};this.lookX=0;this.lookY=0;return v;}
  start(){this.active=true;this.keys.clear();document.querySelector('#mobile-controls').hidden=!this.touchDevice;
    if(!this.touchDevice&&document.pointerLockElement!==this.canvas)this.canvas.requestPointerLock?.()?.catch?.(()=>{});
  }
  stop(){this.active=false;this.keys.clear();this.downTag=false;this.resetTouch();document.querySelector('#mobile-controls').hidden=true;
    if(document.pointerLockElement===this.canvas)document.exitPointerLock?.();}
  resetTouch(){this.joystick={x:0,y:0,id:null};this.lookId=null;this.tagId=null;this.downTag=false;this.jumpQueued=false;this.slideQueued=false;this.knob.style.transform='translate(0,0)';}
  input(){
    const key=k=>this.keys.has(k);
    const forward=(key('KeyW')||key('ArrowUp')?1:0)-(key('KeyS')||key('ArrowDown')?1:0)-this.joystick.y;
    const strafe=(key('KeyD')||key('ArrowRight')?1:0)-(key('KeyA')||key('ArrowLeft')?1:0)+this.joystick.x;
    const value={forward:clamp(forward,-1,1),strafe:clamp(strafe,-1,1),sprint:key('ShiftLeft')||key('ShiftRight')||this.touchDevice&&Math.hypot(this.joystick.x,this.joystick.y)>.82,
      jump:this.jumpQueued||key('Space'),slide:this.slideQueued||key('KeyC'),tag:this.downTag,change:this.toolQueued};
    this.jumpQueued=false;this.slideQueued=false;this.toolQueued=false;return value;
  }
  setJoy(point){
    const r=this.joyRing.getBoundingClientRect(),max=r.width*.31;
    let x=(point.clientX-r.left-r.width/2)/max,y=(point.clientY-r.top-r.height/2)/max;
    const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
    this.joystick.x=x;this.joystick.y=y;this.knob.style.transform=`translate(${x*max}px,${y*max}px)`;
  }
  bindTouch(){
    const process=(element,handlers)=>{
      for(const [name,fn] of Object.entries(handlers))element.addEventListener(name,e=>{
        if(!this.active)return;
        e.preventDefault();
        for(const t of e.changedTouches)fn(t);
      },{passive:false});
    };
    const releaseJoy=id=>{if(id===this.joystick.id){this.joystick.id=null;this.joystick.x=0;this.joystick.y=0;this.knob.style.transform='translate(0,0)';}};
    const releaseLook=id=>{if(id===this.lookId)this.lookId=null;};
    const releaseTag=id=>{if(id===this.tagId){this.tagId=null;this.downTag=false;}};
    process(this.joyZone,{
      touchstart:t=>{if(this.joystick.id===null){this.joystick.id=t.identifier;this.setJoy(t);}},
      touchmove:t=>{if(this.joystick.id===t.identifier)this.setJoy(t);},
      touchend:t=>releaseJoy(t.identifier),touchcancel:t=>releaseJoy(t.identifier)
    });
    process(this.lookZone,{
      touchstart:t=>{if(this.lookId===null){this.lookId=t.identifier;this.lookPos={x:t.clientX,y:t.clientY};}},
      touchmove:t=>{if(this.lookId===t.identifier){this.look(t.clientX-this.lookPos.x,t.clientY-this.lookPos.y,this.settings.touchSensitivity*1.8);this.lookPos={x:t.clientX,y:t.clientY};}},
      touchend:t=>releaseLook(t.identifier),touchcancel:t=>releaseLook(t.identifier)
    });
    process(this.tagButton,{
      touchstart:t=>{if(this.tagId===null){this.tagId=t.identifier;this.tagPos={x:t.clientX,y:t.clientY};this.downTag=true;this.onTag?.();}},
      touchmove:t=>{if(this.tagId===t.identifier){this.look(t.clientX-this.tagPos.x,t.clientY-this.tagPos.y,this.settings.touchSensitivity*1.8);this.tagPos={x:t.clientX,y:t.clientY};}},
      touchend:t=>releaseTag(t.identifier),touchcancel:t=>releaseTag(t.identifier)
    });
    process(document.querySelector('#jump-button'),{touchstart:()=>{this.jumpQueued=true;}});
    process(document.querySelector('#slide-button'),{touchstart:()=>{this.slideQueued=true;}});
    process(document.querySelector('#change-button'),{touchstart:()=>{this.toolQueued=true;}});
    // Pointer Events fallback for touchscreen browsers without Touch Events.
    if(!('ontouchstart' in window)){
      for(const [el,kind] of [[this.joyZone,'joy'],[this.lookZone,'look'],[this.tagButton,'tag']]){
        el.addEventListener('pointerdown',e=>{if(!this.active)return;e.preventDefault();el.setPointerCapture(e.pointerId);
          if(kind==='joy'){this.joystick.id=e.pointerId;this.setJoy(e);}else if(kind==='look'){this.lookId=e.pointerId;this.lookPos={x:e.clientX,y:e.clientY};}else{this.tagId=e.pointerId;this.tagPos={x:e.clientX,y:e.clientY};this.downTag=true;this.onTag?.();}
        });
        el.addEventListener('pointermove',e=>{if(!this.active)return;if(kind==='joy'&&e.pointerId===this.joystick.id)this.setJoy(e);else if(kind==='look'&&e.pointerId===this.lookId){this.look(e.clientX-this.lookPos.x,e.clientY-this.lookPos.y,this.settings.touchSensitivity*1.8);this.lookPos={x:e.clientX,y:e.clientY};}else if(kind==='tag'&&e.pointerId===this.tagId){this.look(e.clientX-this.tagPos.x,e.clientY-this.tagPos.y,this.settings.touchSensitivity*1.8);this.tagPos={x:e.clientX,y:e.clientY};}});
        for(const kindEvent of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(kindEvent,e=>{if(kind==='joy')releaseJoy(e.pointerId);else if(kind==='look')releaseLook(e.pointerId);else releaseTag(e.pointerId);});
      }
      document.querySelector('#jump-button').addEventListener('pointerdown',()=>{this.jumpQueued=true;});
      document.querySelector('#slide-button').addEventListener('pointerdown',()=>{this.slideQueued=true;});
      document.querySelector('#change-button').addEventListener('pointerdown',()=>{this.toolQueued=true;});
    }
  }
}
