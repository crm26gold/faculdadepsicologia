import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveVoiceConnection } from '../src/lib/voice/client';
for (const budgetDenied of [false, true]) test(budgetDenied ? 'limite da Jornada encerra o início OpenAI sem tentar outra empresa' : 'SDP recusado usa a próxima empresa antes de iniciar e preserva o microfone compartilhado', async () => {
  const names = ['window','RTCPeerConnection','Audio','WebSocket','fetch'] as const;
  const originals = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis,name)]));
  let trackStops = 0, peerCloses = 0, credentialCalls = 0;
  const tracks = [{stop:()=>{trackStops++;}}];
  const states: string[] = [], notices: string[] = [], skips: string[][] = [];
  class Peer {
    iceGatheringState='complete'; localDescription={sdp:'v=0 synthetic'};
    ontrack=null; onconnectionstatechange=null;
    addTrack() {} createDataChannel() { return {readyState:'open',onmessage:null,onclose:null,close(){},send(){}}; }
    async createOffer() { return {type:'offer',sdp:'v=0 synthetic'}; } async setLocalDescription() {}
    close() { peerCloses++; }
  }
  class Audio { autoplay=false;srcObject=null; setAttribute(){} pause(){} }
  class Socket {
    static OPEN=1; readyState=1; onopen:(()=>void)|null=null; onclose:unknown;onerror:unknown;onmessage:((event:{data:string})=>void)|null=null;
    constructor() { queueMicrotask(()=>this.onopen?.()); }
    send(text:string) { if(JSON.parse(text).setup) queueMicrotask(()=>this.onmessage?.({data:'{"setupComplete":{}}'})); } close(){}
  }
  Object.defineProperties(globalThis, {window:{value:{RTCPeerConnection:Peer},configurable:true}, RTCPeerConnection:{value:Peer,configurable:true},
    Audio:{value:Audio,configurable:true}, WebSocket:{value:Socket,configurable:true}, fetch:{value:async()=>Response.json(budgetDenied ? {error:'Limite da Jornada.',code:'jornada_budget_exceeded'} : {error:'A OpenAI não aceitou a preparação da chamada.'},{status:budgetDenied?429:502}),configurable:true}});
  const connection = new LiveVoiceConnection({credentials:async(_signal, skip=[])=>{ credentialCalls++;skips.push(skip); return { provider:skip.includes('openai')?'gemini':'openai', token:'synthetic',model:'synthetic',maxSeconds:1200,expiresAt:new Date(Date.now()+60_000).toISOString(),fallback:true};},
    state:state=>states.push(state),level:()=>{},transcript:()=>{},tool:async()=>({}),notice:message=>notices.push(message)});
  const internal = connection as unknown as {stream:unknown;capture:unknown;connect:()=>Promise<void>};
  internal.stream={getAudioTracks:()=>tracks,getTracks:()=>tracks}; internal.capture={disconnect(){},port:{onmessage:null}};
  try {
    await internal.connect();
    if(budgetDenied) {
      assert.equal(credentialCalls,1);assert.deepEqual(skips,[[]]);assert.equal(trackStops,1);
      assert.ok(states.includes('error'));assert.ok(!notices.some(message=>message.includes('Tentando a próxima opção')));return;
    }
    for(let index=0;index<50 && !states.includes('listening');index++) await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(credentialCalls,2);assert.deepEqual(skips,[[],['openai']]);assert.equal(peerCloses,1);assert.equal(trackStops,0);
    assert.ok(states.includes('listening'));assert.ok(notices.some(message=>message.includes('Tentando a próxima opção')));
    connection.end();assert.equal(trackStops,1);
  } finally {
    connection.end();for(const name of names) {const original=originals[name];if(original)Object.defineProperty(globalThis,name,original);else Reflect.deleteProperty(globalThis,name);}
  }
});
