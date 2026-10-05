import 'server-only';
import { AiError, type AiConfig } from '../ai/providers';
import { runAiAttempts } from '../ai/attempts';
import { MAX_CALL_SECONDS } from './protocol';
import { XAI_LIVE_SOCKET, xaiClientSetup, xaiFailureMessage } from './xai-protocol';

const models = new Set(['grok-voice-latest','grok-voice-think-fast-2.0']);
const reasons = new Set(['rate_limit_exceeded','insufficient_quota','insufficient_credits','payment_required','billing_disabled','authentication_error','permission_denied','invalid_api_key','invalid_request_error','invalid_request']);
export class XaiSessionError extends AiError {
  readonly stage = 'token';
  constructor(readonly diagnostic: { upstreamStatus:number; reason?:string }, message:string, status:number) { super(message,status); }
  get doNotRetry() { return ['rate_limit_exceeded','insufficient_quota','insufficient_credits','payment_required','billing_disabled'].includes(this.diagnostic.reason ?? ''); }
  get retryOnProviderChange() { return this.doNotRetry; }
}
/** Only a five-minute client secret reaches the browser; the permanent key stays in this server call. */
export async function prepareXaiSession(config:AiConfig, options:{signal?:AbortSignal;beforeRetry?:()=>Promise<void>;beforeAttempt?:(candidate:AiConfig,index:number)=>Promise<void>} = {}) {
  return runAiAttempts([config,...(config.alternatives??[]).filter(row=>row.provider==='xai').slice(0,2)],async connection=>{
    const model=connection.model==='auto:rapido'?'grok-voice-latest':connection.model;
    if(!models.has(model)) throw new XaiSessionError({upstreamStatus:400},'Escolha um modelo de voz Grok compatível na tarefa Chamada ao vivo.',400);
    const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(20_000)]):AbortSignal.timeout(20_000);
    let response:Response;
    try { response=await fetch('https://api.x.ai/v1/realtime/client_secrets',{method:'POST',cache:'no-store',redirect:'error',signal,
      headers:{Authorization:`Bearer ${connection.key}`,'Content-Type':'application/json'},body:JSON.stringify({expires_after:{seconds:300}})}); }
    catch {options.signal?.throwIfAborted();throw new XaiSessionError({upstreamStatus:0},xaiFailureMessage(),0);}
    const body=await response.json().catch(()=>null);
    if(!response.ok) {
      const candidate=body?.error?.code??body?.error?.type;
      const reason=typeof candidate==='string'&&reasons.has(candidate)?candidate:undefined;
      throw new XaiSessionError({upstreamStatus:response.status,reason},xaiFailureMessage(reason,response.status),response.status);
    }
    const expiration=Number(body?.expires_at)*1000;
    if(typeof body?.value!=='string'||!/^[A-Za-z0-9._-]{16,2048}$/.test(body.value)||!Number.isFinite(expiration)||expiration<=Date.now()||expiration>Date.now()+600_000)
      throw new XaiSessionError({upstreamStatus:200},'A xAI devolveu uma autorização de voz inválida.',502);
    return {token:body.value as string,model,expiresAt:new Date(expiration).toISOString(),maxSeconds:MAX_CALL_SECONDS};
  },options);
}
/** Probe only the transport/configuration: no microphone, greeting or tool execution. */
export async function checkXaiSession(credentials:{token:string;model:string},signal?:AbortSignal):Promise<{connected:boolean;stage:'setup'|'transport'|'timeout';code?:number;diagnostic?:{reason?:string}}> {
  signal?.throwIfAborted();
  return new Promise(resolve=>{
    const socket=new WebSocket(`${XAI_LIVE_SOCKET}?model=${encodeURIComponent(credentials.model)}`,[`xai-client-secret.${credentials.token}`]);
    let settled=false;
    const finish=(result:Parameters<typeof resolve>[0])=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);socket.onopen=null;socket.onmessage=null;socket.onclose=null;try{socket.close(1000);}catch{}resolve(result);};
    const aborted=()=>finish({connected:false,stage:'timeout'});const timer=setTimeout(aborted,15_000);signal?.addEventListener('abort',aborted,{once:true});
    socket.onopen=()=>socket.send(JSON.stringify(xaiClientSetup(credentials.model)));
    socket.onmessage=async event=>{try{
      const message=JSON.parse(typeof event.data==='string'?event.data:await(event.data as Blob).text());
      if(message.type==='session.updated')finish({connected:true,stage:'setup'});
      else if(message.type==='error'){const reason=message.error?.code??message.error?.type;finish({connected:false,stage:'setup',diagnostic:{reason:reasons.has(reason)?reason:undefined}});}
    }catch{finish({connected:false,stage:'transport'});}};
    socket.onerror=()=>finish({connected:false,stage:'transport'});socket.onclose=event=>finish({connected:false,stage:'setup',code:event.code});
  });
}
