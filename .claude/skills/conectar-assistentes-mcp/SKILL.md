---
name: conectar-assistentes-mcp
description: Prepara, testa ou depura a conexão de ChatGPT, Claude e outros assistentes ao MCP da Jornada Plena: OAuth (CIMD, registro dinâmico, iss, resource), anotações das ferramentas, MCP Apps, diretórios e o uso do plano da pessoa. Use ao mexer em src/lib/mcp, src/app/api/mcp ou src/app/api/oauth, quando uma conexão falhar ou quando surgirem "conectar o ChatGPT", "conectar o Claude", "conector", "plugin" ou "usar minha assinatura".
---

# Conectar assistentes ao MCP da Jornada

Vocabulário fixo; mantenha cada sentido separado:

- **Entrada:** a pessoa conversa no ChatGPT ou no Claude, e o assistente chama as ferramentas da Jornada (`/api/mcp`). O modelo é pago pelo plano da pessoa.
- **Plano como motor:** o assistente da própria Jornada usa o plano da pessoa. Só existe por programa oficial do fornecedor.
- **Saída:** a Jornada chama ferramentas de servidores externos (`src/lib/integrations/mcp.ts`), hoje só para descobri-las.

## Lista de conferência da entrada

Confira cada item no código antes de dizer que um cliente funciona:

1. **Descoberta:** `/.well-known/oauth-protected-resource` aponta o servidor de autorização. Uma chamada sem token recebe `401` com `WWW-Authenticate` e `resource_metadata`; o Claude ignora esse cabeçalho quando a resposta é 200.
2. **Metadados do servidor de autorização** (`authorizationServer()` em `src/lib/mcp/oauth.ts`):
   - anunciar `code_challenge_methods_supported: ["S256"]`;
   - anunciar `token_endpoint_auth_methods_supported` com `none`;
   - anunciar `registration_endpoint`;
   - anunciar `client_id_metadata_document_supported: true` para CIMD; o Claude só escolhe CIMD quando vê isso junto com `none`;
   - anunciar `authorization_response_iss_parameter_supported: true` **somente** quando todo redirecionamento, de sucesso ou de erro, levar `iss` idêntico ao emissor.
3. **CIMD:** o `client_id` é uma URL HTTPS.
   - Busque o documento com a proteção de `publicHttps`: só HTTPS, sem IP privado ou de loopback, tamanho e tempo limitados.
   - Exija `client_id` igual à URL e `redirect_uri` exato. Retornos em `localhost` ou `127.0.0.1` ignoram a porta (Claude Code).
   - Mostre na tela de consentimento o nome e o **host** de retorno.
   - Registros conhecidos: ChatGPT `https://chatgpt.com/oauth/client.json`; Claude Code `https://claude.ai/oauth/claude-code-client-metadata`; retorno do Claude `https://claude.ai/api/mcp/auth_callback`.
4. **Token:** o parâmetro `resource` vira a audiência do token e é conferido em cada chamada. A renovação gira; reutilizar uma renovação revoga a família (já implementado). O endpoint responde em até 10 s (30 s na renovação).
5. **Ferramentas:** toda ferramenta tem `title` e anotações booleanas explícitas.
   - **Leitura:** `readOnlyHint: true`.
   - **Só adiciona:** `destructiveHint: false`.
   - **Edita, conclui, substitui ou apaga:** `destructiveHint: true`.
   - **Uma ferramenta por operação:** os diretórios recusam um "executor genérico" que escolhe a operação.
   - Mantenha `request_id`, os recibos e a confirmação de exclusões da própria Jornada.
6. **Escopos:** `ler` para consulta e `registrar` para escrita, opcional para a pessoa.
7. **Privacidade:** a documentação diz à pessoa que o assistente conectado recebe os dados que lê, sob os termos da conta dela. Áreas sensíveis pela LGPD (saúde, psicologia) merecem mascaramento opcional.

Termina quando cada item estiver marcado como verificado no código ou estiver listado como lacuna, com arquivo e linha.

## Testar de verdade

1. Rode os testes locais: `tests/mcp-server.test.ts`, `tests/mcp-oauth-*.test.ts` e `tests/sql/mcp-*.sql`, pela suíte `supabase/tests/multiusuario_api.sql`.
2. Confira o protocolo com o MCP Inspector apontado para a prévia ou para a produção.
3. O aceite real é do proprietário, na conta dele:
   - **Claude:** Personalizar › Conectores › Adicionar conector personalizado, colando a URL `/api/mcp` (o plano grátis permite 1).
   - **ChatGPT:** na web, em chatgpt.com/plugins, adicionar servidor MCP personalizado e criar como plugin.
   - Peça para consultar e depois registrar algo pequeno. Confira o recibo em Conversas e o registro no sistema.

"Funciona" exige esse aceite real: endpoint de descoberta, teste sintético e CI verde são estados diferentes.

## Interface dentro do assistente (MCP Apps)

Extensão `io.modelcontextprotocol/ui`, pacote `@modelcontextprotocol/ext-apps`. Um recurso `ui://` com `text/html;profile=mcp-app` aparece no ChatGPT, no Claude (inclusive no celular), no VS Code, no Cursor e no M365 Copilot.

- Declare `_meta.ui.csp`. No Claude, `_meta.ui.domain` são os 32 primeiros caracteres hexadecimais de `sha256(serverUrl)` seguidos de `.claudemcpcontent.com`.
- A ferramenta continua utilizável sem interface.
- A gravação continua atrás da confirmação da Jornada.

## Plano da pessoa como motor

- **ChatGPT:** pelo programa "Sign in with ChatGPT – ChatGPT plan usage", só para Plus e Pro e só texto, com `store:false` e `stream:true`, sem áudio e sem MCP hospedado. Um app hospedado e fechado precisa de aprovação por formulário. Guarde os tokens cifrados no servidor e mostre à pessoa quando o plano dela está em uso. Em erro do plano, volte para as fontes da Jornada de forma visível.
- **Claude:** o assistente da Jornada usa chaves de API do Console ou de nuvem. Os termos da Anthropic proíbem login com Claude.ai e o uso de credenciais de planos Free, Pro ou Max por terceiros.
- **Sampling do MCP:** está descontinuado desde a versão 2026-07-28 e fica fora dos planos da Jornada.

## Referência

O estado de cada cliente em 05/10/2026, com fontes, está na seção 4 de [`docs/PESQUISA_RECURSOS_IA_2026-10-05.md`](../../../docs/PESQUISA_RECURSOS_IA_2026-10-05.md). O guia para a pessoa conectar fica em [`docs/CONECTAR_ASSISTENTES.md`](../../../docs/CONECTAR_ASSISTENTES.md).
