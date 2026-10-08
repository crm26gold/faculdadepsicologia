import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { aiAdminAction, aiProviderIds } from '../src/lib/ai/catalog';
import { pickModel } from '../src/lib/ai/models';
import { publicAddress, publicHttps } from '../src/lib/ai/public-http';
import { credentialIssue } from '../src/lib/ai/credentials';
import { mcpRequest, mcpResult, toolCallResult, toolInventory } from '../src/lib/integrations/mcp-wire';

test('empresas têm IDs próprios e credenciais com metadados independentes', () => {
  for (const provider of ['google_cloud','deepseek','xai','mistral','groq','openrouter']) assert(aiProviderIds.includes(provider as typeof aiProviderIds[number]));
  assert(aiAdminAction.safeParse({ action:'save_connection',id:null,provider:'vertex',label:'Conta 2',enabled:false,position:1,key:'synthetic',gcp_location:'global' }).success);
  assert(!aiAdminAction.safeParse({ action:'save_connection',id:null,provider:'vertex',label:'Conta 2',enabled:false,position:1,key:null,gcp_location:'evil.example/path#' }).success);
  assert(credentialIssue('vertex','{"type":"authorized_user"}'));
  assert(credentialIssue('openai','Bearer secret'));
});
test('endereços privados, reservados e redirecionáveis não são destinos de conectores', async () => {
  for (const address of ['127.0.0.1','10.0.0.2','172.31.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1','2002:7f00:1::']) assert.equal(publicAddress(address),false,address);
  for (const address of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111']) assert.equal(publicAddress(address),true,address);
  for (const url of ['http://example.invalid','https://user:secret@example.invalid','https://example.invalid:444/mcp','https://127.0.0.1/mcp']) await assert.rejects(publicHttps(url,{}));
  const aborted=AbortSignal.abort(); await assert.rejects(publicHttps('https://example.invalid',{ signal:aborted }));
});
test('preferências automáticas reconhecem novas famílias sem preços inventados', () => {
  assert.equal(pickModel('deepseek',['deepseek-v4-flash','deepseek-v4-pro'],'auto:melhor'),'deepseek-v4-pro');
  assert.equal(pickModel('deepseek',['deepseek-flash','deepseek-pro'],'auto:economico'),'deepseek-flash');
  assert.equal(pickModel('xai',['grok-5','grok-5-fast','grok-5-mini','grok-imagine-image'],'auto:rapido'),'grok-5-fast');
  assert.equal(pickModel('mistral',['mistral-large-latest','mistral-small-latest'],'auto:economico'),'mistral-small-latest');
  assert.equal(pickModel('openrouter',['company/model'],'auto:melhor'),null);
});
test('MCP atual transmite contexto por requisição e legado mantém o contrato separado', () => {
  const current=mcpRequest('2026-07-28',2,'tools/list');
  assert.equal(current.params._meta?.['io.modelcontextprotocol/protocolVersion'],'2026-07-28');
  assert.equal(mcpRequest('2025-11-25',2,'tools/list').params._meta,undefined);
  const result=mcpResult('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"agenda.list","description":"Listar"}]}}\n\n',2);
  assert.deepEqual(toolInventory(result),{ tools:[{ name:'agenda.list',description:'Listar',readOnly:false,inputSchema:'' }],hasMore:false });
  const declared=toolInventory({ tools:[{ name:'agenda.list',annotations:{ readOnlyHint:true },inputSchema:{ type:'object',properties:{ day:{ type:'string' } } } },{ name:'agenda.add',annotations:{ readOnlyHint:'yes' },inputSchema:{ type:'object',description:'x'.repeat(5000) } }] }).tools;
  assert.equal(declared[0].readOnly,true);assert.match(declared[0].inputSchema,/"day"/);
  assert.equal(declared[1].readOnly,false,'só true literal conta como só consulta');assert(declared[1].inputSchema.length<4100);
  assert.throws(()=>mcpResult('{"jsonrpc":"2.0","id":2,"error":{"message":"untrusted secret"}}',2),/recusou/);
  assert.throws(()=>mcpResult('{"jsonrpc":"2.0","id":2,"result":{"resultType":"input_required"}}',2),/interação/);
  assert.throws(()=>mcpResult('{"jsonrpc":"2.0","id":3,"result":{}}',2),/válido/);
  const failed=toolCallResult({ isError:true,content:[{ type:'text',text:'y'.repeat(9000) },{ type:'resource',resource:{} }] });
  assert.equal(failed.isError,true);assert(failed.text.length<8100 && failed.text.endsWith('(cortado)'));assert.equal(failed.omitted,1);assert.equal(failed.structured,'');
  assert.deepEqual(toolCallResult(null),{ isError:false,text:'',structured:'',omitted:0 });
  assert(aiAdminAction.safeParse({ action:'call_connector_tool',id:'00000000-0000-4000-8000-000000000001',tool:'agenda.list',arguments:{ day:'2026-10-09' } }).success);
  assert(!aiAdminAction.safeParse({ action:'call_connector_tool',id:'00000000-0000-4000-8000-000000000001',tool:'agenda list',arguments:{} }).success,'nome fora do padrão');
  assert(!aiAdminAction.safeParse({ action:'call_connector_tool',id:'00000000-0000-4000-8000-000000000001',tool:'agenda.list',arguments:[] }).success,'argumentos precisam ser objeto');
  assert(!aiAdminAction.safeParse({ action:'allow_connector_tools',id:'00000000-0000-4000-8000-000000000001',tools:['a','a'] }).success,'ferramenta repetida');
  const bounded=toolInventory({ tools:Array.from({length:60},(_,i)=>({name:`tool_${i}`,description:'x'.repeat(400)})),nextCursor:'next' });
  assert.equal(bounded.tools.length,50);assert.equal(bounded.tools[0].description.length,250);assert(bounded.hasMore);
});
test('adaptadores respeitam endpoints oficiais, formatos e limite de alternativas', () => {
  const child=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','tests/fixtures/ai-provider-contract.mjs'],{ encoding:'utf8',timeout:30_000 });
  assert.equal(child.status,0,child.stderr || child.error?.message || child.stdout);
});
