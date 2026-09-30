# Jornada Plena — visão, decisões e fundação multiusuário

Registro das decisões tomadas pelo proprietário em 30/09/2026. Este documento tem
precedência sobre o roadmap anterior no que diz respeito a usuários, grupos,
papéis, planos e integrações. A fundação e o piloto já estão em produção (ver
seção "O que foi entregue em 30/09").

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
