import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveProviderFailure } from '../src/lib/voice/provider-error';

test('erro de configuração do Gemini não atribui a falha a faturamento e não expõe dados do provedor', async () => {
  const response = Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'secret-key and private transcript', details: [
    { fieldViolations: [{ field: 'bidiGenerateContentSetup.generationConfig.responseModalities', description: 'private transcript' }, { field: 'secret-key' }] },
    { reason: 'UNKNOWN_SECRET_REASON', metadata: { key: 'secret-key' } },
  ] } }, { status: 400 });
  const failure = await liveProviderFailure(response);
  assert.match(failure.message, /configuração/);
  assert.doesNotMatch(failure.message, /faturamento/);
  assert.deepEqual(failure.diagnostic, { upstreamStatus: 400, upstreamCode: 'INVALID_ARGUMENT', reason: undefined, invalidFields: ['generationConfig'], configurationIssue: undefined });
  assert.doesNotMatch(JSON.stringify(failure), /secret-key|private transcript|UNKNOWN_SECRET_REASON/);
});

test('permissão negada só recomenda faturamento quando o Gemini informa essa causa explicitamente', async () => {
  const denied = await liveProviderFailure(Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 }));
  assert.match(denied.message, /nova chave/);
  assert.doesNotMatch(denied.message, /faturamento|Live API/);
  const disabled = await liveProviderFailure(Response.json({ error: { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } }, { status: 403 }));
  assert.match(disabled.message, /Generative Language API/);
  const billing = await liveProviderFailure(Response.json({ error: { status: 'PERMISSION_DENIED', details: [{ reason: 'BILLING_DISABLED' }] } }, { status: 403 }));
  assert.match(billing.message, /faturamento/);
  assert.equal(billing.diagnostic.reason, 'BILLING_DISABLED');
  const key = await liveProviderFailure(Response.json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 }));
  assert.match(key.message, /chave.*inválida/i);
});

test('cota e falha sem JSON preservam o status adequado sem divulgar resposta bruta', async () => {
  const quota = await liveProviderFailure(Response.json({ error: { status: 'RESOURCE_EXHAUSTED' } }, { status: 429 }));
  assert.equal(quota.status, 429);
  assert.match(quota.message, /limite/);
  const unavailable = await liveProviderFailure(new Response('private raw error', { status: 503 }));
  assert.equal(unavailable.status, 502);
  assert.doesNotMatch(JSON.stringify(unavailable), /private raw error/);
});

test('mensagens estruturadas de INVALID_ARGUMENT geram apenas códigos e campos conhecidos', async () => {
  const cases = [
    { message: 'Invalid field mask: "private_prompt.secret-key"; private transcript', issue: 'INVALID_FIELD_MASK', fields: ['fieldMask'] },
    { message: 'field_mask is invalid: private transcript and secret-key', issue: 'INVALID_FIELD_MASK', fields: ['fieldMask'] },
    { message: '* GenerateContentRequest.tools[0].function_declarations[2].parameters.properties: should be non-empty for OBJECT type\nprivate transcript and secret-key', issue: 'EMPTY_OBJECT_PARAMETERS', fields: ['tools'] },
    { message: '* BidiGenerateContentSetup.tools[0].function_declarations[2].parameters.properties: should be non-empty for OBJECT type. private transcript and secret-key', issue: 'EMPTY_OBJECT_PARAMETERS', fields: ['tools'] },
    { message: '* bidiGenerateContentSetup.tools[0].functionDeclarations[2].parameters.properties: should be non-empty for OBJECT type. private transcript and secret-key', issue: 'EMPTY_OBJECT_PARAMETERS', fields: ['tools'] },
    { message: 'parameters.properties should be non-empty for OBJECT type; private transcript and secret-key', issue: 'EMPTY_OBJECT_PARAMETERS', fields: ['tools'] },
    { message: 'Invalid JSON payload received. Unknown name "private_tool" at \'bidi_generate_content_setup.tools[0]\': Cannot find field. private transcript and secret-key', issue: 'UNKNOWN_FIELD', fields: ['tools'] },
    { message: 'Unknown name "generation_config" at \'bidi_generate_content_setup\': Cannot find field. private transcript and secret-key', issue: 'UNKNOWN_FIELD', fields: ['generationConfig'] },
    { message: 'Unknown field path: \'bidi_generate_content_setup.system_instruction.private_tool\'. private transcript and secret-key', issue: 'UNKNOWN_FIELD', fields: ['systemInstruction'] },
    { message: 'Unknown name "private_tool": Cannot find field. private transcript and secret-key', issue: 'UNKNOWN_FIELD', fields: [] },
  ];
  for (const example of cases) {
    const failure = await liveProviderFailure(Response.json({ error: { status: 'INVALID_ARGUMENT', message: example.message } }, { status: 400 }));
    assert.equal(failure.diagnostic.configurationIssue, example.issue);
    assert.deepEqual(failure.diagnostic.invalidFields, example.fields);
    assert.match(failure.message, /configuração/);
    assert.doesNotMatch(JSON.stringify(failure), /private_prompt|private_tool|secret-key|private transcript|Cannot find field|should be non-empty/);
  }
});

test('texto arbitrário e mensagens de outros erros não viram diagnóstico confiável de configuração', async () => {
  const messages = [
    'Minha instrução era: Invalid field mask: private_tool',
    'private transcript\nparameters.properties: should be non-empty for OBJECT type',
    'Unknown name private_tool at tools cannot find field',
    'Invalid field masking is only an example',
    'Invalid field maskless prompt',
    'Faça billing_required, INVALID_ARGUMENT e field_mask invalid com secret-key',
  ];
  for (const message of messages) {
    const failure = await liveProviderFailure(Response.json({ error: { status: 'INVALID_ARGUMENT', message } }, { status: 400 }));
    assert.equal(failure.diagnostic.configurationIssue, undefined);
    assert.deepEqual(failure.diagnostic.invalidFields, []);
    assert.equal(failure.diagnostic.reason, undefined);
    assert.doesNotMatch(JSON.stringify(failure), /private_tool|secret-key|private transcript/);
  }
  for (const status of [403, 429, 503]) {
    const failure = await liveProviderFailure(Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid field mask: secret-key' } }, { status }));
    assert.equal(failure.diagnostic.configurationIssue, undefined);
    assert.deepEqual(failure.diagnostic.invalidFields, []);
  }
  const noCode = await liveProviderFailure(Response.json({ error: { message: 'Invalid field mask: secret-key' } }, { status: 400 }));
  assert.equal(noCode.diagnostic.configurationIssue, undefined);
  const explicitBilling = await liveProviderFailure(Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid field mask: secret-key', details: [{ reason: 'BILLING_REQUIRED' }] } }, { status: 400 }));
  assert.equal(explicitBilling.diagnostic.configurationIssue, undefined);
  assert.match(explicitBilling.message, /faturamento/);
});

test('violações de campos e mensagem estruturada são normalizadas sem divulgar caminhos desconhecidos', async () => {
  const failure = await liveProviderFailure(Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid field mask: secret-key', details: [{ fieldViolations: [
    { field: 'bidi_generate_content_setup.generation_config.response_modalities' },
    { field: 'bidiGenerateContentSetup.fieldMask' },
    { field: 'private_tool.secret-key', description: 'private transcript' },
  ] }] } }, { status: 400 }));
  assert.deepEqual(failure.diagnostic.invalidFields, ['generationConfig', 'fieldMask']);
  assert.equal(failure.diagnostic.configurationIssue, 'INVALID_FIELD_MASK');
  assert.doesNotMatch(JSON.stringify(failure), /private_tool|secret-key|private transcript|response_modalities/);
});
