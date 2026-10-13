# Jornada Plena — visão, decisões e fundação multiusuário

Registro das decisões tomadas pelo proprietário em 30/09/2026. Este documento tem
precedência sobre o roadmap anterior no que diz respeito a usuários, grupos,
papéis, planos e integrações. Nada aqui foi aplicado em produção ainda.

## Princípio central

> **Conectividade com segurança. Networking com privacidade.**
> Espaços privados e personalizados para cada momento da vida: há momentos em que
> somos alunos, momentos em que somos professores — cada etapa, cada persona,
> com a sua organização.

Regras que derivam dele e valem para toda funcionalidade nova:

1. **Privado por padrão.** Tudo que uma pessoa cria nasce visível só para ela.
2. **Compartilhar é sempre um ato explícito.** Enviar a parte do trabalho ao
   grupo, aceitar uma conexão, autorizar outro professor a ajudar. Nunca por
   dedução do sistema.
3. **O papel é do contexto, não da pessoa.** A mesma pessoa pode ser professora
   em uma sala e aluna em outra. A tela se adapta ao contexto ativo.
4. **Quem concede pode revogar.** Toda permissão tem dono e pode ser retirada.
5. **Vida pessoal nunca vaza.** Sono, finanças, saúde e anotações pessoais nunca
   aparecem para professor, grupo ou administrador.
6. **Tudo que é poderoso deixa rastro.** Ações administrativas ficam em
   histórico (quem, o quê, quando).
7. **Isolamento garantido pelo banco (RLS), não só pela tela.**

## Visão do produto

Organizador de vida modular. A faculdade é um bloco, não o centro. Cada pessoa
monta seu conjunto de blocos (estudos, trabalho, casa, família, academia, sono,
finanças...). Sobre isso, uma camada coletiva: comunidades, grupos, papéis e
entregas — os **arquétipos** — replicáveis para qualquer contexto (sala de aula,
equipe de trabalho, personal e alunos, família).

### Arquétipo "Trabalho em grupo" (caso real: Ética / Direitos Humanos)

1. Professor (ou o líder) publica modelo, instruções e normas de formatação.
2. Define as partes e quem é responsável por cada uma.
3. Cada membro envia sua parte no sistema. O administrador ou líder pode lançar
   a parte **em nome** de alguém (registrado como "enviado por X em nome de Y"),
   para que o sistema funcione mesmo sem adesão total.
4. Professor/líder pede revisão de partes específicas, com comentário.
5. IA consolida seguindo as instruções, padroniza e aponta lacunas.
6. Versão final em PDF / Google Docs; entrega via sistema, Teams ou como o
   professor preferir.

## Papéis e poderes

| Papel | Onde vale | Quem concede |
| --- | --- | --- |
| **Administrador master** | Plataforma inteira | Somente um master (inicialmente, só o proprietário) |
| **Professor** | Em cada sala onde for atribuído | Master; ou o dono da sala |
| **Professor auxiliar** | Numa sala de outro professor | O professor dono da sala |
| **Líder de grupo** | No grupo | Professor ou master |
| **Aluno / membro** | Na sala ou grupo | Convite ou master |

Painel master (só o proprietário): buscar pessoa por e-mail e definir papel,
plano (grátis / Pro / **cortesia**), créditos de IA e funções liberadas
individualmente. Tudo registrado em histórico.

Visibilidade entre professores: um professor **não vê** as salas de outro
professor, a menos que o dono da sala o adicione como auxiliar.

## Cadastro e entrada

- Qualquer pessoa pode criar conta (Google). Entra **sem acesso a nenhuma sala**.
- Entra numa sala por link de convite ou quando o master/professor a adiciona.
- Aceite de termos e privacidade no primeiro acesso, com versão registrada.

## Contatos e conexões

- Cada usuário tem uma **agenda de contatos privada** (como a do celular): nome,
  e-mail, data de nascimento para lembrar de parabenizar, observações. Serve
  para gerenciar mesmo pessoas que não usam o sistema.
- O sistema **não cruza nem revela** contatos. Se o contato criar conta, a
  ligação só acontece por **pedido de conexão aceito** pela pessoa.
- Automações para quem não usa o sistema (ex.: parabéns) ficam como **lembretes
  para o próprio usuário**. Envio de mensagem direta a terceiros só com canal
  e consentimento adequados (LGPD).

## Planos

| | Acadêmico (grátis) | Pro |
| --- | --- | --- |
| Salas para as quais foi convidado, trabalhos em grupo, professores, agenda, enquetes, materiais | ✅ | ✅ |
| IA consolidando trabalhos (cota justa por grupo) | ✅ | ✅ |
| Cursos fora da sala de origem, vida pessoal completa, cadernos e IA pessoal sem limite | — | ✅ |
| Professor: salas liberadas pelo master (ex.: até 3) | ✅ | ilimitadas |

Preço de lançamento: 1º mês R$ 9,90; depois R$ 29,90/mês; anual de lançamento
("Apoiador fundador") com 50% de desconto — R$ 179,40/ano, preço mantido.

Gateway recomendado: **Asaas** (Pix recorrente, cartão 2,9% + R$ 0,60, Pix 1,49%).
Kiwify/Hotmart (~9–10% + R$ 2,49) só se afiliados forem essenciais. A liberação
do Pro é feita por webhook com assinatura verificada; o cliente nunca se
autopromove.

Obrigações ao começar a cobrar: direito de arrependimento de 7 dias (CDC art. 49),
cancelamento fácil dentro do sistema, termos claros.

## Infraestrutura e custos

- Hoje: Vercel Hobby + Supabase Free (verificado em 30/09). Custo R$ 0.
- Vercel Hobby não permite uso comercial: o Pro (US$ 20/mês, cobre todos os
  projetos do time) é ligado **no dia da abertura do carrinho**.
- Supabase Free não tem backup: backup automático semanal no Google Drive do
  proprietário, criptografado, até a migração para o Pro (US$ 25/mês), prevista
  com os primeiros R$ 200 de receita.
- Mídia comprimida no dispositivo (foto ≈ 300 KB, miniatura ≈ 30 KB, áudio
  ≈ 250 KB/min). Vídeo por link, não por upload.
- Capacidade estimada no Free: piloto de 40–50 pessoas, com foco em texto.

## IA

Camada independente de provedor: cada tarefa escolhe o modelo (barato para
triagem, forte para consolidar). Fase grátis: cota gratuita do Gemini do
proprietário. Depois: Claude (Haiku 4.5 ≈ US$ 0,05 e Sonnet 5.5 ≈ US$ 0,10 por
trabalho consolidado de 5 partes). Candidato a gateway único: Vercel AI Gateway.
Chaves sempre em nome do proprietário, nunca emprestadas de terceiros.

## Integrações (ecossistema)

Asaas (pagamentos), Google Drive (backup e Docs), Microsoft Teams (avisos da
turma), Google Agenda (prazos), n8n/Make (automações), WhatsApp (fase futura).
Cada integração é um conector que liga, desliga e pode ser trocado.

## LGPD

- Aceite claro, em linguagem simples, com versão registrada.
- Painel "Meus dados": ver, baixar tudo, excluir conta.
- Conteúdo enviado a um grupo permanece no trabalho coletivo após a saída da
  pessoa, com autoria substituída por "ex-membro". Dados pessoais são apagados.
- Transparência sobre IA: quais dados vão ao provedor, que não são usados para
  treinar modelos. Melhoria do sistema apenas por estatísticas anônimas.

## Ordem de entrega

1. **Fundação** — contas, papéis por contexto, salas, grupos, convites, painel
   master com histórico, contatos privados, termos. Migração dos dados atuais
   do proprietário sem perda. Rascunho do banco em
   `supabase/drafts/fundacao_multiusuario.sql`.
2. **Piloto com a sala** — arquétipo Trabalho em grupo, visão do professor.
3. **IA consolidando** — padronização e exportação PDF/Docs.
4. **Pro e pagamento** — Asaas, gating de planos, Vercel Pro.
5. **Jornada personalizável e blocos da vida**, um de cada vez.

## O que foi entregue em 30/09 (fundação + piloto)

- Banco: migrações `20260930094408_multiusuario_fundacao` e `20260930094700_multiusuario_funcoes_app`, aplicadas com cópia de segurança em `private.personal_workspaces_backup_20260930`. Testes em `supabase/tests` (também no CI).
- Login aberto a contas Google verificadas; o proprietário virou o primeiro master.
- Telas: Salas e grupos (mural, enquetes, trabalhos, grupos, pessoas, convites), trabalho em grupo (partes, entrega, entrega em nome, revisão, documento final), Administração, Contatos, Minha conta (exportar/excluir), aceite de termos, `/termos`, `/privacidade`, `/convite/[token]`.
- Fase de lançamento: `platform_settings.open_access = true` (tudo liberado). O master desliga no painel quando abrir as vendas.

### Pendente
- IA de revisão (precisa da chave do provedor escolhido).
- Pagamento (Asaas) e Vercel Pro no dia da abertura do carrinho.
- Integrações Teams, Google Drive (backup), Google Agenda.
- Tela do Google: a tela de consentimento OAuth precisa estar em "Produção" no Google Cloud para que outras pessoas consigam entrar.

## Decisões de 13/10/2026

- **Rede de conhecimento no estilo do Instagram.** Layout, estilo e forma de pensar do Instagram, inclusive vídeos curtos, mas voltada ao conhecimento: não compete com o Instagram, é um modelo parecido e verdadeiro para trocar informação.
  - **Autonomia é da pessoa, nunca do proprietário.** Ela decide:
    - perfil aberto (qualquer um segue) ou fechado (pedido aceito, como amizade no Facebook);
    - mostrar ou esconder quem segue e quem a segue, e as próprias fotos;
    - o público de cada publicação: pública, seguidores, uma sala, um grupo, uma lista escolhida ou só ela;
    - se o perfil aparece fora do app (buscadores, outras redes).
  - **Agenda de contatos:** continua privada como acima. Seguir alguém na rede não revela contatos.
  - **Desenho e padrões recomendados:** [pesquisa aprofundada de 13/10](PESQUISA_APROFUNDADA_2026-10-13.md).
- **Fase piloto grátis, preparada para a cobrança.**
  - Até o lançamento, tudo é grátis (`open_access` ou cortesia). As pessoas convidadas usam como se fossem pagantes, para treinar, desenvolver e ver o banco funcionando de verdade.
  - Quando a cobrança começar, o proprietário é avisado e contrata o que for preciso.
  - Tudo que for comercial fica pronto antes, com a [lista do lançamento](LANCAMENTO_COMERCIAL.md).
- **Sessão ao vivo:** quem só assiste entra com apelido para perguntar e votar; conta é necessária só para pontuar.
- **Link da chamada:** no grupo, qualquer membro coloca ou tira; na sala, só quem conduz. Fica registrado quem colocou.

### Networking e Caixa de ferramentas (13/10/2026, conversa com o proprietário)

- **A aba "Salas e grupos" deixa de existir.**
  - **Networking:** a rede social de conhecimento no estilo do Instagram. Reúne o perfil, as salas, os grupos de qualquer assunto, o feed, a busca por #tema, a conversa em grupo, as enquetes e os trabalhos em grupo.
  - **Caixa de ferramentas:** vem depois.
  - **No celular,** o Networking entra na barra de baixo no lugar da Agenda (confirmado pelo proprietário).
  - **No menu lateral,** o Networking fica em "Conectar".
  - **Atualizações:** pedidos para seguir, pedidos para entrar em grupo, convites, menções, curtidas e lembretes dos desafios. Ficam numa tela própria com contador, que aparece na barra de baixo, no menu lateral e no sino do Networking.
  - **Avisos no celular:** usam os mesmos canais grátis dos lembretes (notificação do app, Telegram, WhatsApp). A pessoa escolhe:
    - o canal;
    - o tipo de aviso: pedidos e convites, menções, conversa dos grupos, e curtidas em resumo diário;
    - um horário de silêncio;
    - grupos silenciados.
- **Qualquer pessoa cria sala ou grupo.**
  - Quando um professor ou líder assume, ele ganha o **selo de oficial**, sem ferramentas a mais.
  - Na etapa 1, o selo é dado pela equipe da sala acima do grupo (professor ou responsável) ou pela administração. Para o líder de fora de uma instituição, a administração marca.
  - Cada pessoa gerencia os grupos que criou e participa dos grupos dos outros, de vários lugares ao mesmo tempo (UNIP, SEBRAE…).
- **Grupo personalizável.**
  - Modelos que só ligam ferramentas: Estudo, Trabalho da faculdade, Desafio, Saúde e bem-estar, Livre.
  - O dono liga e desliga as ferramentas: conversa, mural, enquetes, material do grupo, trabalho em partes, encontros e chamada, check-in diário, placar.
  - Convite, QR, link da chamada e configurações ficam no menu ⋯ do grupo.
- **A que o grupo se liga** (opcional): estudos (instituição › curso › matéria), uma área da vida, temas livres (#hashtags) ou nada. O vínculo mostra de onde o grupo vem e ajuda na busca.
- **Quem vê o grupo no Networking** (o dono escolhe): todos, só a instituição ou a sala, pessoas escolhidas, ou só quem tem o link.
  - Na etapa 1, "pessoas escolhidas" e "só quem tem o link" viraram uma opção só, "Só quem recebe o convite": não aparece na busca, e entra-se pelo link, pelo QR ou por aprovação. "Só a sala" vale para grupo criado dentro de uma sala.
  - Num grupo criado por aluno, o dono vê o e-mail só de quem aceitou mostrar ao entrar e não adiciona ninguém por e-mail. Professores e responsáveis da sala continuam como antes.
- **Como se entra** (pode combinar): entrada livre, pedido com aprovação, senha, pedir nome e e-mail. Neste último, a pessoa é avisada antes de que o e-mail vai para o dono do grupo.
- **Stories por aba:**
  - em "Seguindo", os stories de quem a pessoa segue;
  - em "Meus grupos", os stories e as publicações de todos os grupos dela, e embaixo a lista dos grupos.
  - Stories somem em 24 horas junto com as fotos, o que poupa espaço.
- **Desafios com competição saudável:**
  - O desafio é uma ferramenta da Caixa, usada num grupo ou fora dele.
  - **Para quem é:**
    - **do grupo:** o grupo vence junto; cada pessoa escolhe participar ou sair;
    - **pessoal que o grupo acompanha:** é da pessoa; o grupo vê e dá força;
    - **só para mim:** ninguém vê, e as medalhas ficam guardadas com a pessoa.
  - **Quem muda as regras:** só quem criou o desafio (ou os moderadores, no do grupo). Quem participa ou entra junto segue as regras como estão.
  - **Tipos, quanto mais personalizável melhor:** feito ou não, quantidade (páginas, km, copos de água), tempo (pode vir do Foco), etapas, evitar algo (dias seguidos sem), estudo (flashcards ou quiz) e foto leve. Quem cria também escolhe a duração, os dias de descanso, como confirmar (automático, eu marco, foto, um colega confirma) e quem vê.
  - **Check-in automático:** pode vir da vida pessoal (Foco, hábito, flashcards). Para o grupo vai só o "fez", nunca os detalhes.
  - **No feed:** entram os marcos (7, 15, 30 dias, desafio concluído), não todo check-in, com o botão "Dar força". A pessoa escolhe se as conquistas aparecem para os seguidores.
  - **Competição:**
    - meta do grupo na semana (todos ganham a medalha);
    - times dentro do desafio;
    - placar de pessoas só com quem quiser aparecer, contando constância, nunca peso ou medida;
    - vida extra de 1 dia por semana.
  - **Toque gentil** em quem ainda não fez, uma vez por dia e sem dizer quem foi.
  - **Depois:** desafio entre grupos ou salas.
- **Interações, poucas por vez para não poluir:**
  - "Gostei" existe em tudo.
  - Em desafio e conquista: "Dar força" e "Me inspirei". "Me inspirei" começa algo parecido no perfil de quem tocou e avisa a pessoa que ela inspirou alguém.
  - Em post de conhecimento: "Útil" e "Salvar no meu baralho" (flashcards).
  - No desafio pessoal de outra pessoa: "Entrar junto" (segue as regras dela) e "Me inspirei" (cria o próprio).
  - Dentro do desafio do grupo: "Dar um toque".
- **Medalhas e conquistas no perfil:**
  - Medalha vem de desafio concluído. A IA desenha cada uma a partir do nome e do tipo; o desenho é gerado na hora e não ocupa espaço.
  - Conquista é marco da jornada: horas de foco, primeiro grupo criado, pessoas inspiradas.
  - Cada medalha e cada conquista tem seu público: Público, Seguidores ou Só eu. "Ver como visitante" mostra o que os outros enxergam; o que é "Só eu" não aparece nem na contagem.
- **Perfil primeiro:** antes de criar um grupo ou usar o Networking, um passo rápido pede o nome (obrigatório) e uma foto ou avatar (bichinho, iniciais ou símbolo). O resto é opcional.
- **Conteúdo:**
  - Imagens servem para ilustrar o conhecimento; foto pessoal é permitida.
  - Sem vídeo por enquanto.
  - O card de texto é gerado a partir do texto e não ocupa espaço.
  - Na etapa 3a, a foto (até 4 por publicação, 1 por story) é reduzida no aparelho para até 300 KB e fica no banco presa à publicação: apagar a publicação ou o story vencer apaga a foto junto. No plano grátis, cada pessoa guarda até 25 MB de fotos, e o app inteiro até 300 MB.
  - Fotos da conversa ficam 90 dias.
  - Mensagem direta entre duas pessoas vem depois dos grupos.
- **Caixa de ferramentas:**
  - A ferramenta mora na Caixa e pode ser usada em qualquer lugar do sistema, inclusive dentro de um grupo.
  - Regra: ferramenta pega um conteúdo e faz algo com ele; o que organiza o tempo ou guarda a história da pessoa fica no próprio lugar.
  - Entram os flashcards. Foco, agenda, hábitos e metas ficam onde estão; o "Estudar junto" da Caixa usa o Foco por baixo.
  - **Material** fica no seu contexto (curso e grade, matéria, grupo, pessoal), nunca num lugar genérico.
- **Protótipo para aprovação** (só desenho, sem mexer no app): https://claude.ai/artifact/Tf3o3JAunPUSm56d4jWyWt

### Perfil, Meu espaço e navegação (13/10/2026, conversa com o proprietário)

- **Perfil no jeito do Instagram:** a foto do canto abre "Meu perfil" (anel do story, publicações, seguidores, seguindo, Editar perfil, Novo story, publicações em grade). O "?" sai do canto; o sininho mostra as Novidades.
- **Meu espaço separado do perfil:** o perfil é o que a pessoa mexe sempre (nome, foto, "sobre você", privacidade); o Meu espaço é o que é só dela e muda pouco (conta, contato, áreas, aparência, avisos, conexões, assistentes, dados). Um nome e uma foto só para o app inteiro.
- **Voltar passo a passo**, dentro do Networking e do Meu espaço, no botão do app e no do celular.
- **Novidades que pulam:** número vermelho na aba Networking, na foto e no sininho, e um balão do que chegou.
- **Conquistas, não medalhas:** a aba do perfil chama Conquistas (as medalhas dos desafios ficam dentro). Coerente com "Sua vida é uma jornada, não uma corrida": a gamificação existe, mas o coração é a plenitude, não a competição. A aba só aparece quando houver a primeira conquista; a pessoa pode esconder a aba inteira ou cada conquista e medalha.
- **Publicação não vira flashcard.** A ideia de "Salvar no meu baralho" saiu, e a palavra "baralho" também. "Salvos" guarda publicações só para a pessoa.
- **Flashcards novos depois:** modelos de múltipla escolha e de resposta escrita, a partir dos modelos de prova do proprietário. Não mexer agora.
- **QR do perfil:** anotado para depois; no piloto as pessoas se conhecem e se acham pelos grupos.
- **Limites pensando no plano pago:** foto nítida sem ultra resolução (até 1440 px e 300 KB, faixa do Instagram), vídeo só por link. Os limites ficam ajustáveis num lugar só, para subir quando o Supabase e a Vercel forem para o Pro. O piloto roda grátis com pessoas próximas antes da venda.
- **Protótipo aprovado:** https://claude.ai/artifact/NXnz7nXAGvdoGpHjfYYUCm
