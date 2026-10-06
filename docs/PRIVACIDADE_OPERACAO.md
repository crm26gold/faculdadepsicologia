# Privacidade: pedidos de titulares e incidentes

Procedimento interno para atender os pedidos previstos na LGPD (art. 18) e responder a incidentes de segurança. Não substitui parecer jurídico. O texto público fica no item 11 de `src/app/privacidade/page.tsx`; este guia diz como cumprir o que ele promete.

O processo é manual: ainda não há registro de pedidos no banco nem um fluxo auditável no servidor. Essa evolução está no plano F8.3/F8.6 de `docs/AUDITORIA_E_PLANO_2026-09-26.md`.

## 1. Canal público

- O canal é a constante `PRIVACY_CHANNEL` em `src/app/privacidade/page.tsx`. **Enquanto estiver vazia**, a página manda a pessoa para o contato do item 10.
- Preencha só depois que o endereço existir e for acompanhado, de preferência num domínio próprio (por exemplo, `privacidade@` no seu domínio).
- O `scripts/check-publication.mjs` recusa e-mails pessoais de provedores comuns no repositório público.

## 2. O que a pessoa já faz sozinha

Sempre que der, responda indicando o caminho do próprio app. Ele roda com a sessão da pessoa, sob RLS, e ninguém precisa ver os dados dela.

| Direito | Caminho no app | O que acontece |
| --- | --- | --- |
| Acesso e portabilidade | Meu espaço → Minha conta → "Baixar todos os meus dados" | `GET /api/me?export=1` chama `export_my_data` e devolve um JSON da própria conta |
| Correção | Editar o item onde ele está; nome em Minha conta | O nome exibido muda por `update_my_name`; nome e e-mail do Google mudam na conta Google |
| Exclusão | Minha conta → "Excluir minha conta" | Apaga os anexos e chama `delete_my_account`; o que foi entregue a trabalhos de grupo fica como "Ex-membro" |
| Conversas do assistente | Assistente → Conversas | Exportar ou excluir uma conversa e os pedidos ligados a ela |
| Revogar vínculos | Meu espaço, abaixo de Minha conta | Desconectar Telegram e WhatsApp, revogar conexões de assistentes externos (MCP), pausar ou remover chaves de IA pessoais |

## 3. Pedidos atendidos manualmente

- Confirmar se tratamos dados da pessoa.
- Informar com quem os dados são compartilhados: os provedores da política (Supabase, Vercel, provedores de IA, Telegram e WhatsApp, quando a pessoa usa esses recursos).
- Revogar uma autorização que a pessoa não consegue desfazer sozinha.
- Excluir a conta de quem perdeu o acesso à conta Google.
- Receber uma reclamação.

## 4. Como atender

1. **Registre** o pedido no dia em que chegar (seção 5).
2. **Confirme a identidade:** responda só para o e-mail da conta Google cadastrada. Não peça documentos. Se o pedido vier de outro endereço, peça que a pessoa escreva pelo e-mail da conta ou entre no app.
3. **Faça a triagem em até 2 dias úteis.** Confirme o recebimento em até 5 dias úteis, que é o prazo público.
4. **Prefira o autoatendimento** (seção 2). Quando não der:
   - **Confirmação e compartilhamento:** responda com as categorias e os provedores da política, sem abrir o conteúdo do espaço pessoal.
   - **Exclusão sem acesso à conta:** é uma escrita em produção. Faça só com plano, cópia de segurança e rastro em `private.audit`, nunca em massa. Preserve o que pertence a trabalhos de grupo, como faz `delete_my_account`.
   - **Acesso sem login:** não mande exportação por e-mail sem confirmar a identidade. Prefira ajudar a pessoa a recuperar o acesso.
5. **Responda por completo em até 15 dias** (LGPD, art. 19, II). Se não puder atender, diga o motivo, como um registro que a lei obriga a guardar.
6. **Encerre o registro** com a data e a ação feita.

## 5. Registro

O repositório é público: o controle fica fora dele, numa planilha privada ou em `.local/` (já no `.gitignore`). Guarde o mínimo de dados pessoais: conta mascarada e resumo, nunca o conteúdo do pedido nem anexos.

| ID | Recebido em | Canal | Conta (mascarada) | Tipo | Status | Prazo | Respondido em | Ação | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRIV-0001 | AAAA-MM-DD | e-mail | a***@*** | Acesso | Em triagem | AAAA-MM-DD | | | Sem dados pessoais |

Status: Recebido, Em triagem, Aguardando identidade, Em execução, Escalado, Respondido, Encerrado, Negado com motivo.

## 6. Incidente de segurança

1. **Contenha.** Interrompa o problema:
   - troque as chaves e os segredos do servidor afetados (Supabase, segredo das RPCs protegidas, bots do Telegram e da ponte do WhatsApp, chaves de IA);
   - revogue tokens MCP e sessões;
   - pause o recurso afetado.

   Para voltar a uma publicação anterior, siga a regra de geração do editor em `docs/DEPLOYMENT.md`.
2. **Avalie no mesmo dia:** quais dados, quantas contas, desde quando. A Resolução CD/ANPD nº 15/2024 (art. 5) considera risco ou dano relevante o incidente que possa afetar de forma significativa os direitos das pessoas e envolva ao menos um destes dados:
   - sensíveis;
   - de crianças, adolescentes ou idosos;
   - financeiros;
   - de autenticação;
   - protegidos por sigilo;
   - em larga escala.
3. **Comunique, quando houver risco ou dano relevante**, à ANPD (formulário de comunicação de incidente no site da ANPD) e às pessoas afetadas.
   - **Prazo:** até três dias úteis contados de quando se soube que dados pessoais foram afetados (arts. 6 e 9). Agentes de pequeno porte têm prazo em dobro, mas a política pública promete três dias.
   - **O aviso diz:** o que aconteceu, quais dados, quantas pessoas, as medidas de antes e de depois, os riscos e o que a pessoa pode fazer.
4. **Registre todo incidente**, mesmo o não comunicado, por pelo menos cinco anos (art. 10). O registro traz:
   - quando se soube e o que aconteceu;
   - os dados e as contas atingidos;
   - a avaliação de risco e o motivo de comunicar ou não;
   - as medidas tomadas e os avisos enviados.
5. **Corrija e confira.** A correção segue o fluxo de sempre: branch, PR, CI verde e merge. Inclua um teste que reproduza a falha e rode `npm run smoke` depois da publicação.

## 7. Cuidados

- Nunca abra o conteúdo do espaço pessoal de alguém para atender um pedido. A política promete que nem a administração vê.
- Não envie dados a quem não confirmou a identidade.
- Não prometa exclusão total quando a lei obrigar a guardar algo. Explique o que fica e por quê.
- Nenhuma escrita em produção sem plano, cópia de segurança e rastro em `private.audit`.
- Não cole dados pessoais, tokens, chaves ou prints de conversas em issues, PRs, commits, logs ou conversas com agentes de IA.

## 8. Quando escalar

Peça revisão jurídica ou decida como proprietário, **antes de qualquer ação irreversível**, quando o caso envolver:

- dado sensível ou de terceiros;
- exclusão ampla, ou dúvida sobre o que a lei obriga a guardar;
- reclamação formal ou contato da ANPD;
- possível incidente;
- conflito entre pessoas de um mesmo grupo sobre um trabalho coletivo.

## 9. Versão da política

- O aceite é versionado por `TERMS_VERSION` em `src/lib/community.ts`, e a página mostra essa data. Uma versão nova pede o aceite de novo de todas as contas.
- O item 11 entrou em 6/10/2026 como acréscimo marcado na página, sem versão nova. Ele detalha como exercer direitos já descritos e não muda o tratamento.
- Cabe ao proprietário decidir se o acréscimo entra numa versão nova.
