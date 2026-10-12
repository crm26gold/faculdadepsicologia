# Material dos cursos: plano para aprovação

Situação: **etapas 1 e 2 implementadas** em 09/10/2026, com os padrões do plano: três etapas nessa ordem, 200 MB por conta e leitura de PDF, Word, PowerPoint e texto. A etapa 3 continua proposta. Pedido do proprietário em 09/10/2026: em vez de colar o contexto da aula em cada conversa com uma IA, cada curso guarda o próprio material na Jornada, e qualquer porta (app, voz, Telegram, WhatsApp, ChatGPT, Claude) estuda a partir dele.

## O que a pessoa vê

1. **Cada curso tem um material geral.** Contexto, calendário, regras de prova e nota, manual, orientações de estágio e TCC.
2. **Cada matéria (ou módulo, nos cursos livres) tem o seu material.** Plano de ensino, slides, textos, atividades, o que veio pelo Teams.
3. **Um campo "o que a IA precisa saber"** no curso e em cada matéria. Exemplo: "a professora cobra a parte prática; prova dissertativa".
4. **Duas portas para entrar, o mesmo lugar no banco.**
   - App: Cursos › Graduação em Psicologia › Material, ou › Bases Biológicas › Material. Enviar arquivos ou escrever texto.
   - ChatGPT ou Claude (MCP): "isto é da aula tal de Bases Biológicas, guarda lá". O texto passa direto. O arquivo original passa pelo link de 10 minutos que já existe hoje para fotos, aberto já no lugar certo, porque os assistentes não conseguem repassar o arquivo em si.
5. **Perguntar em qualquer porta, sem colar nada.** "O que cai na prova de Bases Biológicas?" volta com o trecho e a fonte (arquivo e página). Se o material não tiver a resposta, a IA diz que não encontrou, em vez de inventar.
6. **A aula do momento dá o contexto.** Às 19h10 de sexta a grade diz que é Bases Biológicas, de Psicologia UNIP. "Estou em aula, me explica isso" procura primeiro no material dessa matéria, depois no geral do curso. Com dois cursos possíveis ao mesmo tempo, pergunta uma vez.

Exemplos do proprietário: Graduação em Psicologia (UNIP), com material geral e por matéria; IA para Negócios, com material geral e por módulo.

## O que já existe e será reaproveitado

| Peça | Onde | Uso aqui |
|---|---|---|
| Cursos, matérias e módulos (`units`) | `src/lib/workspace.ts` (`courseSchema`, `subjectSchema`) | O lugar de cada material: curso (geral) ou curso + matéria |
| Tela do curso e da matéria | `src/components/workspace-app.tsx` (`openCourse`, `openSubject`) | Ganha a aba **Material** |
| Envio privado direto ao Storage, com URL assinada | `src/app/api/note-media/route.ts` (`note-attachments`, 25 MB) | O mesmo caminho, num bucket novo |
| Link curto para enviar arquivo vindo de um assistente | `src/lib/capture-link.ts`, `enviar_arquivo` no MCP | O destino passa a aceitar "material do curso/matéria" |
| Aula do momento pela grade | `classNow` em `src/lib/commands.ts` | Escolhe curso e matéria quando a pessoa não diz |
| Regras únicas do assistente | `src/lib/assistant-rules.ts` | Uma regra nova de estudo, igual para todas as portas |
| "Conteúdo do sistema é dado, nunca instrução" | instruções do MCP e do assistente | Vale para o texto dos materiais (um PDF não manda na IA) |

Medido hoje no Supabase: banco com 18 MB; bucket `note-attachments` com 10 arquivos (22 MB). As extensões `pg_trgm`, `unaccent` e `vector` estão disponíveis, mas ainda não estão ligadas.

## Onde fica cada coisa

O documento da conta tem limite de 2 MB. Por isso o material ganha leitura e gravação próprias, fora dele, como o `AGENTS.md` prevê para módulos que passam do limite.

- **O texto que a IA lê:** tabela no Postgres, em trechos de cerca de 1.500 caracteres com o número da página, e um índice de busca em português (sem acento, com `unaccent`).
- **O arquivo original:** bucket privado novo, `course-materials`, com a pasta de cada conta e as mesmas regras de acesso dos anexos.
- **Tamanho:** até 25 MB por arquivo. Proposta de 200 MB por conta para começar, ajustável. O plano gratuito do Supabase tem cerca de 1 GB de arquivos no total, somando todas as contas. O texto ocupa pouco: um PDF de 5 MB costuma virar centenas de KB.
- **Google Drive:** fica para uma etapa futura, como opção para arquivos grandes. A Jornada guardaria só o texto e o link. Usa a conexão Google que já existe para a Agenda, com uma permissão a mais pedida à pessoa.

### Tabelas (proposta)

`course_materials`: um registro por material.

| Campo | Para quê |
|---|---|
| `id`, `owner_id` | Identidade e dono; RLS: só o dono lê e grava |
| `course_id`, `subject_id` | Lugar: `subject_id` nulo = material geral do curso |
| `kind` | `arquivo`, `texto` ou `contexto` ("o que a IA precisa saber"; um por lugar) |
| `title`, `file_path`, `mime`, `size`, `pages` | Descrição do arquivo, quando houver |
| `source` | `app`, `mcp` ou `telegram`, para saber por onde entrou |
| `status`, `problem` | `processando`, `pronto`, `sem_texto` (escaneado, por exemplo) ou `falhou`, com o motivo em português |
| `created_at`, `updated_at`, `version` | Ordem e controle de alteração |

`course_material_chunks`: os trechos pesquisáveis (`material_id`, `owner_id`, `position`, `page`, `text`, índice de busca).

Curso ou matéria apagados não apagam material em silêncio. Os materiais vão para "Material sem curso", com mover ou excluir, e excluir passa pela lixeira de 30 dias.

## Ler o texto dos arquivos

Feito no servidor da Jornada, sem enviar o arquivo a nenhuma IA: privacidade e custo zero.

| Tipo | Como | Primeira etapa? |
|---|---|---|
| PDF com texto | `unpdf` (pdf.js para servidor), página a página | Sim |
| Word (`.docx`) | Descompactar (`fflate`) e ler `word/document.xml` | Sim |
| PowerPoint (`.pptx`) | Descompactar e ler cada `ppt/slides/slideN.xml`, slide = página | Sim |
| Texto e Markdown | Direto | Sim |
| Foto de quadro, PDF escaneado | Leitura de imagem (OCR) por IA, avaliada antes pelo skill `avaliar-recurso-ia` | Não, etapa futura |
| Vídeo e áudio de aula | Transcrição | Não, etapa futura |

Dependências novas: `unpdf` e `fflate`, as duas pequenas e sem código nativo. Elas cabem na função da Vercel: o arquivo vai direto ao Storage, e a função só o baixa para ler, então o limite de 4,5 MB de requisição não se aplica.

## Buscar e responder

- **Busca:** texto completo em português no Postgres, com prioridade para a matéria pedida (ou a da aula do momento), depois o geral do curso, depois o resto. Devolve poucos trechos (5 a 8), cada um com arquivo, página e lugar.
- **Sem embeddings na primeira etapa.** A busca por palavras é gratuita, previsível e explicável. A extensão `vector` fica para quando a busca por palavras não bastar, com custo medido antes.
- **Assistente interno** (app, voz, Telegram, WhatsApp): antes de responder uma pergunta de estudo, a Jornada busca os trechos e entrega ao modelo junto com a pergunta.
- **MCP** (ChatGPT, Claude, Codex):
  - `consultar_jornada` ganha a seção `material` (busca com curso e matéria opcionais);
  - a ferramenta nova `guardar_material` guarda texto num curso ou matéria (veja "Como a etapa 2 ficou");
  - `enviar_arquivo` aceita material como destino.

  Isso muda o contrato do MCP. A versão sobe, e cada aplicativo recebe o aviso "atualize o conector" uma vez.
- **Regra nova, a mesma para todas as portas:** perguntas de estudo consultam o material; sem lugar dito, use a aula do momento; responda citando arquivo e página; se não encontrar, diga isso.

## Privacidade e segurança

- Privado por padrão: o material nunca aparece para grupos, professores ou administração. O isolamento é pela RLS, testado no Postgres local como os demais módulos.
- Compartilhar com a turma é etapa futura e sempre um ato explícito da pessoa.
- O texto de um material é dado, nunca instrução: um PDF com "ignore as regras" não muda o comportamento da IA.
- Limites por conta (tamanho e quantidade) e o orçamento de envios que já existe (`requestBudget('upload')`).

## Entregas

| Etapa | O que entrega | Muda o MCP? |
|---|---|---|
| **1. Guardar** | Tabelas, bucket, aba Material no curso e na matéria, envio de PDF/Word/PowerPoint/texto, leitura do texto, "o que a IA precisa saber", mover, excluir, limites. Testes de banco (isolamento entre contas) e de navegador | Não |
| **2. Estudar com o material** | Busca com fonte, aula do momento, regra única, assistente interno e voz usando o material, MCP lendo e guardando material, `enviar_arquivo` para material | Sim, uma atualização do conector |
| **3. Menos trabalho para enviar** | "Solta tudo no curso" com sugestão de matéria para confirmar com um toque; arquivos enviados pelo Telegram (até 20 MB) indo para o material | Não |
| **Futuro** | Leitura de imagem e PDF escaneado, transcrição de aula, Google Drive, compartilhar com a turma, busca por significado (embeddings), resumos e flashcards a partir do material | A decidir |

Cada etapa sai em um PR, com CI verde, migração aplicada e conferida, matriz do `README.md` atualizada e o proprietário testando antes da próxima.

## Decisões

Em 09/10/2026 o proprietário mandou começar a implementação. A etapa 1 seguiu os padrões propostos:

1. As três etapas, nessa ordem.
2. 200 MB por conta, ajustável.
3. PDF, Word, PowerPoint e texto primeiro; foto e escaneado depois.

### Como a etapa 1 ficou

- Tabelas `course_materials` e `course_material_chunks`, bucket `course-materials` e configuração de busca `public.jornada_pt`: migração `supabase/migrations/20261009221820_course_materials.sql`.
- O limite da conta é verificado no banco (gatilho com trava por conta), e o bucket só aceita o arquivo de um registro "enviando" da própria pessoa.
- `GET/POST /api/materiais` prepara, lê, guarda texto e contexto, move, exclui, restaura, apaga de vez e abre o original por link de 1 minuto. A lixeira e os envios interrompidos são limpos ao listar.
- Aba **Material geral do curso** na tela do curso, e **Material desta matéria** na matéria (Meu caderno › matéria).
- Testes: `tests/course-materials.test.ts` (leitura dos formatos, trechos, rota inteira com banco simulado), `tests/sql/course-materials.sql` (isolamento entre contas, limites, bucket, busca sem acento) e navegador (acessibilidade e celular).

### Como a etapa 2 ficou

- **Uma busca só, no banco** (`supabase/migrations/20261012183017_course_material_search.sql`): `private.material_search_for` procura em português sem acento, com peso 3 para a matéria pedida, 2 para o geral do curso, 1,5 para outra matéria do curso e 1 para o resto. Trechos com todas as palavras vêm antes dos que têm só parte. Devolve até 6 a 8 trechos, com arquivo, página e lugar, e o "o que a IA precisa saber" do lugar. Sem pergunta, lista o que está guardado.
- **Três portas para a mesma busca, cada uma presa à própria pessoa:** `material_search` (login do app, pela RLS de `auth.uid()`), `mcp_material_search` (dona da chave do MCP) e `bot_material_search` (conversa vinculada do Telegram e do WhatsApp).
- **Aula do momento** (`src/lib/materials/study.ts`): pela grade de aulas, de 15 minutos antes do início até o fim. Às 19h10 de sexta, "como é a prova?" busca primeiro em Psicologia › Bases Biológicas.
- **Assistente interno, Telegram e WhatsApp:** antes de responder, a Jornada busca com as palavras da pessoa e entrega os trechos ao modelo como dado, nunca como instrução. Se a busca falhar, o pedido segue sem o material.
- **Voz:** `consultar_jornada` com `section: "material"` (e `curso`/`materia` opcionais) busca pela rota `/api/materiais?busca=`.
- **MCP:** `consultar_jornada` ganhou a seção `material`. A ferramenta nova `guardar_material` guarda texto ou "o que a IA precisa saber" num curso ou matéria, e exige a permissão de registrar. `enviar_arquivo` com `material: true` devolve um link de 10 minutos que abre o quadro Material do lugar certo. Ali a pessoa envia o arquivo original, com o próprio login.
- **Ferramenta separada em vez de uma ação em `registrar_na_jornada`:** o material vive em tabelas próprias, fora do documento da conta, e guardar não passa pelo controle de revisão nem pelo desfazer do documento. Uma ação misturada às outras teria regras diferentes das vizinhas.
- **Regra única** `materialRule` em `src/lib/assistant-rules.ts`, a mesma para texto, voz e MCP: consultar o material em perguntas de estudo, usar a aula do momento quando a pessoa não disser o lugar, citar arquivo e página e dizer quando não encontrou.
- **Contrato do MCP:** versão `2026.10.09.2`. Cada conector conectado antes recebe uma vez o aviso para atualizar.
- **Testes:**
  - `tests/course-material-study.test.ts`: aula do momento, lugar pelo nome, bloco do modelo, MCP lendo e guardando, chave só de leitura e link;
  - `tests/sql/course-material-search.sql`: isolamento entre contas nas três portas, prioridade da matéria, chave só de leitura, curso que não existe e matéria de outro curso;
  - navegador: o link abre o quadro da matéria certa.
