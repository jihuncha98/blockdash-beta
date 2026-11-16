import crypto from 'node:crypto';
// Narrow WebSocket implementation for short text game messages; no external npm dependency.
const MAGIC='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frame(op,payload=Buffer.alloc(0)){
  const data=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));
  const header=data.length<126?Buffer.from([0x80|op,data.length]):Buffer.from([0x80|op,126,data.length>>8,data.length&255]);
  return Buffer.concat([header,data]);
}
export class Socket{
  constructor(socket,head=Buffer.alloc(0)){
    this.socket=socket;this.buf=Buffer.alloc(0);this.closed=false;this.lastSeen=Date.now();this.sendQueue=0;
    socket.on('data',chunk=>this.consume(chunk));socket.on('error',()=>this.close());socket.on('close',()=>this.close());
    if(head.length)this.consume(head);
  }
  consume(chunk){
    if(this.closed)return;
    if(this.buf.length+chunk.length>40000)return this.close(1009);
    this.buf=Buffer.concat([this.buf,chunk]);
    for(let frames=0;frames<20;frames++){
      if(this.buf.length<2)return;
      const a=this.buf[0],b=this.buf[1],fin=(a&0x80)!==0,opcode=a&15,masked=(b&0x80)!==0;
      let length=b&0x7f,offset=2;
      if(length===126){if(this.buf.length<4)return;length=this.buf.readUInt16BE(2);offset=4;}
      else if(length===127){return this.close(1009);} // short text only
      if(!masked||!fin||length>8192)return this.close(1002);
      if(this.buf.length<offset+4+length)return;
      const mask=this.buf.subarray(offset,offset+4),bytes=Buffer.from(this.buf.subarray(offset+4,offset+4+length));
      this.buf=this.buf.subarray(offset+4+length);
      for(let i=0;i<length;i++)bytes[i]^=mask[i%4];
      this.lastSeen=Date.now();
      if(opcode===8)return this.close();
      if(opcode===9){this.write(frame(10,bytes));continue;}
      if(opcode===10)continue;
      if(opcode!==1)return this.close(1003);
      try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);this.onMessage?.(JSON.parse(text));}catch{this.send({type:'error',message:'올바르지 않은 메시지 형식'});}
      if(this.closed)return;
    }
  }
  write(data){if(this.closed||this.socket.destroyed)return; if(this.socket.writableLength>250000)return this.close(1009);this.socket.write(data);}
  send(payload){this.write(frame(1,JSON.stringify(payload)));}
  ping(){this.write(frame(9));}
  close(code=1000){
    if(this.closed)return;this.closed=true;
    try{if(!this.socket.destroyed)this.socket.end(frame(8,Buffer.from([code>>8,code&255])));}catch{}
    this.onClose?.();
  }
}
export function upgradeWebSocket(request,socket,head){
  const key=request.headers['sec-websocket-key'];
  if(request.headers.upgrade?.toLowerCase()!=='websocket'||request.headers['sec-websocket-version']!=='13'||typeof key!=='string'||!/^[-+/_=\w]{24}$/.test(key)){
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return null;
  }
  const accept=crypto.createHash('sha1').update(key+MAGIC).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  return new Socket(socket,head);
}
