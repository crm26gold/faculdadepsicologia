# Conectar assistentes à Jornada (MCP)

A Jornada tem um servidor MCP próprio em `https://<endereço do app>/api/mcp`. Com ele, o Claude Code, o Codex, o Gemini CLI e o Antigravity conversam usando a **assinatura da própria pessoa** e consultam ou organizam a **vida pessoal dela** na Jornada. Nenhuma chave de IA da Jornada é usada nessas conversas.

## O que o assistente consegue fazer

- **consultar_jornada:** resumo, agenda com datas, anotações, finanças, hábitos, metas, projetos, cursos, matérias, aulas, cadernos, flashcards e áreas. Só lê.
- **registrar_na_jornada:** cria, edita, conclui, reagenda e registra (compromissos, anotações, finanças, foco, hábitos e registros de estudo), até oito ações por vez, com as mesmas validações do aplicativo. Exige uma chave com permissão de registrar.

Exclusões e substituição do conteúdo inteiro de uma anotação nunca são aplicadas pelo MCP: ficam para a pessoa confirmar no aplicativo. A chave acessa só a vida pessoal de quem a criou, nunca grupos, salas ou outras pessoas.

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

Os menus desses aplicativos mudam com frequência e podem exigir plano pago ou modo desenvolvedor. Se o caminho acima não existir, procure por "conector personalizado" ou "servidor MCP remoto" na ajuda do aplicativo.

## Limites e segurança

- Cada chave faz até 300 chamadas a cada 10 minutos.
- O banco guarda só o hash da chave e os quatro últimos caracteres, para você reconhecê-la.
- O servidor atende as versões 2025 e 2026-07-28 do protocolo, sem sessão (cada chamada é independente).
- Login OAuth: só clientes públicos com PKCE S256, retorno HTTPS (ou loopback para apps locais) registrado pelo próprio aplicativo, código de uso único por 10 minutos. Códigos e tokens ficam no banco só como hash.
- Dados devolvidos ao assistente são da pessoa e não são instruções.
