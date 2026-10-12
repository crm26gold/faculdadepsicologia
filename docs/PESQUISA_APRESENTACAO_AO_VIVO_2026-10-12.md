# Apresentação ao vivo: análise da referência de 12/10/2026

**Referência:** apresentação "Ética em perspectiva · Grupo 4", feita pelo proprietário no ChatGPT e publicada como site.
- **Leitura:** em 12/10, o código-fonte público da página (uma página só, de 7 MB, com duas imagens embutidas e um script de cerca de 127 KB).
- **Etiquetas:** cada afirmação abaixo leva **verificado** (lida no código), **secundário** (dita pelo proprietário) ou **inferência**.
- **Dados pessoais:** o texto do trabalho traz nomes e RAs de colegas. Esses dados não entram no repositório.

## Objetivo

Numa aula ou apresentação, quem assiste entra pelo celular (QR Code) e participa ao vivo. O que acontece ali fortalece o grupo e a turma, em vez de acabar com a apresentação.

## O que a página faz (verificado)

- **Apresentação:**
  - slides a partir do texto do trabalho (PDF), com cores e nomes indicando quem apresenta cada parte;
  - "Ver divisão do grupo", linha do tempo, princípios e "texto-fonte preservado" com as referências;
  - fonte A−/A+ e tela cheia.
- **Modo estudo e ensaio:** conteúdo completo, tempo sugerido por slide e um cronômetro que não avança sozinho.
- **Sala ao vivo:**
  - quem apresenta entra com login e cria a sala (`POST /api/sessions`);
  - o link de participação é `/?s=<sala>`, com o QR Code gerado no próprio navegador (codificador próprio, versão 5, limite de 106 bytes);
  - os modos de tela são `apresentar`, `participar`, `painel` e `estudo`.
- **Participante:**
  - envia pergunta com nome e RA (`POST /api/session/<sala>/question`);
  - o celular acompanha o slide atual.
- **Painel de quem apresenta:**
  - recebe as perguntas;
  - marca "Respondida" ou "Ocultar" (moderação);
  - destaca uma pergunta, que aparece na tela projetada;
  - liga e desliga a sala;
  - **controla os slides pelo celular** (anterior/próximo).
- **Sincronização:** consulta o servidor a cada 3,5 s (polling). Não usa WebSocket.
- **Reflexões:** escolher uma pergunta e explicar o motivo, com retorno na hora. A própria página diz "Não há ranking".
- **Ainda não existe na página:** votação, desafios com pontuação, premiação e ranking. É a visão do proprietário para o próximo passo (secundário).

## Mecanismo

1. A tela de quem apresenta publica o slide atual.
2. O estado da sala fica no servidor.
3. Os celulares (via QR) leem o estado e enviam perguntas.
4. O painel de quem apresenta modera e destaca as perguntas.
5. A pergunta destacada aparece na tela projetada.

## Filtro Jornada

| Parte | Rótulo | Motivo |
| --- | --- | --- |
| Divisão do grupo e cores por apresentador | **Aproveitar** | A Jornada já tem trabalhos em grupo com partes e responsáveis (`assignments` e `assignment_parts`). A apresentação nasce do trabalho. |
| Texto-fonte, referências e modo estudo | **Aproveitar** | Já existe o documento final padronizado do trabalho e o material dos cursos. |
| Sala ao vivo com QR, perguntas, moderação e destaque | **Adaptar** | Ligada a uma sala da Jornada (`spaces`), com RLS e registro de quem modera. |
| Controle dos slides pelo celular | **Aproveitar** | Simples e valioso. |
| Polling a cada 3,5 s | **Descartar** | Na Vercel, 40 celulares fazem cerca de 41 mil chamadas por hora de aula; 25 aulas encostam no limite mensal do plano grátis. **Supabase Realtime** vai do navegador direto ao Supabase, cabe no plano grátis (200 conexões simultâneas e 2 milhões de mensagens por mês) e não gasta a Vercel. |
| Identificação por nome e RA | **Adaptar** | O RA não é necessário: basta conta da Jornada ou apelido. Menos dado pessoal, conforme a LGPD. |
| Codificador de QR próprio | **Adaptar** | Funciona, mas é limitado a 106 bytes. Usar uma biblioteca de QR madura ou revisar o codificador com testes. |
| Visual da página | **Descartar** | A Jornada usa a própria identidade visual. |
| Votação, desafios, ranking e premiação | **Adaptar (novo)** | Não existem na referência. Ranking **por grupo** primeiro, para estimular colaboração; o individual fica opcional. Enquetes da Jornada (voto secreto) como base. |

## Filtro legal e ético

O código e o conteúdo foram gerados para o proprietário, a pedido dele. Reaproveitar ideias e trechos é permitido. Mesmo assim, a implementação na Jornada deve ser reescrita na arquitetura dela (Next.js, Supabase com RLS, tokens visuais), porque:
- o backend da página é do serviço de sites do ChatGPT;
- o script é um arquivo único, sem módulos nem testes.

Dados de colegas (nomes e RAs) ficam fora.

## Recomendação (lotes pequenos)

1. **Agora: QR Code nos convites de sala e grupo.** Reaproveita `space_invitations`. Critério de pronto: escanear e entrar na sala pelo celular, com teste de navegador.
2. **Próximo: Sessão ao vivo numa sala.**
   - Tabelas `live_sessions` e `live_questions`, com RLS: quem modera é dono, professor ou líder da sala.
   - Telas apresentar, participar e painel.
   - Perguntas com "apoiar", moderação e destaque.
   - Controle remoto do slide.
   - Realtime do Supabase.
   - Ao encerrar, as perguntas abertas vão para o mural.
   - Critério de pronto: duas pessoas (projetor e celular) veem a pergunta destacada em até 2 s. RLS testado no Postgres local.
3. **Depois:**
   - votação ao vivo (reaproveitando as enquetes);
   - desafios com tempo e resposta certa;
   - ranking por grupo;
   - "gerar apresentação a partir do trabalho em grupo" (partes → slides com a cor de cada responsável);
   - desafios criados pela IA a partir do material do curso.

**Decisão pendente do proprietário:** como entra quem só assiste: com conta ou com apelido. A recomendação é apelido para perguntar e votar, e conta para pontuar.
