import { aiCatalog, aiTaskLabels, type AiProviderId, type AiTaskId } from './catalog';
import { declarableProviders, providerCapabilities, resourceName, sourceNamer, type AiResource, type AiResourceMap, type SourceReason } from './resources';

// "Apitou, eu clico e o sistema me guia": every finding in the resource map becomes one problem with what is
// happening, why, and the ways to solve it. Problems are grouped by their cause (one key, one reason), so the
// same idle Gemini key shows once instead of once per task. Nothing here changes a setting: an option either
// takes the person to the exact place, or describes one action the panel runs after the person confirms it.
export type IssueView = 'resources' | 'connections' | 'tasks';
type SourceRef = { provider: AiProviderId; connection_id: string | null };
/** One tap, with confirmation: declare a key paid, pause keys, or point text tasks at a key that already works. */
export type IssueAction = { kind: 'declare'; sources: SourceRef[]; confirm: string } | { kind: 'pause'; sources: SourceRef[] }
  | { kind: 'route'; tasks: AiTaskId[]; provider: AiProviderId; connection_id: string | null };
export type IssueOption = { label: string; detail: string; go: { view: IssueView; target?: string }; link?: { href: string; label: string }; act?: IssueAction };
export type Issue = { id: string; level: 'warning' | 'info'; title: string; what: string; why: string; affects: string[]; options: IssueOption[] };

const reasonsWorthFixing: SourceReason[] = ['declaration_missing', 'declaration_stale', 'disabled', 'no_key', 'missing', 'no_model', 'auto_unsupported', 'not_configured'];
const whatsappTask = 'Transcrição do WhatsApp';
const target = {
  source: (id: string) => `[data-source="${id}"]`,
  provider: (provider: string) => `[data-provider="${provider}"]`,
  task: (task: AiTaskId) => `[data-task="${task}"]`,
};

const aiStudio = { href: 'https://aistudio.google.com/apikey', label: 'Abrir as chaves no AI Studio' };
const ref = (resource: AiResource): SourceRef => ({ provider: resource.provider, connection_id: resource.connection_id });
const declareAct = (resources: AiResource[]): IssueAction | undefined => resources.length && resources.every(resource => declarableProviders.includes(resource.provider))
  ? { kind: 'declare', sources: resources.map(ref), confirm: resources[0].provider === 'gemini'
    ? `Conferi no Google AI Studio: o projeto ${resources.length > 1 ? 'destas chaves' : 'desta chave'} tem faturamento ativo.` : 'Conferi: esta API é paga.' } : undefined;
const joined = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;

function optionsFor(reason: SourceReason, resource: AiResource | undefined, tasks: AiTaskId[]): IssueOption[] {
  const company = resource ? aiCatalog[resource.provider]?.name ?? resource.provider : 'a empresa';
  const toKey = { view: 'connections' as const, target: resource ? target.provider(resource.provider) : undefined };
  const toTask = { view: 'tasks' as const, target: tasks[0] ? target.task(tasks[0]) : undefined };
  const otherConnection: IssueOption = { label: 'Usar outra conexão nesta tarefa', detail: 'Em Tarefas e modelos, escolha outra empresa como principal ou como alternativa. A tarefa volta a responder sem esta chave.', go: toTask };
  const dropKey: IssueOption = { label: 'Não vou usar esta chave', detail: 'Em Conexões e chaves, pause a conexão ou remova a chave. Remover pede confirmação e tira a chave das tarefas que a usam.', go: toKey };
  switch (reason) {
    case 'declaration_missing':
    case 'declaration_stale': {
      const gemini = resource?.provider === 'gemini';
      const act = resource ? declareAct([resource]) : undefined;
      return [
        { label: gemini ? 'Meu projeto Google tem faturamento ativo' : 'Conferi as condições da API', go: { view: 'resources', target: resource ? target.source(resource.source_id) : undefined },
          detail: gemini ? 'Confira no Google AI Studio se esta chave está no plano pago. Depois confirme aqui: a Jornada registra a declaração e passa a usar a chave.'
            : act ? 'Se a API é paga, confirme aqui. Se o que vale é um contrato sem uso para treino, declare no cartão desta chave.'
            : 'No cartão desta chave, escolha a condição que você conferiu (API paga ou contrato sem uso para treino) e toque em Salvar condições.',
          ...(gemini ? { link: aiStudio } : {}), ...(act ? { act } : {}) },
        { ...otherConnection, label: gemini ? 'Não tenho faturamento: usar outra conexão' : otherConnection.label },
        dropKey,
      ];
    }
    case 'disabled': return [{ label: 'Ligar de novo', detail: `Em Conexões e chaves, abra ${company}, marque Ligada e salve.`, go: toKey }, otherConnection, dropKey];
    case 'no_key': return [{ label: 'Colocar a chave', detail: `Em Conexões e chaves, abra ${company}, cole a chave, marque Ligada e salve. Depois toque em Ver modelos para conferir.`, go: toKey }, otherConnection];
    case 'missing': return [{ label: 'Escolher outra conexão', detail: 'A conexão indicada foi removida. Em Tarefas e modelos, escolha uma conexão que existe e salve.', go: toTask }];
    case 'no_model': return [{ label: 'Escolher um modelo', detail: 'Em Tarefas e modelos, escolha um modelo (o Automático · rápido serve) e salve.', go: toTask }];
    case 'auto_unsupported': return [{ label: 'Usar uma rota fixa', detail: 'O modo automático não escolhe este serviço. Em Tarefas e modelos, troque para rota fixa ou coloque-o como alternativa.', go: toTask }];
    default: return [{ label: 'Configurar a tarefa', detail: 'Em Tarefas e modelos, escolha a empresa e o modelo e salve. Se ainda não houver chave, comece por Conexões e chaves.', go: toTask }];
  }
}

function texts(reason: SourceReason, resource: AiResource | undefined, label: string) {
  const gemini = resource?.provider === 'gemini';
  switch (reason) {
    case 'declaration_missing': return { title: `${label}: aguardando sua declaração de privacidade`, what: 'A chave está cadastrada, mas a Jornada não envia dados pessoais para ela.',
      why: gemini ? 'No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Por isso a Jornada só usa esta chave depois que você confirma que o projeto tem faturamento ativo.'
        : 'A Jornada só envia dados pessoais para uma API depois que você confere as condições dela: paga, ou com contrato sem uso para treino.' };
    case 'declaration_stale': return { title: `${label}: a chave mudou depois da declaração`, what: 'A chave foi trocada e a declaração antiga deixou de valer.', why: 'Uma chave nova pode ser de outro projeto, com outras condições. Confira e declare de novo.' };
    case 'disabled': return { title: `${label} está pausada`, what: 'A conexão existe, mas está desligada.', why: 'Conexões pausadas não atendem nenhuma tarefa até serem ligadas de novo.' };
    case 'no_key': return { title: `${label} está sem chave`, what: 'Não há chave cadastrada para esta conexão.', why: 'Sem chave, a Jornada não consegue falar com a empresa.' };
    case 'missing': return { title: 'Uma tarefa aponta para uma conexão removida', what: 'A conexão escolhida nesta tarefa não existe mais.', why: 'A tarefa tenta usá-la e não encontra.' };
    case 'no_model': return { title: `${label}: falta escolher o modelo`, what: 'A conexão está pronta, mas nenhum modelo foi escolhido.', why: 'Sem modelo, a Jornada não sabe qual IA chamar.' };
    case 'auto_unsupported': return { title: `${label} não entra no modo automático`, what: 'O modo automático não escolhe este serviço.', why: 'Ele só funciona como rota fixa ou como alternativa.' };
    default: return { title: 'Tarefa sem conexão escolhida', what: 'Nenhuma fonte foi escolhida para esta tarefa.', why: 'A tarefa fica sem IA até você escolher uma.' };
  }
}

/** Keys that already answer something and may receive personal data: the safe targets for a one-tap switch. */
function workingSources(map: AiResourceMap) {
  const answering = new Set(map.routes.flatMap(route => route.chain.map(item => item.source_id)));
  return map.resources.filter(resource => resource.kind !== 'personal' && resource.configured && resource.enabled && resource.personal_data_ok
    && providerCapabilities[resource.provider]?.includes('text')).toSorted((a, b) => Number(answering.has(b.source_id)) - Number(answering.has(a.source_id)));
}

export function resourceIssues(map: AiResourceMap): Issue[] {
  const name = sourceNamer(map);
  const byId = new Map(map.resources.map(resource => [resource.source_id, resource]));
  const groups = new Map<string, { reason: SourceReason; source: string | null; tasks: AiTaskId[]; whatsapp: boolean; level: Issue['level'] }>();
  const add = (reason: SourceReason, source: string | null, task: AiTaskId | 'whatsapp' | null, level: Issue['level']) => {
    const key = `${reason}:${source ?? task ?? ''}`;
    const group = groups.get(key) ?? { reason, source, tasks: [], whatsapp: false, level };
    if (task === 'whatsapp') group.whatsapp = true;
    else if (task && !group.tasks.includes(task)) group.tasks.push(task);
    if (level === 'warning') group.level = 'warning';
    groups.set(key, group);
  };
  // "Troquei pela Groq e o aviso do Gemini continua": in the automatic mode every saved key is a candidate for every
  // task. A candidate left out while the task is answered breaks nothing, so it is not a task problem: undeclared
  // keys become one "parada" notice per company, and a paused key is a choice, not a warning.
  const idle = new Map<AiProviderId, { sources: string[]; whatsapp: boolean }>();
  const park = (source: string | null, whatsapp = false) => {
    const resource = source ? byId.get(source) : undefined;
    if (!resource) return;
    const group = idle.get(resource.provider) ?? { sources: [], whatsapp: false };
    if (!group.sources.includes(resource.source_id)) group.sources.push(resource.source_id);
    group.whatsapp ||= whatsapp;
    idle.set(resource.provider, group);
  };
  for (const route of map.routes) {
    if (!route.enabled) continue;
    const answered = route.chain.length > 0 || !!route.served_by;
    for (const source of route.sources) {
      if (source.state !== 'blocked' || !source.reason || !reasonsWorthFixing.includes(source.reason)) continue;
      if (source.role === 'auto' && answered) { if (source.reason === 'declaration_missing') park(source.source_id); continue; }
      add(source.reason, source.source_id, route.task, answered ? 'info' : 'warning');
    }
  }
  for (const resource of map.resources) if (resource.declaration.privacy_basis && !resource.declaration.current) add('declaration_stale', resource.source_id, null, 'warning');
  // WhatsApp off: its transcription key only matters once it is turned on, so it joins the idle notice or stays quiet.
  const stt = map.whatsapp?.stt;
  if (map.whatsapp && stt?.state === 'blocked' && stt.reason && reasonsWorthFixing.includes(stt.reason)) {
    if (map.whatsapp.enabled) add(stt.reason, stt.source_id, 'whatsapp', 'warning');
    else if (stt.reason === 'declaration_missing') {
      if (groups.has(`declaration_missing:${stt.source_id}`)) add(stt.reason, stt.source_id, 'whatsapp', 'info');
      else park(stt.source_id, true);
    }
  }
  // Undeclared keys already listed under a task or the WhatsApp warning are not repeated as idle.
  for (const group of groups.values()) if (group.reason === 'declaration_missing' && group.source) for (const [provider, parked] of idle) {
    parked.sources = parked.sources.filter(source => source !== group.source);
    if (!parked.sources.length) idle.delete(provider);
  }

  const working = workingSources(map);
  const issues: Issue[] = [];
  for (const route of map.routes) if (route.enabled && !route.chain.length && !route.served_by) {
    const task = aiTaskLabels[route.task].name;
    // A text task left without AI: one tap points it at a key that already works, in the automatic model.
    const switches: IssueOption[] = route.task === 'voz' ? [] : working.slice(0, 2).map(resource => ({ label: `Usar ${resourceName(resource)} agora`,
      detail: `Coloco ${resourceName(resource)} para responder por ${task}, no modelo automático. A tarefa volta na hora; depois, se quiser, toque em Testar em Tarefas e modelos.`,
      go: { view: 'tasks', target: target.task(route.task) }, act: { kind: 'route', tasks: [route.task], provider: resource.provider, connection_id: resource.connection_id } }));
    issues.push({ id: `empty:${route.task}`, level: 'warning', title: `${task} está sem IA agora`, what: 'Nenhuma conexão está respondendo por esta tarefa.',
      why: 'Todas as conexões dela estão fora (veja os outros avisos) ou nenhuma foi escolhida.', affects: [task],
      options: [...switches, { label: 'Escolher quem responde', detail: 'Em Tarefas e modelos, escolha uma empresa que esteja funcionando e salve. Depois toque em Testar.', go: { view: 'tasks', target: target.task(route.task) } },
        { label: 'Cadastrar uma chave nova', detail: 'Em Conexões e chaves, toque em Adicionar empresa, cole a chave e marque Ligada.', go: { view: 'connections' } }] });
  }
  for (const [key, group] of groups) {
    const resource = group.source ? byId.get(group.source) : undefined;
    const label = group.source ? name(group.source) : 'Conexão';
    const affects = [...group.tasks.map(task => aiTaskLabels[task].name), ...(group.whatsapp ? [whatsappTask] : [])];
    issues.push({ id: key, level: group.level, ...texts(group.reason, resource, label), affects, options: optionsFor(group.reason, resource, group.tasks) });
  }
  // Who answers each task today, for the idle notice: "Groq responde por Conversa e Organizar".
  const answering = new Map<string, string[]>();
  for (const route of map.routes) if (route.enabled && route.chain[0]) {
    const who = aiCatalog[route.chain[0].provider]?.name ?? route.chain[0].provider;
    answering.set(who, [...answering.get(who) ?? [], aiTaskLabels[route.task].name]);
  }
  const serving = joined([...answering].map(([who, tasks]) => `${who} responde por ${joined(tasks)}`));
  for (const [provider, group] of idle) {
    const keys = group.sources.flatMap(source => byId.get(source) ?? []);
    const company = aiCatalog[provider]?.name ?? provider;
    const many = keys.length > 1, gemini = provider === 'gemini';
    const declare = declareAct(keys);
    const toKey = { view: 'connections' as const, target: target.provider(provider) };
    issues.push({ id: `idle:${provider}`, level: 'info',
      title: many ? `${company}: ${keys.length} chaves paradas, esperando sua decisão` : `${name(keys[0].source_id)}: chave parada, esperando sua decisão`,
      what: `${serving ? `Está tudo respondendo: ${serving}. ` : ''}${many ? 'Estas chaves ficam' : 'Esta chave fica'} de fora porque falta a declaração de privacidade${group.whatsapp ? '; a transcrição do WhatsApp, hoje desligada, também depende dela' : ''}.`,
      why: gemini ? 'No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Com faturamento ativo, a chave entra no automático e vira reserva: se a principal cair, ela assume.'
        : 'A Jornada só envia dados pessoais para uma API paga ou com contrato sem uso para treino. Declarada, a chave entra no automático e vira reserva.',
      affects: [],
      options: [
        ...(declare ? [{ label: gemini ? 'Tenho faturamento ativo: liberar' : 'Conferi: a API é paga', act: declare, go: { view: 'resources' as const, target: target.source(keys[0].source_id) },
          detail: gemini ? `Confira no AI Studio se ${many ? 'as chaves estão' : 'a chave está'} num projeto com faturamento. Confirmando aqui, a Jornada registra a declaração e ${many ? 'as chaves entram' : 'a chave entra'} como reserva.`
            : 'Confirmando aqui, a Jornada registra a declaração e a chave entra como reserva.', ...(gemini ? { link: aiStudio } : {}) }] : []),
        { label: gemini ? 'Ainda não tenho faturamento: deixar de lado' : 'Não vou usar agora: deixar de lado', act: { kind: 'pause', sources: keys.map(ref) }, go: toKey,
          detail: `Pauso ${many ? `as ${keys.length} chaves` : 'a chave'} de ${company}.${serving ? ' Quem já responde continua respondendo.' : ''} O aviso sai, e você liga de novo em Conexões e chaves quando quiser.` },
        { label: 'Ver as chaves antes', detail: `Em Conexões e chaves, abra ${company} para conferir nome, chave e conexões extras.`, go: toKey },
      ] });
  }
  // "Caiu o Google, passou para a Groq": recent failures, with who covered them and how to fix the cause.
  const why: Record<string, string> = {
    billing: 'Os créditos ou o faturamento dessa conta acabaram.', auth: 'A chave foi recusada: pode ter sido revogada, trocada ou digitada errada.',
    rate_limit: 'O limite de uso do plano foi atingido (comum no plano gratuito).', model: 'O modelo escolhido não está disponível para essa chave.',
    network: 'Não houve conexão com a empresa.', server: 'A empresa estava fora do ar ou instável.', invalid: 'A empresa recusou o pedido.',
  };
  const taskNames: Record<string, string> = { assistente: 'Conversa do assistente', organizar: 'Organizar registros', voz: 'Chamada ao vivo', transcricao: 'Transcrição de áudio', teste: 'Teste' };
  for (const failure of map.failures ?? []) {
    const company = aiCatalog[failure.provider as keyof typeof aiCatalog]?.name ?? failure.provider;
    const helper = failure.served ? aiCatalog[failure.served as keyof typeof aiCatalog]?.name ?? failure.served : null;
    const times = failure.count === 1 ? '1 vez' : `${failure.count} vezes`;
    issues.push({ id: `failure:${failure.provider}:${failure.kind}`, level: 'warning', title: `${company} falhou ${times} nas últimas 24 horas`,
      what: helper ? `${helper} assumiu e a conversa seguiu.` : 'Nenhuma outra conexão assumiu: nessas vezes a tarefa ficou sem resposta.',
      why: why[failure.kind] ?? 'A empresa não respondeu como esperado.', affects: failure.tasks.map(task => taskNames[task] ?? task),
      options: [
        { label: 'Trocar ou conferir a chave', detail: `Em Conexões e chaves, abra ${company}, cole uma chave nova se for o caso e toque em Ver modelos para conferir.`, go: { view: 'connections', target: target.provider(failure.provider) } },
        { label: 'Pôr outra IA na sequência', detail: 'Cadastre outra empresa em Conexões e chaves e, em Tarefas e modelos, coloque-a como alternativa. Com três empresas diferentes, uma queda não para nada.', go: { view: 'tasks' } },
        ...(failure.kind === 'rate_limit' || failure.kind === 'billing' ? [{ label: 'Ativar ou recarregar o plano pago', detail: `No site da ${company}, ative o faturamento ou recarregue os créditos. Depois volte aqui e toque em Conferir.`, go: { view: 'connections' as const, target: target.provider(failure.provider) } }] : []),
      ] });
  }
  // One connection answering a text task: if it fails, the task stops. Voice keeps a single live provider by design.
  for (const route of map.routes) if (route.enabled && route.chain.length === 1 && route.task !== 'voz' && !route.served_by) {
    const task = aiTaskLabels[route.task].name;
    const available = route.sources.filter(source => source.state === 'available').map(source => name(source.source_id));
    issues.push({ id: `single:${route.task}`, level: 'info', title: `${task} depende de uma só conexão`, what: `Hoje só ${name(route.chain[0].source_id)} responde por esta tarefa.`,
      why: available.length ? `Se ela falhar, a tarefa para. Disponíveis como alternativa: ${available.join(', ')}.` : 'Se ela falhar, a tarefa para. Uma segunda chave, de outra empresa, evita isso.', affects: [task],
      options: [{ label: 'Adicionar uma alternativa', detail: 'Em Tarefas e modelos, escolha o modo Com alternativas e marque uma segunda conexão. Ela só entra se a primeira falhar.', go: { view: 'tasks', target: target.task(route.task) } },
        { label: 'Deixar assim por enquanto', detail: 'Tudo continua funcionando. Este aviso fica na lista como lembrete.', go: { view: 'resources' } }] });
  }
  // Two keys of the same company are not an error, but each needs its own declaration and repeats every warning.
  // Paused keys and a company already in the idle notice (which covers each key) are left out.
  const shared = map.resources.filter(resource => resource.kind !== 'personal' && resource.configured && resource.enabled);
  for (const provider of new Set(shared.map(resource => resource.provider))) {
    const same = shared.filter(resource => resource.provider === provider);
    if (same.length < 2 || idle.has(provider)) continue;
    const company = aiCatalog[provider]?.name ?? provider;
    issues.push({ id: `duplicate:${provider}`, level: 'info', title: `Você tem ${same.length} chaves de ${company}`, what: `Cadastradas: ${same.map(resourceName).join(' e ')}.`,
      why: 'Não é um erro, mas cada chave precisa da própria declaração e os avisos aparecem repetidos.', affects: [],
      options: [{ label: 'Manter as duas', detail: 'Útil para ter uma reserva. Declare as condições de cada uma no cartão dela.', go: { view: 'resources', target: target.source(same[0].source_id) } },
        { label: 'Ficar com uma só', detail: `Em Conexões e chaves, abra ${company} e remova a que sobra. Remover pede confirmação.`, go: { view: 'connections', target: target.provider(provider) } }] });
  }
  return issues.toSorted((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1));
}

/** True when an issue the person was working on no longer appears in a fresh map. A past failure stays listed
 * for 24 hours, so it counts as solved when nothing failed again since the person started fixing it. */
export function issueResolved(id: string, map: AiResourceMap, since?: string) {
  if (id.startsWith('failure:') && since) {
    const [, provider, kind] = id.split(':');
    const failure = map.failures?.find(item => item.provider === provider && item.kind === kind);
    return !failure || Date.parse(failure.last_at) <= Date.parse(since);
  }
  return !resourceIssues(map).some(issue => issue.id === id);
}
