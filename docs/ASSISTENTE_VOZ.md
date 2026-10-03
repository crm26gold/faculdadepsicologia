# Assistente de voz da Jornada Plena

## Começar uma chamada

Entre com sua conta e abra **Assistente › Conversar ao vivo › Iniciar chamada**. Autorize o microfone. Fale naturalmente; é possível interromper a resposta, desligar o microfone, silenciar a voz e encerrar. Cada chamada dura até 20 minutos. Fechar a chamada ou sair da página libera o microfone. O botão de microfone do chat continua sendo ditado de uma mensagem.

A conversa atual aparece acima do cartão de chamada. Quando já há mensagens, o cartão fica compacto. **Conversas** abre o gerenciador: pesquisar pelo título ou pelas mensagens, renomear, fixar, arquivar, exportar em texto, retomar ou excluir. Excluir uma conversa apaga também o histórico de seus pedidos; os registros criados na agenda, nas notas e nas finanças continuam na Jornada. Confirme a exclusão no diálogo.

Novas conversas são salvas na conta autenticada e têm uma cópia local separada por conta. O histórico antigo, que não identificava a conta, só é recuperado por sua escolha: abra **Conversas**, recupere o histórico deste aparelho e salve cada conversa desejada na conta. Não há importação silenciosa entre contas. Conflitos preservam uma cópia para revisão; exporte antes de recarregar. A pesquisa abrange as conversas carregadas; use o botão para carregar mais quando disponível. Conversas com mais de mil mensagens permanecem neste aparelho e podem ser exportadas antes de começar outra.

## Configurar o provedor de voz

A tarefa **Chamada ao vivo** é independente de **Conversa do assistente**. A primeira cuida da conversa falada; a segunda interpreta fotos e planeja ações com o núcleo da Jornada. Trocar a voz não exige trocar o planejador. Só o proprietário configura chaves em **Administração › Inteligência artificial**.

### Gemini

1. Confira se o provedor **Google Gemini** tem uma chave ligada com acesso à Live API.
2. Na tarefa **Chamada ao vivo**, escolha **Google Gemini** e **Automático · voz disponível**, marque **Ligada** e salve.
3. Abra uma nova chamada no Assistente.

O servidor lista os modelos autorizados para a chave, prioriza modelos regulares e evita escolher raciocínio prolongado quando a alternativa regular da mesma versão está disponível. `GEMINI_LIVE_MODEL`, se configurada na Vercel, fixa um modelo autorizado e prevalece sobre a escolha automática.

A autorização temporária permanece limitada ao modelo, às instruções e às ferramentas. Uma resposta 400 com `INVALID_ARGUMENT` sem motivo específico permite uma tentativa com a outra forma documentada de restrições. Não há tentativa com token irrestrito. Essa correção de integração precisa ser validada com a chave real; testes locais não provam que o Gemini a aceitou.

### OpenAI / GPT Live

1. Na plataforma de API da OpenAI, crie uma chave de um projeto com acesso e cota para **gpt-live-1**. A assinatura do ChatGPT/Codex não inclui automaticamente esse uso de API.
2. Em **Administração › Inteligência artificial › Provedores › OpenAI**, cole a chave no campo protegido, marque **Ligado** e salve. Não envie a chave no chat.
3. Na tarefa **Chamada ao vivo**, escolha **OpenAI**, modelo **gpt-live-1**, marque **Ligada** e salve.
4. Mantenha **Conversa do assistente** em um provedor já configurado, como Gemini, para planejar as ações e interpretar fotos.
5. Teste no celular. O erro exibido informa uma referência se a preparação da sessão falhar.

A sessão usa WebRTC e delegação ao núcleo da Jornada. O servidor negocia a sessão com a chave permanente; o navegador recebe a resposta de conexão, não a chave. Não há troca automática entre Gemini e OpenAI durante uma chamada. A mudança exige uma nova chamada e o histórico continua na Jornada. O adaptador foi validado com eventos simulados; a qualidade de áudio e a autorização real precisam de um teste com a chave configurada.

## O que a voz pode executar

O executor de domínio é compartilhado com o chat:

- Consultar agenda, anotações, finanças, hábitos, metas, projetos e estudos.
- Criar, editar, reagendar e concluir registros; marcar contas pagas ou recebidas.
- Criar cursos, matérias, aulas, cadernos, flashcards e áreas.
- Iniciar, pausar, retomar e encerrar foco.
- Desfazer alterações desta conversa quando os mesmos itens não mudaram depois.

Nomes ambíguos e vínculos inválidos são recusados. Excluir um registro ou substituir todo o conteúdo de uma nota exige confirmação nova e específica: **“confirmo a exclusão”**, **“confirmo a substituição”** ou o botão **Confirmar**. Um “sim” isolado não autoriza a exclusão. O executor verifica o registro e se ele mudou desde o pedido.

Marcar uma conta paga é um registro; não transfere dinheiro. Mensagens externas, pagamentos bancários e gerenciamento de contas/permissões não são capacidades deste executor.

## Continuidade dos pedidos

Pedidos aceitos por voz são registrados no banco antes do trabalho. Cada pedido tem identificador e resultado próprios. A função do servidor continua o processamento mesmo que a chamada seja encerrada. Interromper a fala não cancela um pedido já aceito. A alteração do workspace e seu comprovante de execução são gravados na mesma transação; repetir o identificador não reaplica uma alteração concluída.

O cliente busca o resultado, atualiza o workspace e só anuncia uma alteração salva depois do retorno persistido. Ao voltar à conversa, recupera os resultados. Se uma função for encerrada antes de concluir, pode aparecer **Retomar este pedido**; não existe ainda um trabalhador independente que retome automaticamente todas as falhas. Confira o resultado antes de repetir o comando como um novo pedido.

O chat escrito e a interpretação de fotos ainda usam a requisição direta existente. A continuidade no servidor se aplica aos pedidos aceitos pela chamada. Desligar o microfone ou trocar de aplicativo não é garantia de que o navegador continuará enviando áudio.

## Fotos e informações incompletas

Durante a chamada, toque no clipe para enviar uma imagem. A foto original fica em uma anotação privada da sua conta; a interpretação é acrescentada e identificada como informação do assistente para conferir. A leitura usa a tarefa **Conversa do assistente**. O anexo pode ter até 25 MB para guardar; a leitura de imagem pela IA limita o arquivo a 4 MB e verifica o formato. Só são lidos anexos pertencentes às suas notas. Não são buscadas imagens em endereços arbitrários.

A leitura de fotos não recebe contexto financeiro nem histórico pessoal e não produz ações no executor, mesmo quando o modelo tenta devolver uma ação. O original e a interpretação ficam na anotação; você pode então pedir por voz ou texto o registro que deseja fazer. As instruções pedem uma pergunta útil por vez, ritmo calmo, distinção entre relato e comprovante e nenhuma invenção de preço por item.

Exemplo: você informa total de R$50, bolacha, iogurte e pão, sem valores individuais. O total é conhecido; os preços individuais ficam **não informados**. Uma nota daquela mesma compra pode completar o registro existente; uma compra futura serve de referência e não comprova os preços daquela compra antiga. O relato original deve ser preservado em anotação.

Essas regras estão nas instruções e no executor atual. Um modelo próprio de compras, itens, fontes e correções estruturadas ainda é uma etapa do plano; não há promessa de aprendizado automático que corrija qualquer compra sem identificar o comprovante correspondente.

## Telegram

O bot já vinculado continua recebendo texto e mensagens de voz. Fotos agora podem ser guardadas como anexos privados da mesma conta; a legenda orienta a leitura. A integração usa a tarefa **Conversa do assistente** para interpretar a foto, sem executar ações vindas da imagem. Para executar, envie o pedido em uma mensagem seguinte. Áudios do Telegram continuam sendo transcritos por Gemini/Vertex configurado.

Envie **/voz** ou **/ligar** ao seu bot para receber um botão que abre a Jornada. A Bot API oficial não fornece chamadas telefônicas diretas para bots; esse botão abre a chamada no site. Não é necessário recriar o bot. O histórico de mensagens do Telegram ainda é separado do gerenciador de conversas do site, mas os registros usam o mesmo workspace.

## Android e instalação

Quando o navegador móvel oferecer instalação, o Assistente mostra **Instalar Jornada Plena**. Também é possível procurar **Instalar aplicativo** ou **Adicionar à tela inicial** no menu do Chrome. Isso cria acesso direto à Jornada.

Há controles de mídia quando o navegador suporta a Media Session API. Instalar o site e ter controles de mídia não garante microfone ativo ao bloquear a tela ou abrir Instagram. Para uma experiência confiável de chamada em segundo plano, o plano inclui um aplicativo Android com serviço de microfone em primeiro plano, notificação e controles do sistema. Não há aplicativo Android nativo nesta entrega.

## Privacidade, banco e diagnóstico

As chaves permanentes são cifradas no servidor. Áudio vai ao provedor escolhido; a Jornada não salva gravação da chamada. Transcrições e resultados das conversas sincronizadas ficam na conta. Fotos ficam no bucket privado `note-attachments` e são acessadas com autorização da conta. Conteúdo completo de uma nota só é consultado quando solicitado.

As migrações `20261003173200_assistant_continuity.sql` e `20261003173935_assistant_attachment_auth.sql` criam conversas, pedidos, transações de conclusão e autorização restrita para anexos do Telegram. `20261003182620_assistant_export.sql` inclui conversas e pedidos próprios em “Baixar todos os meus dados”; excluir a conta também os remove pelo vínculo com a conta. A Edge Function `telegram-photo` valida o segredo do servidor, a vinculação ao usuário e o evento recebido antes de escrever. A demo não recebe chaves nem acesso a esses recursos.

Erros de voz exibem um código e, quando disponível, o status do provedor. O caso **d7070d5e · Gemini 400** indica configuração recusada; não comprova falta de faturamento. Logs correlacionam a referência e registram apenas etapa, status e motivos/campos permitidos. Não registram chave, autorização temporária, transcrição, usuário ou mensagem bruta do provedor.

A migração `20261003185709_jornada_request_limits.sql` mantém limites por conta no banco para IA, início de chamadas, uploads e bytes de mídia servidos pelo site. Cache privado, validação de anexos, limites e preparação do Cloudflare estão documentados em [SEGURANCA_CACHE_CLOUDFLARE.md](./SEGURANCA_CACHE_CLOUDFLARE.md).

## Validação e teste final

- Testes de domínio: confirmação, desfazer, datas, finanças, preservação de notas, histórico, restrições de token e anexos.
- Navegador em desktop e Android simulado: controles, microfone sintético, AudioWorklet, histórico, delegação GPT Live, deduplicação, acessibilidade e recuperação após encerrar a chamada.
- Banco: isolamento entre contas, revisão de salvamento, conclusão atômica, repetição de pedido e exclusão de conversa, em transação com rollback.
- Gates: build, tipos, APIs anônimas bloqueadas, origem autorizada, demo isolada e revisão do índice de publicação.

Esses testes não equivalem a uma chamada real. Na versão publicada, entre no celular, ouça uma resposta, consulte a agenda, crie um compromisso de teste, reagende-o e exclua-o com confirmação. Confira o registro em outro dispositivo. Encerre também uma chamada durante um pedido aceito e retome a conversa para conferir o resultado sem duplicação. Nenhuma chave de produção precisa ser exportada para esses testes.

## Documentação dos fornecedores

- [OpenAI GPT Live](https://developers.openai.com/api/docs/guides/live), [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [delegação](https://developers.openai.com/api/docs/guides/live-delegation).
- [Gemini Live](https://ai.google.dev/api/live), [autorizações temporárias](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens).
- [Telegram Bot API](https://core.telegram.org/bots/api).
- [Android: tipos de serviço em primeiro plano](https://developer.android.com/develop/background-work/services/fgs/service-types).
- [Instalação de PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).
