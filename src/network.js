export class Network{
  constructor(){this.ws=null;this.room=null;this.playerId=null;this.connected=false;this.lastMessage='';this.session='';try{this.session=sessionStorage.getItem('blockdash_session')||'';}catch{}}
  connect(address,{name,mode,map,tool,room,privacy},handlers){
    return new Promise((resolve,reject)=>{
      if(!/^wss?:\/\//.test(address))return reject(new Error('서버 주소는 wss:// 또는 ws://로 시작해야 합니다.'));
      if(location.protocol==='https:'&&!address.startsWith('wss://'))return reject(new Error('HTTPS 사이트에서는 보안 연결(wss://)이 필요합니다.'));
      const ws=new WebSocket(address);this.ws=ws;this.handlers=handlers;let settled=false;
      const timeout=setTimeout(()=>{if(!settled){settled=true;ws.close();reject(new Error('서버 응답 시간이 초과됐습니다.'));}},9000);
      ws.addEventListener('open',()=>this.send({type:'join',name,mode,map,tool,room:room||'',privacy,session:this.session}));
      ws.addEventListener('message',event=>{
        let msg;try{msg=JSON.parse(event.data);}catch{return;}
        if(msg.type==='joined'){
          this.room=msg.room;this.playerId=msg.id;this.session=msg.session;this.connected=true;
          try{sessionStorage.setItem('blockdash_session',this.session);}catch{}
          clearTimeout(timeout);if(!settled){settled=true;resolve(msg);}this.handlers?.onJoined?.(msg);
        }else if(msg.type==='error'){
          this.lastMessage=msg.message;
          if(!settled){clearTimeout(timeout);settled=true;reject(new Error(msg.message));ws.close();}
          else this.handlers?.onError?.(msg.message);
        }else if(msg.type==='state')this.handlers?.onState?.(msg);
        else if(msg.type==='event')this.handlers?.onEvent?.(msg);
        else if(msg.type==='room')this.handlers?.onRoom?.(msg);
      });
      ws.addEventListener('close',()=>{clearTimeout(timeout);this.connected=false;if(!settled){settled=true;reject(new Error('서버 연결이 종료됐습니다.'));}this.handlers?.onClose?.();});
      ws.addEventListener('error',()=>{if(!settled){settled=true;clearTimeout(timeout);reject(new Error('서버에 연결할 수 없습니다.'));}});
    });
  }
  send(data){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(data));}
  close(){const ws=this.ws;this.ws=null;this.connected=false;if(ws){ws.onclose=null;ws.close();}this.room=null;this.playerId=null;}
}
