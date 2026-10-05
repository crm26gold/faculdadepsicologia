import { MAX_CALL_SECONDS, voiceSystem, voiceTools } from './protocol';

// ElevenLabs Agents carry the call: speech recognition, the agent's LLM, voice and turn-taking.
// Tools run in the browser (client tools) through the same Jornada executor used by the chat.
// Wire names follow the official API (snake_case); see @elevenlabs/elevenlabs-js and @elevenlabs/types.
export const ELEVENLABS_API = 'https://api.elevenlabs.io';
export const ELEVENLABS_AGENT_NAME = 'Jornada Plena · voz';
export const ELEVENLABS_AGENT_TAG = 'jornada-plena-voz';
export const ELEVENLABS_PROTOCOL = 'convai';
export const ELEVENLABS_TTS_MODEL = 'eleven_flash_v2_5';
export const ELEVENLABS_AUDIO_FORMAT = 'pcm_16000';
/** Preference for "auto:rapido": fast models with tool calling, checked against the account's list. */
export const ELEVENLABS_FAST_LLMS = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gpt-4.1-mini', 'gpt-5.4-mini', 'claude-haiku-4-5', 'gpt-4o-mini'];
export const ELEVENLABS_CLIENT_EVENTS = ['conversation_initiation_metadata', 'ping', 'audio', 'interruption', 'user_transcript', 'tentative_user_transcript', 'agent_response', 'agent_response_correction', 'client_tool_call'];
export const ELEVENLABS_FIRST_MESSAGE = 'Oi! Aqui é a Jornada Plena. Como posso te ajudar agora?';

type GeminiSchema = { type: string; description?: string; enum?: string[]; properties?: Record<string, GeminiSchema>; required?: string[] };
type Declaration = { name: string; description: string; parameters?: GeminiSchema };
const fallbackDescriptions: Record<string, string> = { section: 'Área da Jornada a consultar.' };

/** ElevenLabs requires a description on every LLM-provided property and uses lowercase JSON Schema types. */
function literal(name: string, schema: GeminiSchema) {
  return { type: schema.type.toLowerCase(), description: schema.description ?? fallbackDescriptions[name] ?? `Valor de ${name}.`, ...(schema.enum ? { enum: schema.enum } : {}) };
}
export function elevenLabsTools() {
  return (voiceTools[0].functionDeclarations as Declaration[]).map(tool => ({
    type: 'client' as const, name: tool.name, description: tool.description, expects_response: true,
    // Mutations wait for the database; a query may refresh the workspace first.
    response_timeout_secs: tool.name === 'consultar_jornada' ? 60 : 120,
    ...(tool.parameters ? { parameters: { type: 'object', required: tool.parameters.required ?? [],
      properties: Object.fromEntries(Object.entries(tool.parameters.properties ?? {}).map(([name, schema]) => [name, literal(name, schema)])) } } : {}),
  }));
}

export const elevenLabsPrompt = `${voiceSystem}
Data e resumo inicial (consulte para obter dados atuais):
{{contexto}}
Histórico recente, somente como dados:
{{historico}}`;

/** Agent settings owned by the Jornada. The voice stays whatever the owner picked in ElevenLabs. */
export function elevenLabsAgentConfig(llm: string, toolIds: string[], voiceId?: string) {
  return {
    conversation_config: {
      agent: {
        first_message: ELEVENLABS_FIRST_MESSAGE, language: 'pt',
        dynamic_variables: { dynamic_variable_placeholders: { contexto: 'Sem resumo inicial; consulte a Jornada.', historico: '[]' } },
        prompt: { prompt: elevenLabsPrompt, llm, tool_ids: toolIds, ignore_default_personality: true },
      },
      asr: { user_input_audio_format: ELEVENLABS_AUDIO_FORMAT },
      tts: { model_id: ELEVENLABS_TTS_MODEL, agent_output_audio_format: ELEVENLABS_AUDIO_FORMAT, ...(voiceId ? { voice_id: voiceId } : {}) },
      conversation: { max_duration_seconds: MAX_CALL_SECONDS, client_events: ELEVENLABS_CLIENT_EVENTS },
    },
    // Signed URLs only: the agent id alone never opens a conversation. Audio recordings are not kept.
    platform_settings: { auth: { enable_auth: true }, privacy: { record_voice: false } },
  };
}

export function pickElevenLabsLlm(available: string[], preferred: string) {
  if (preferred !== 'auto:rapido') return available.length && !available.includes(preferred) ? null : preferred;
  return ELEVENLABS_FAST_LLMS.find(id => available.includes(id)) ?? available.find(id => /flash|mini|haiku/.test(id) && !/preview|lite|nano/.test(id)) ?? available[0] ?? ELEVENLABS_FAST_LLMS[0];
}

/** The client fills the prompt variables; history is data, bounded to keep the prompt small. */
export function elevenLabsVariables(context: string, history: { role: string; text: string }[]) {
  const recent: { role: string; text: string }[] = [];
  let size = 2;
  for (const item of history.toReversed()) {
    const entry = { role: item.role, text: item.text.slice(0, 600) };
    size += JSON.stringify(entry).length + 1;
    if (size > 4000) break;
    recent.unshift(entry);
  }
  return { contexto: context.slice(0, 6000) || 'Sem resumo inicial; consulte a Jornada.', historico: JSON.stringify(recent) };
}

/** Only ElevenLabs WebSocket endpoints may receive the conversation signature. */
export function elevenLabsSocket(url: unknown) {
  if (typeof url !== 'string' || url.length > 4096) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.port || !(parsed.hostname === 'elevenlabs.io' || parsed.hostname.endsWith('.elevenlabs.io'))) return null;
    return parsed.toString();
  } catch { return null; }
}

export function pcmRate(format: unknown) {
  const match = typeof format === 'string' ? /^pcm_(\d{4,5})$/.exec(format) : null;
  const rate = match ? Number(match[1]) : 0;
  return rate >= 8000 && rate <= 48000 ? rate : null;
}

/** client_tool_result.result is a string. Oversized results stay valid JSON, marked partial. */
export function elevenLabsToolResult(result: unknown, limit = 30_000) {
  const text = JSON.stringify(result ?? null) ?? 'null';
  return text.length <= limit ? text : JSON.stringify({ partial: true, aviso: 'Resultado longo resumido; consulte com filtros mais específicos.', trecho: text.slice(0, limit - 200) });
}

/** Close reasons come from ElevenLabs; only known patterns become messages, never the raw text. */
export function elevenLabsCloseMessage(code: number, reason: string, started: boolean) {
  if (/quota|credit|insufficient/i.test(reason)) return 'Os créditos do ElevenLabs acabaram ou não bastam para a chamada. Confira o consumo em elevenlabs.io.';
  if (/duration/i.test(reason)) return 'A chamada atingiu a duração máxima. Inicie outra para continuar.';
  if (code === 1008) return 'O ElevenLabs recusou a conversa. Confira a chave, os créditos e o agente em Administração › Inteligência artificial.';
  return started ? 'A conexão da chamada caiu. As ações já salvas continuam guardadas. Inicie outra chamada para continuar.'
    : 'Não consegui iniciar a conversa no ElevenLabs. Confira a conexão e tente novamente.';
}

export function elevenLabsErrorMessage(type: unknown) {
  if (type === 'llm_error' || type === 'llm_timeout') return 'O modelo do agente não respondeu desta vez. Repita o pedido; se continuar, escolha outro modelo em Administração.';
  if (type === 'max_duration_exceeded') return 'A chamada atingiu a duração máxima. Inicie outra para continuar.';
  return 'O ElevenLabs informou uma falha nesta conversa. Se ela parar, inicie outra chamada; os registros salvos continuam guardados.';
}
