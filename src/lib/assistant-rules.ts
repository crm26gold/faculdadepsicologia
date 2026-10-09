import { remindMinutes } from './reminders';
import { taskKinds } from './workspace';

// Uma fonte só para as regras que transformam um pedido em ação: o assistente de texto, a voz ao vivo, o Telegram, o
// WhatsApp e qualquer assistente conectado pelo MCP montam suas instruções daqui. Quem executa é sempre applyCommands;
// estas frases só dizem ao modelo o que propor. Uma regra nova entra aqui, e os testes conferem que chegou a todos.

/** Formato da ação compromisso, igual para todas as portas. */
export const compromissoFormat = `{"type":"compromisso","title":"...","date":"AAAA-MM-DD","time":"HH:MM"(opcional),"daqui":minutos(opcional, no lugar de date e time),"kind":um de ${taskKinds.join('|')} (opcional),"minutes":5-240 (opcional),"area":"nome da área"(opcional),"subject":"nome da matéria"(opcional),"remind":{"minutes":${remindMinutes.join('|')},"level":"suave|normal|insistente"}(opcional)}`;
export const focoFormat = '{"type":"foco","activity":"...","minutes":número (opcional)}';
export const controlarFocoFormat = '{"type":"controlar_foco","operation":"pausar"|"retomar"|"encerrar","end":"HH:MM"(opcional, só para encerrar)}';

export const reminderExample = '{"type":"compromisso","title":"Beber água","daqui":3,"kind":"Tarefa","area":"Saúde física","remind":{"minutes":0,"level":"normal"}}';

/** Lembretes: sempre com aviso, intensidade pelo pedido, hora calculada no servidor, todos os canais. */
export const reminderRule = `Lembretes: "me lembra", "me avisa", "não me deixa esquecer" ou "põe um alarme" é compromisso com remind. Intensidade: normal por padrão (repete 5 minutos depois); insistente quando a pessoa pedir para não esquecer de jeito nenhum; suave só quando ela pedir um aviso só. remind.minutes é quanto antes avisar (0 = na hora). "Daqui N minutos" ou "daqui N horas" vai em daqui (em minutos, sem date e time): o servidor calcula a hora de Brasília; "às 9" é time 09:00. Exemplo de "me lembra daqui 3 minutos de beber água": ${reminderExample}. O aviso sai sozinho em todos os canais ligados (notificação do app, Telegram, WhatsApp e Google Agenda, que também manda e-mail): nunca peça para cadastrar em cada lugar. Para tirar o aviso: editar compromisso com fields {"remind":null}.`;

/** Tipo, área e matéria escolhidos pelo sentido, entre os da própria pessoa. */
export const categoryRule = 'Escolha sempre kind e area pelo sentido, entre as Áreas da vida da pessoa: água, remédio, treino e consulta são saúde; contas são finanças (kind Pagamento); aula, prova e estudo são estudos, com a matéria em subject. Pergunte só se houver ambiguidade real.';

/** Foco ligado à aula, pergunta perto do fim e correção conversacional. */
export const focusRule = `Foco: "entrei na aula de X, liga o foco" é foco com activity e sem minutes; o sistema acha a aula de hoje na grade, liga à matéria e conta até o fim dela. Perto do fim (5 minutos antes), ou depois de 1 hora num foco sem duração, a pessoa recebe em todos os canais "ainda em foco? continuar ou pausar?"; se o foco seguir ligado bem depois do fim, chega "parece que o foco ficou ligado". "Pausa o foco" é controlar_foco pausar. "Esqueci o foco ligado": se a pessoa não disse até que horas ficou, pergunte só isso; com a hora, use controlar_foco encerrar com end "HH:MM" (foco ainda ligado) ou ajustar_foco (foco já encerrado).`;

/** As três regras juntas, na ordem em que entram nas instruções de cada porta. */
export const assistantRules = [reminderRule, categoryRule, focusRule];

/** Impressão curta de um texto (djb2). O mesmo texto dá o mesmo valor no servidor e no navegador. */
export function versionOf(text: string) {
  let hash = 5381;
  for (const char of text) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}
