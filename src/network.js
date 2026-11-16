export class Network{
 constructor(){this.ws=null;this.room=null;this.playerId='';this.connected=false;this.session='';this.handlers=null;
  try{this.session=sessionStorage.getItem('blockdash_online_session_v2')||'';}catch{}}
 connect(address,{name,mode,map,primary,secondary,room,privacy,teamSize,authToken,bots,difficulty},handlers){return new Promise((resolve,reject)=>{
  if(!/^wss?:\/\//.test(address))return reject(new Error('서버 주소를 확인해줘.'));
  if(location.protocol==='https:'&&!address.startsWith('wss://'))return reject(new Error('HTTPS 페이지에서는 wss:// 연결이 필요해.'));
  this.handlers=handlers;const ws=new WebSocket(address);this.ws=ws;let settled=false;
  const timeout=setTimeout(()=>{if(!settled){settled=true;ws.close();reject(new Error('서버 응답 시간이 초과됐어.'));}},9000);
  ws.addEventListener('open',()=>this.send({type:'join',name,mode,map,primary,secondary,room,privacy,teamSize,authToken,bots,difficulty,session:this.session}));
  ws.addEventListener('message',e=>{let data;try{data=JSON.parse(e.data);}catch{return;}
   if(data.type==='joined'){this.room=data.room;this.playerId=data.id;this.session=data.session;this.connected=true;
    try{sessionStorage.setItem('blockdash_online_session_v2',this.session);}catch{}clearTimeout(timeout);
    if(!settled){settled=true;resolve(data);}handlers?.onJoined?.(data);
   }else if(data.type==='error'){if(!settled){settled=true;clearTimeout(timeout);reject(new Error(data.message));ws.close();}else handlers?.onError?.(data.message);}
   else if(data.type==='state')handlers?.onState?.(data);
   else if(data.type==='event')handlers?.onEvent?.(data);
   else if(data.type==='room')handlers?.onRoom?.(data);
  });
  ws.addEventListener('close',()=>{this.connected=false;clearTimeout(timeout);if(!settled){settled=true;reject(new Error('서버 연결이 끊어졌어.'));}handlers?.onClose?.();});
  ws.addEventListener('error',()=>{if(!settled){settled=true;clearTimeout(timeout);reject(new Error('서버에 연결할 수 없어.'));}});
 });}
 send(obj){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(obj));}
 close(){const old=this.ws;this.ws=null;this.connected=false;this.playerId='';this.room=null;if(old){old.onclose=null;old.close();}}
}
