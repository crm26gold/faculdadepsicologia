# Jornada Plena — áreas da vida e cadernos

## Entrega desta etapa

- Onze áreas iniciais: estudos/aprendizagem; trabalho/carreira; finanças; saúde física;
  emocional/autoconhecimento; espiritualidade/propósito; família/relacionamentos;
  social/networking; casa/patrimônio/inventário; descanso/lazer/experiências;
  pessoal/documentos/segurança.
- Criar e renomear áreas, escolher cor, ocultar dos novos cadastros e reordenar.
  Ocultar não exclui registros nem os retira dos filtros históricos.
- Cadernos próprios: criar, renomear, colorir e associar opcionalmente a uma área.
  Anotações podem mudar de caderno e de área sem perder texto ou anexos.
- Filtros combinados por área, caderno e matéria, incluindo pessoais/sem matéria,
  sem caderno e sem área. Não há classificação automática de conteúdo privado.
- Agenda única: compromissos pessoais, reuniões, consultas, treinos, práticas,
  lazer e pagamentos, além de aulas e estudos. Área e matéria são opcionais.
- Grade acadêmica permanece disponível como uma fonte da mesma agenda.
- Caderno multimídia descrito em [CADERNO_MULTIMIDIA_2026-09-27.md](CADERNO_MULTIMIDIA_2026-09-27.md).

## Persistência e compatibilidade

As coleções opcionais `areas` e `notebooks`, e os vínculos `areaId`/`notebookId`,
usam a persistência privada existente em `personal_workspaces`, com RLS e CAS de
revisão. Não são apenas preferências locais no modo cloud. Dados antigos são
lidos sem regravação, reseed ou importação automática; notas sem matéria não
ganham uma categoria arbitrária. O catálogo inicial é exibido sem gravar no banco.

O novo cliente marca gravações com `editorGeneration: 2`. Após a primeira gravação,
um trigger impede clientes antigos de remover essa marca e os campos que não
conhecem. O formato de backup continua `version: 1`, com campos opcionais.
Restaurar um backup antigo exige confirmação e continua sendo substituição,
não mesclagem. O cliente atual aplica a geração ao restaurar.

Não há exclusão de áreas/cadernos nesta etapa. Renomear mantém IDs. Alterar a área
de um caderno não recategoriza suas notas antigas silenciosamente; cada nota
mantém sua área, editável. Os cadernos não são cofres com criptografia separada:
todo o espaço permanece restrito à conta proprietária autorizada.

## O que não deve ser confundido com concluído

Uma área chamada Finanças não é um controlador financeiro. Saúde não implementa
dietas ou prontuários; Espiritualidade não define crenças; Social não implementa
agenda de contatos. Esses módulos continuam futuros, assim como multiusuário,
múltiplos cursos, projetos/metas, hábitos, IA generativa e Oráculo WhatsApp.
O catálogo organiza a vida sem impor pontuações, religião ou metas de desempenho.

## Ordem de continuidade

1. Validar primeiro envio de imagem/áudio na sessão real e leitura em outro dispositivo.
2. [Inbox de captura](CAIXA_DE_ENTRADA_2026-09-27.md) implementada como visão das anotações sem organização. Próximos: cursos e projetos/metas, vinculados às áreas e à agenda existente.
3. Foco por atividade, pausas reais, histórico e hábitos/recorrências pessoais.
4. Lembretes e Google Agenda com autorização específica, deduplicação e revogação.
5. Finanças com cálculos determinísticos, saldos, contas e projeções verificáveis.
6. Saúde, emocional, espiritualidade, relações, descanso e inventário com modelos
   próprios, registros opcionais e permissões por finalidade.
7. IA com ferramentas autorizadas no servidor, registro de ações e confirmação de
   operações sensíveis. Prompts sozinhos não impõem permissões.
8. WhatsApp como canal: vínculo verificado/revogável, isolamento por usuário,
   proteção contra repetição e confirmações proporcionais ao risco.

## Validação

Testes de domínio cobrem compatibilidade, referências e serialização. Testes de
navegador exercitam caderno pessoal, filtro sem caderno, consulta sem matéria,
renomeação, ocultação, reload e acessibilidade. A migração de proteção foi aplicada
no projeto privado e validada em tabela temporária com rollback, sem editar dados
do proprietário. Publicação e testes finais são reportados na entrega da tarefa.

Validação local concluída em 27/09: build Node 24, 52 testes de domínio,
21 testes de navegador (desktop/mobile/local/privado), 13 cenários de bloqueio
de produção e revisão automática de publicação sem alertas. Capturas locais
foram inspecionadas; não são incluídas no repositório público.
