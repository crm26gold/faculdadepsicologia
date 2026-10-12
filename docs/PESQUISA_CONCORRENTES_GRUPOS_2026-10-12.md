# Salas e grupos: concorrentes, integrações e freemium (12/10/2026)

O proprietário pediu para analisar os concorrentes antes de ter ideias e aplicar, para potencializar a aba de salas e grupos. Também entram no escopo:
- perfil;
- networking e uma rede social interna simples;
- videochamada (o proprietário tem Google AI Pro);
- APIs grátis;
- imagens leves para não gastar MB;
- freemium.

**Como foi feita:** três frentes de pesquisa na web em paralelo (concorrentes, integrações e freemium), seguidas da síntese com os filtros dos skills `analisar-referencia` e `avaliar-recurso-ia`.

**Etiquetas:**
- **V**: página oficial aberta em 12/10/2026.
- **S**: fonte secundária, como artigo, review ou loja de apps.
- **I**: inferência.

Preços, cotas e limites mudam: confira antes de usar qualquer número. Documento com data no nome é registro histórico.

## Resumo

1. **Ninguém junta o que a Jornada junta.** Classroom e Teams são ferramentas do professor; Mentimeter, Slido e Kahoot servem a um evento e somem depois; Passei Direto, Studocu e Knowunity são bibliotecas abertas. Não apareceu nenhum produto que una vida pessoal privada, turma e grupo com trabalho em grupo de ponta a ponta (I).
2. **O que mais se repete e funciona:**
   - entrar por QR ou link sem cadastro;
   - perguntas anônimas com voto e moderação;
   - placar por equipe;
   - foco junto;
   - selo de resposta validada;
   - perfil que mostra o contexto (curso, turma), nunca a vida inteira.
3. **"Grok grátis" não existe; "Groq grátis" existe.** São empresas diferentes.
   - A API do Grok (xAI) é paga, e o crédito grátis dela vem em troca de treinar com os dados.
   - O Groq (com q), já usado pela Jornada, tem cota grátis e não guarda o conteúdo por padrão (V).
4. **O jeito de economizar MB é reduzir a imagem no próprio celular antes de enviar:** uma foto de 3 a 5 MB vira de 150 a 300 KB (I). Gerar imagem com IA não economiza: a API do Gemini não tem cota grátis para imagem (V). Para cartaz ou infográfico, a IA escreve o conteúdo e o próprio Next.js desenha a imagem, sem custo.
5. **Videochamada:**
   - o melhor caminho é um botão "Criar Meet" que usa a conta Google do próprio aluno (falta um teste);
   - um campo "colar link" aceita Meet, Zoom ou outro;
   - o Jitsi público não serve mais para isso (V).
6. **Freemium:** quem participa nunca paga; quem organiza turma grande ou sessão grande pode pagar. Sem anúncios. Pix.

## Ponto de partida: o que a Jornada já tem

| Peça | Onde | Observação |
| --- | --- | --- |
| Instituição › sala › grupo | `spaces`, `space_members` | Papéis: dono, professor, monitor, líder e aluno |
| Convite por link | `space_invitations` | Base para o QR Code |
| Mural e enquetes com voto secreto | `space_posts`, `polls`, `poll_votes` | Base para Q&A e votação ao vivo |
| Trabalho em grupo | `assignments`, `assignment_parts`, `part_comments` | Partes, responsável, entrega, revisão e documento final |
| Contatos | `contacts` | Privados de cada pessoa |
| Plano da conta | `accounts.plan` (`academic`/`pro`), `plan_source` (`free`/`paid`/`courtesy`), `ai_credits`, `features` | A base do freemium já existe no banco |
| Perfil | documento pessoal (`photoUrl`, curso, semestre, instituição, RA, telefone…) | Privado. A foto recusa arquivo acima de 250 KB em vez de reduzi-lo (`src/components/profile-settings.tsx`) |
| Material do curso | `course_materials` | Guardado só na conta da pessoa |
| Networking | conversado em 04/10 ([relatório](RELATORIO_CLAUDE_2026-10-04.md), seção 5) | Não implementado. Decisões em aberto |

## Concorrentes

| Quem | O que faz bem na parte coletiva | O que adaptar |
| --- | --- | --- |
| Passei Direto (BR) | Perguntas por disciplina e instituição; grupos com moderadores; quem envia material ganha acesso (V) | Moderador com papel claro na sala |
| Google Classroom | Grupos de alunos dentro da turma para tarefas e correção; o aluno não vê o grupo (V) | Tarefa por subgrupo. Na Jornada, o grupo é visível para quem faz parte |
| Microsoft Teams | Salas de grupo durante a aula; Reflect, um check-in de como cada um está (V) | "Pulso do grupo" leve |
| Discord | Canais de texto por assunto e de voz para plantão; Stage separa quem fala de quem assiste (V) | Palco da apresentação; canal por parte do trabalho |
| Notion | Páginas do grupo; estudante tem plano grátis individual, e organização estudantil verificada tem membros ilimitados (V) | Modelo de "página do grupo" |
| Padlet | Mural com votos e comentários; entrada por link ou QR; convidado com apelido; papéis leitor, escritor e moderador (V/S) | Apelido em evento; papéis no mural |
| Kahoot | Grupos de estudo com placar por período e medalhas; conquistas de grupo (V) | Placar da equipe por semana |
| Mentimeter | Entrada por QR ou código sem app; perguntas anônimas com voto; IA agrupa respostas (V) | QR que abre a sessão |
| Slido | Perguntas anônimas com voto, para quem é tímido (V); moderação só no pago (S) | Moderação incluída no grátis |
| Knowunity | 30 milhões de estudantes; evita contato de estranhos; moderação automática e humana (V) | Sem mensagem direta de desconhecidos |
| Studocu | Notas por universidade e curso; IA gera resumo e quiz do material (V) | IA ancorada no material da turma |
| Brainly | Selo verde de "resposta verificada" por especialista (V) | Selo "validado pelo professor ou monitor" |
| Quizlet | "Estudar com amigos" acompanha o progresso junto (V) | Progresso do grupo em agregado, nunca individual exposto |
| Sharing (BR, 2026) | Rede de concurseiros com grupos públicos e privados, perfis para seguir; entrada por código de professor (S) | Feed que a pessoa escolhe seguir |
| Fizz (EUA) | Só e-mail .edu verificado; posts anônimos (V); críticas de fofoca e privacidade (S) | Verificação institucional sim; anonimato aberto não |

**Referências de padrão** (não são concorrentes):
- **Focusmate:** sessões de 25, 50 ou 75 minutos com um parceiro, dizendo a tarefa no começo (V).
- **Forest:** foco plantado junto (V).
- **CATME:** forma equipes por habilidades e horários, com avaliação entre pares (S).

## Filtro Jornada dos padrões

| Padrão | Quem usa | Rótulo | Como na Jornada |
| --- | --- | --- | --- |
| Entrar por QR, link ou código, sem app | Mentimeter, Slido, Padlet | **Aproveitar** | QR nos convites de sala e grupo, e na sessão ao vivo |
| Perguntas anônimas com voto e moderação | Slido, Mentimeter | **Adaptar** | Anônimo só para a turma; quem modera vê o autor. Moderação incluída no grátis |
| Placar e medalhas | Kahoot, Quizlet | **Adaptar** | Por equipe primeiro; individual só se a pessoa quiser |
| Foco junto | Focusmate, Forest | **Adaptar** | "Estudar junto agora" no grupo, ligado às partes do trabalho. O Foco já existe |
| Banco de materiais em que enviar libera acesso | Passei Direto, Studocu | **Descartar** a troca | Estimula subir material com direito autoral alheio. Na sala, só o material da turma, com origem indicada |
| Selo de resposta validada | Brainly | **Aproveitar** | Professor ou monitor marca a resposta no mural |
| Moderação em camadas | Knowunity, Passei Direto | **Aproveitar** | Denúncia, bloqueio, moderador da sala e rastro. Filtro automático opcional |
| Identidade institucional e perfil por contexto | Fizz, Sharing, Notion | **Adaptar** | Perfil de turma com nome, foto ou iniciais, curso e instituição. Nunca RA, telefone ou vida pessoal |
| Subgrupos com papéis | Classroom, Teams, Padlet | **Aproveitar** | Já existe (sala › grupo e papéis) |
| Formação de grupo por habilidades e horários | CATME | **Adaptar** | Opcional, sem expor a agenda pessoal: só "livre/ocupado" escolhido pela pessoa |
| Pulso do grupo | Teams Reflect | **Adaptar** | Uma pergunta rápida com emoji; o grupo vê só o agregado |
| IA ancorada no conteúdo da turma | Studocu, Knowunity, Quizlet | **Adaptar** | Resumo do mural e desafios a partir do material, com provedor que não treina |
| Posts anônimos abertos | Fizz | **Descartar** | Viram fofoca; vai contra a segurança como diferencial |
| Anúncios no plano grátis | Brainly, Quizlet, Duolingo | **Descartar** | Minam a confiança num app de vida pessoal |

## Onde a Jornada pode ser única

- **Aluno no centro, com privacidade explícita:** vida pessoal fechada, e compartilhar é sempre um ato (I).
- **Trabalho em grupo de ponta a ponta:** formar o grupo, dividir as partes, revisar, montar o documento final e apresentar ao vivo, com a sessão ficando no histórico da sala. Hoje isso está espalhado em Classroom, CATME, Notion e Mentimeter (I).
- **Apresentação do aluno para a turma**, com perguntas, votação e placar por equipe, e o que acontece fica na sala (I).
- **Rede pequena em português:** instituição, sala e grupo. Não apareceu app brasileiro de trabalho em grupo universitário em 2025–26; isso é ausência na busca, não prova (I).
- **Foco junto ligado ao grupo real**, não a estranhos (I).

## Integrações e APIs grátis

| Recurso | Veredito | Custo | Por quê |
| --- | --- | --- | --- |
| **Meet pela API do Google Agenda** | **Usar, depois de testar** | Grátis, sem cartão (V) | Cria o link do Meet num evento da agenda do próprio aluno. Meet de conta pessoal: até 100 pessoas e 60 minutos com 3 ou mais (V). Falta testar se a agenda da Jornada no Google (escopo `calendar.app.created`, `src/lib/google-agenda.ts`) aceita Meet; se não aceitar, seria preciso uma permissão mais ampla |
| Meet REST API (`spaces.create`) | Evitar | — | Permissão sensível que exige verificação; o guia oficial exige Google Workspace (V) |
| Campo "colar link da chamada" | **Usar** | Zero | Aceita qualquer Meet, Zoom ou Jitsi, sem integração |
| Jitsi público (meet.jit.si) | Evitar | — | Não aceita mais ser embutido; desde 09/10/2026 limita reuniões a 95 minutos (V) |
| LiveKit Build | Talvez, se quiser vídeo dentro do app | 5.000 minutos-participante por mês, sem cartão, para quando acaba em vez de cobrar (V) | Cerca de 8 encontros de 5 pessoas por 2 horas por mês para o app inteiro (I) |
| Daily / Whereby | Talvez | 10.000 / 2.000 min por mês (V) | Daily não tem teto rígido |
| **Reduzir imagem no navegador** | **Usar** | Zero | Redimensionar (lado maior de cerca de 1600 px; 256 px no perfil) e salvar em WebP, com JPEG como reserva, porque o Safari não gera WebP pelo canvas (S). WebP fica de 25% a 34% menor que JPEG (V) |
| Supabase Image Transformations | Indisponível | Só no plano Pro (V) | — |
| Vercel Image Optimization | Talvez | 5 mil transformações por mês no Hobby (V) | O Hobby é para uso não comercial (V) |
| Gemini para gerar imagem | Evitar | Sem cota grátis; de US$ 0,034 por imagem (V) | — |
| Cloudflare Workers AI (FLUX) | Talvez | 10.000 neurons por dia, cerca de 170 imagens (V/I) | Não treina com o conteúdo (V); escreve mal texto dentro da imagem |
| **Cartaz ou infográfico com `next/og`** | **Usar** | Zero | A IA devolve título, tópicos e cores; o Next.js desenha a imagem. Texto exato, nenhum dado vai a gerador de imagem. Limites: só flexbox e até 500 KB por pacote (doc local do Next 16.3.8) |
| **Groq** | **Usar** | Cota grátis por modelo, por exemplo 30 pedidos por minuto e 1.000 por dia (V) | Não guarda o conteúdo por padrão (V). O limite de 8 mil tokens por minuto pede fila e cota por pessoa |
| Gemini texto grátis | Só conteúdo público | Grátis | O plano grátis usa o conteúdo e permite revisão humana; o Brasil não tem a exceção europeia (V) |
| xAI Grok (API) | Evitar | Pago; não há crédito grátis na documentação (V) | — |
| OpenRouter `:free`, Mistral grátis | Evitar | — | Podem treinar com os dados (V/S) |
| Moderação da OpenAI | Talvez, como camada extra | Grátis (V) | Não treina por padrão; guarda registro de abuso por até 30 dias (V). Começar com denúncia e regras simples |
| **QR Code: `uqr`** | **Usar** | Zero | Pequeno, sem dependências, gera SVG (V). O aluno lê com a câmera do celular; o app não precisa de leitor |

**Tempo real numa turma de 40 a 80 pessoas** (Supabase Realtime, plano grátis):
- **Limites (V):** 200 conexões, 100 mensagens por segundo e 2 milhões por mês. Cada envio conta uma vez por pessoa que recebe, e passar do limite por segundo derruba conexões.
- **Padrão seguro (I):**
  - os alunos respondem pelo servidor;
  - uma única fonte publica o resultado agregado a cada 2 ou 3 segundos (cerca de 1.000 mensagens por pergunta numa turma de 80);
  - nada de "quem está online" para a turma inteira.
- **Conta (I):** a cota mensal cobre cerca de 200 sessões de 10 perguntas.

## Freemium

O proprietário disse que agora não é hora de decidir o que é pago; fica só a direção.

| Quem | Grátis | Pago | O que faz pagar |
| --- | --- | --- | --- |
| Passei Direto | Acervo limitado (S) | R$ 59,90/mês ou R$ 289/ano (loja) | Acervo, IA e downloads ilimitados |
| Notion | Histórico de 7 dias, arquivo de 5 MB (V) | Plus de estudante grátis com e-mail institucional (V) | Colaborar, histórico, IA |
| Kahoot | 40 participantes por sessão (V) | US$ 3 a 19/mês por faixa de participantes (V) | Tamanho da sessão |
| Mentimeter | 50 participantes por mês (V) | Só anual, por apresentador (V) | Mais participantes, exportar |
| Slido | 100 participantes, 3 enquetes por evento (V) | Só anual ou avulso (V) | Mais enquetes e pessoas |
| Padlet | 3 murais (V) | R$ 24,90 a 34,90/mês (loja); contribuidores não pagam (V) | O quarto mural |
| Knowunity, Brainly, Quizlet | Núcleo grátis, alguns com anúncios (S) | R$ 9,90 a 49,90/mês (loja) | IA sem cota, sem anúncios |

**Padrões:**
- Os planos individuais ficam entre R$ 9,90 e R$ 35 por mês, concentrados em R$ 15–25 (loja).
- A âncora para estudante é o Spotify Universitário, a R$ 12,90 (V).
- O plano anual sai de 17% a 60% mais barato que 12 mensalidades (I).
- O Pix é a maior forma de pagamento do país, e o Pix Automático existe desde 06/2025 (S).
- Mentimeter e Slido não aceitam Pix nem têm plano mensal (V).

**Armadilhas** (todas S):
- **Fechar o que era grátis:** o Quizlet passou o Learn para o pago em 2022, e o Padlet limitou os murais em 2018; os dois revoltaram estudantes e professores.
- **Renovação sem aviso:** queixas contra o Studocu.

**Direção para a Jornada (I):**
- **Grátis:**
  - toda a vida pessoal essencial;
  - criar e entrar em salas e grupos, convites, mural, enquetes e participar de sessões ao vivo;
  - uma cota diária modesta de IA;
  - exportar os dados;
  - zero anúncios.
- **Plano individual:** mais IA e voz, arquivos maiores, histórico longo. Anual com desconto e passe de 1, 3 ou 6 meses por Pix. Desconto com e-mail institucional.
- **Plano de quem organiza (turma, professor ou instituição):** sala ou sessão ao vivo acima de um tamanho, relatórios de participação sem dados pessoais, mais espaço e moderação.
- **Regra de ouro:** quem participa nunca paga, e uma sessão em andamento nunca é cortada.
- **Antes de cobrar:**
  - a Vercel Hobby é para uso não comercial (V), então o plano Pro da Vercel entra junto com a abertura das vendas, como já previsto no [roadmap](ROADMAP.md);
  - o pagamento por Asaas também já está previsto lá.

## Perfil e rede interna

Junta o que foi conversado em 04/10 com os padrões acima.
- **Dois perfis, como já é hoje:**
  - **Pessoal** (no documento da conta): continua privado, com RA, telefone e o resto.
  - **De turma** (novo, numa tabela própria): a pessoa escolhe o que mostrar, como nome, foto ou iniciais, curso e instituição, e uma frase.
- **Quem vê o perfil de turma:** só quem divide uma sala, um grupo ou uma sessão.
- **Conexões:**
  - aceite dos dois lados, só entre quem divide uma sala ou grupo;
  - mensagem direta só entre conexões, como faz o Knowunity;
  - bloquear e denunciar sempre à mão.
- **Feed:** o mural da sala já é o feed. "Seguir" é escolha da pessoa, sem algoritmo.
- **Moderação sem vigilância:** a IA não lê as conversas; vale denúncia, moderador da sala, rastro e selo de resposta validada.
- **Foto leve:** reduzir no navegador para 256 px em WebP ou JPEG, com cerca de 20 a 40 KB (I). Assim aceita qualquer foto do celular em vez de recusar acima de 250 KB, e o documento da conta fica menor.

## Filtro legal e ético

- **Só padrões de experiência:** nenhum código, marca, nome de recurso ou tela de concorrente é copiado.
- **Material da sala:** só o que a própria turma produz ou recebe, com origem indicada. Nada de "envie para liberar".
- **Anonimato:** só nas perguntas da sessão ao vivo, moderado, e quem modera vê o autor. Sem posts anônimos abertos.
- **LGPD:** público 18+; dado mínimo (sem RA na parte coletiva); provedor de IA que treina só recebe conteúdo público.

## Recomendação em lotes

1. **Lote 1, pequeno e sem dependência externa nova:**
   - QR Code nos convites de sala e grupo (`uqr`). Aguarda o "pode" do proprietário.
   - Imagens leves no navegador: foto do perfil (aceitar qualquer foto) e anexos.
   - "Link da chamada" no grupo: colar link agora; botão "Criar Meet" depois do teste com a conta do proprietário.
2. **Lote 2: sessão ao vivo** ([desenho](PESQUISA_APRESENTACAO_AO_VIVO_2026-10-12.md)), com o padrão de tempo real agregado e perguntas anônimas moderadas.
3. **Lote 3, grupo vivo:**
   - perfil de turma;
   - pulso do grupo;
   - "estudar junto agora" ligado às partes do trabalho;
   - placar da equipe por semana.
4. **Lote 4, rede e IA:**
   - conexões entre quem divide sala;
   - selo de resposta validada;
   - resumo do mural e desafios do material pelo Groq;
   - cartaz com `next/og`.
5. **Na abertura das vendas:** plano de quem organiza, Pix pelo Asaas e Vercel Pro.

## Decisões do proprietário

1. **Sessão ao vivo:** quem assiste entra com conta ou com apelido? A recomendação é apelido para perguntar e votar, e conta para pontuar.
2. **"Pode"** para começar o lote 1.
3. **Conexões:** aceite dos dois lados (recomendado) ou "seguir" de um lado só?
4. **Perfil de turma:** visível só dentro da Jornada (recomendado) ou também numa página pública?

## Fontes principais

- **Concorrentes:**
  - [Passei Direto](https://www.passeidireto.com/termos-de-uso)
  - [Classroom: grupos](https://support.google.com/edu/classroom/answer/15263790?hl=en)
  - [Teams: salas de grupo](https://support.microsoft.com/en-us/teams/education/create-and-manage-breakout-rooms-during-class-meetings)
  - [Teams Reflect](https://support.microsoft.com/en-us/education/learning-accelerators/get-started-with-reflect-in-teams)
  - [Discord Stage](https://discord.com/blog/running-moderating-discord-stages-best-practices)
  - [Notion para educação](https://www.notion.com/help/notion-for-education)
  - [Padlet](https://padlet.help/l/en/article/t8trtmdfrg-padlet-student-guide)
  - [Kahoot grupos](https://kahoot.com/kahoot-study/kahoot-study-smart-study-in-group/)
  - [Mentimeter Q&A](https://www.mentimeter.com/features/live-questions-and-answers)
  - [Slido educação](https://www.slido.com/education)
  - [Knowunity segurança](https://knowunity.com/about/safety)
  - [Brainly respostas verificadas](https://faq-br.brainly.com/pt-BR/support/solutions/articles/10000000184-respostas-verificadas)
  - [Fizz](https://fizz.social/)
  - [Focusmate](https://www.focusmate.com/faq)
  - [Sharing (Tribuna de Minas)](https://tribunademinas.com.br/especiais/ciencia-e-tech/15-07-2026/startup-de-juiz-de-fora-cria-rede-social-para-concurseiros.html)
- **Integrações:**
  - [Agenda: criar eventos com Meet](https://developers.google.com/workspace/calendar/api/guides/create-events)
  - [Meet API: autorização](https://developers.google.com/workspace/meet/api/guides/authenticate-authorize)
  - [Limites do Meet](https://support.google.com/meet/answer/9302870)
  - [Jitsi as a Service](https://jitsi.org/jaas/)
  - [Blog do Jitsi](https://jitsi.org/blog/)
  - [LiveKit preços](https://livekit.io/pricing.md)
  - [Daily preços](https://www.daily.co/pricing/video-sdk/)
  - [MDN toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
  - [Estudo do WebP](https://developers.google.com/speed/webp/docs/webp_study)
  - [Supabase transformações](https://supabase.com/docs/guides/storage/serving/image-transformations)
  - [Vercel imagens](https://vercel.com/docs/image-optimization/limits-and-pricing)
  - [Gemini preços](https://ai.google.dev/gemini-api/docs/pricing)
  - [Gemini termos](https://ai.google.dev/gemini-api/terms)
  - [Workers AI preços](https://developers.cloudflare.com/workers-ai/platform/pricing/)
  - [Groq limites](https://console.groq.com/docs/rate-limits)
  - [Groq dados](https://console.groq.com/docs/your-data)
  - [xAI modelos](https://docs.x.ai/docs/models)
  - [OpenRouter privacidade](https://openrouter.ai/docs/features/privacy-and-logging)
  - [Moderação da OpenAI](https://developers.openai.com/api/docs/guides/moderation)
  - [uqr](https://github.com/unjs/uqr)
  - [Supabase Realtime limites](https://supabase.com/docs/guides/realtime/limits)
- **Freemium:**
  - [Notion preços](https://www.notion.com/pricing)
  - [Kahoot planos](https://kahoot.com/schools/plans/)
  - [Mentimeter planos](https://www.mentimeter.com/plans)
  - [Slido preços](https://www.slido.com/pricing)
  - [Padlet planos](https://padlet.help/l/en/article/t0rudsk896-subscription-plans)
  - [Workspace for Education](https://edu.google.com/workspace-for-education/editions/compare-editions/)
  - [Spotify Universitário](https://www.spotify.com/br/premium/)
  - [Pix Automático (Banco Central)](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/pix-automatico-FAQ-participantes.pdf)
  - [Padlet 2018 (EdSurge)](https://edsurge.com/news/2018-04-04-padlet-s-price-updates-riles-teachers-and-raises-questions-about-freemium-model)
