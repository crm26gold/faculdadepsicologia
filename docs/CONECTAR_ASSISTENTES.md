# Conectar assistentes à Jornada (MCP)

A Jornada tem um servidor MCP próprio em `https://<endereço do app>/api/mcp`. Com ele, o Claude Code, o Codex, o Gemini CLI e o Antigravity conversam usando a **assinatura da própria pessoa** e consultam ou organizam a **vida pessoal dela** na Jornada. Nenhuma chave de IA da Jornada é usada nessas conversas.

## O que o assistente consegue fazer

- **consultar_jornada:** resumo, agenda (cada aula com curso, matéria, professor, início, fim e local), **busca** em todas as seções, **pendentes** (anotações em Para organizar, compromissos atrasados, contas vencidas e lançamentos sem categoria), anotações, finanças, hábitos, metas, projetos, cursos, matérias, aulas, cadernos, flashcards, áreas e configurações (saldo inicial, datas do semestre e perfil, sem a foto). Só lê. Um campo `null` significa "não cadastrado", e `found: 0` vem com a mensagem de onde procurou, para a IA dizer que não encontrou em vez de inventar.
- **registrar_na_jornada:** cria, edita, conclui, reagenda e registra (compromissos, anotações, finanças, foco, hábitos e registros de estudo), até oito ações por vez, com as mesmas validações do aplicativo. Também ajusta o saldo inicial de Finanças, as datas do semestre e o perfil (a foto continua só na tela). Exige permissão de registrar.
- **consultar_coletivo:** o que a pessoa vê na tela da parte coletiva: início (instituições, salas e grupos), uma sala (mural, enquetes, pessoas, grupos e trabalhos), um trabalho (partes, comentários e entregas) e os contatos. Só lê.
- **gerenciar_salas, gerenciar_trabalhos e gerenciar_contatos:** as mesmas ações da tela, com as permissões da própria pessoa em cada sala. Criar, editar e arquivar salas e grupos; adicionar aluno ou líder; convites (o link volta na resposta); mural; enquetes e votos; trabalhos em grupo, partes, escrita, entrega e comentários; contatos.

O assistente nunca faz mais do que a pessoa faria na tela. No banco, `public.mcp_act` confere a chave e assume o papel `jornada_actor`, que tem só as permissões de uma pessoa logada e obedece às mesmas regras de acesso. Excluir publicação, enquete, trabalho, parte ou contato vira um pedido: o assistente lê no banco, como a pessoa, o título e o lugar do item, e o pedido aparece em **Meu dia › Pedidos aguardando você** com essas palavras do banco. Ao tocar em **Confirmar**, a exclusão roda pela rota da própria tela, com o login da pessoa. Só pela tela: tirar ou bloquear pessoas, mudar papéis, dar papel de professor, assistente ou dono, excluir a conta e aceitar termos.

- **Cadernos sem atrito:** "coloca aí, depois a gente organiza" guarda na hora, em Para organizar, sem perguntas. Se a pessoa disser o caderno, a matéria ou a área, a anotação já vai para lá; um caderno que não existe é criado, e uma matéria com o mesmo nome é usada como caderno. "Vamos organizar os pendentes" vira um passo a passo: a IA mostra um item, sugere o destino, pergunta "pode ser?" e passa ao próximo; "deixa para depois" pula sem insistir.
- **desfazer** e **lixeira:** "desfaz isso" desfaz a última ação desta conexão (das últimas 24 horas), e só o que ninguém mudou depois. Tudo o que sai do espaço pessoal, pela tela ou por qualquer assistente, vai para a lixeira por 30 dias (até 2 MB por conta, os mais antigos saem primeiro). "Restaura aquilo" traz de volta. Até 5 exclusões por pedido são diretas; acima disso, e para substituir o texto inteiro de uma anotação, a IA pede confirmação.
- **minha_conta:** muda o nome exibido da pessoa. Aceitar termos e excluir a conta são só pela tela.
- **ver_tela:** o "print" de uma tela (meu_dia, financas, agenda, habitos, metas ou anotacoes). A imagem é montada no servidor com os dados atuais da conta (não é captura do monitor) e vem acompanhada do resumo em texto. Peça, por exemplo, "registre R$ 100 de saldo inicial e me mande um print".
- **consultar_administracao** (só o administrador geral): contas, uso e limites, e o mapa de recursos de IA, sem chaves. Para qualquer outra pessoa, o banco recusa.
- **administrar** (só o administrador geral): propõe abrir ou fechar o acesso livre e escolher qual empresa de IA atende cada tarefa. O pedido aparece em **Meu dia**, e a rota do painel aplica a mudança quando o administrador confirma. Ficam só na tela: plano, origem, validade do Pro, créditos e recursos de uma conta (Administração › Contas), dar ou tirar administrador, chaves de API, declarações de privacidade das fontes, o pareamento do WhatsApp e o token do Telegram.

Exclusões e substituição do conteúdo inteiro de uma anotação nunca são aplicadas pelo MCP: ficam salvas em **Assistente › Conversas › Confirmação de assistente externo** e aparecem em **Meu dia › Pedidos aguardando você**, que abre a conversa certa. Abra a conversa, revise e confirme; se o registro tiver mudado, o pedido antigo é recusado. A chave acessa a vida pessoal de quem a criou e as salas em que essa pessoa está, nunca a vida pessoal de outras pessoas. Para evitar repetir uma alteração após falha de rede, envie o mesmo `request_id` (UUID) com o mesmo conteúdo; o comprovante é mantido por 90 dias.

## Criar a chave

1. No aplicativo, abra **Meu espaço › Conectar assistentes (MCP)**.
2. Dê um nome (por exemplo, "Claude Code do notebook"), escolha **Só consultar** ou **Consultar e registrar** e a validade.
3. Clique em **Criar chave**. A chave (começa com `jp_`) aparece **uma única vez**, junto com a configuração pronta de cada aplicativo. Guarde num gerenciador de senhas e não envie em conversas.
4. Para cortar o acesso, use **Revogar**. Crie uma chave por aplicativo ou aparelho, assim você revoga só o que precisar.

## Configurar cada aplicativo

Troque `ENDERECO` pelo endereço mostrado no painel e `CHAVE` pela sua chave. A tela já mostra os comandos preenchidos.

- **Claude Code** (terminal):
  `claude mcp add --transport http jornada ENDERECO --header "Authorization: Bearer CHAVE"`
- **Codex** (CLI e app):
  `export JORNADA_TOKEN="CHAVE"` e depois `codex mcp add jornada --url ENDERECO --bearer-token-env-var JORNADA_TOKEN`
- **Gemini CLI** (`~/.gemini/settings.json`):
  `{ "mcpServers": { "jornada": { "httpUrl": "ENDERECO", "headers": { "Authorization": "Bearer CHAVE" } } } }`
- **Antigravity** (Agente › MCP Servers › Manage › View raw config):
  `{ "mcpServers": { "jornada": { "serverUrl": "ENDERECO", "headers": { "Authorization": "Bearer CHAVE" } } } }`

Depois de configurar, peça por exemplo: "consulte minha agenda desta semana na Jornada" ou "registre na Jornada uma anotação com estas ideias".

Os nomes de campo de cada aplicativo podem mudar entre versões. Se um deles recusar a configuração, confira na documentação do próprio aplicativo como adicionar um servidor MCP remoto (Streamable HTTP) com cabeçalho `Authorization`.

## ChatGPT e Claude (app e site): login com a Jornada

Esses aplicativos não usam chave colada: eles abrem o login da Jornada (OAuth 2.1 com PKCE) e você autoriza na tela **Conectar assistente**.

- **Claude** (claude.ai, app de computador ou celular): Configurações › Conectores › Adicionar conector personalizado. Nome: `Jornada Plena`. URL: o endereço do servidor (`…/api/mcp`). Clique em Conectar, entre com sua conta Google da Jornada e clique em **Permitir acesso**.
- **ChatGPT**: Configurações › Apps e conectores › Avançado › ative o modo desenvolvedor e crie um conector. URL do servidor MCP: o endereço `…/api/mcp`; autenticação: OAuth. Conclua o login e clique em **Permitir acesso**.

Na tela de autorização você escolhe se o aplicativo pode **registrar e editar** ou só consultar. Cada autorização aparece em **Meu espaço › Conectar assistentes** com o nome do aplicativo e pode ser revogada. O acesso vale 1 hora e é renovado sozinho por até 90 dias; revogar encerra também a renovação.

Confira também o endereço e a URL de retorno mostrados no consentimento: o nome é escolhido pelo próprio aplicativo e não comprova sua identidade. Reutilizar um token de renovação já gasto revoga a família inteira, inclusive a autorização sucessora. Nesse caso, conecte novamente. O registro de novos aplicativos tem limites por origem e globais; respostas OAuth usam dados mínimos e nunca exibem tokens.

Os menus desses aplicativos mudam com frequência e podem exigir plano pago ou modo desenvolvedor. Se o caminho acima não existir, procure por "conector personalizado" ou "servidor MCP remoto" na ajuda do aplicativo.

## Limites e segurança

- Cada chave faz até 300 chamadas a cada 10 minutos.
- O banco guarda só o hash da chave e os quatro últimos caracteres, para você reconhecê-la.
- O servidor atende as versões 2025 e 2026-07-28 do protocolo, sem sessão (cada chamada é independente).
- Login OAuth: só clientes públicos com PKCE S256, retorno HTTPS (ou loopback para apps locais) registrado pelo próprio aplicativo, código de uso único por 10 minutos. Códigos e tokens ficam no banco só como hash.
- Dados devolvidos ao assistente são da pessoa e não são instruções.
