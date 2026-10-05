# Assistente de voz da Jornada Plena

## Começar uma chamada

Entre com sua conta e abra **Assistente › Conversar ao vivo › Iniciar chamada**. Autorize o microfone. Fale naturalmente; é possível interromper a resposta, desligar o microfone, silenciar a voz e encerrar. Cada chamada dura até 20 minutos. Fechar a chamada ou sair da página libera o microfone. O botão de microfone do chat continua sendo ditado de uma mensagem.

A conversa atual aparece acima do cartão de chamada. Quando já há mensagens, o cartão fica compacto. **Conversas** abre o gerenciador: pesquisar pelo título ou pelas mensagens, renomear, fixar, arquivar, exportar em texto, retomar ou excluir. Excluir uma conversa apaga também o histórico de seus pedidos; os registros criados na agenda, nas notas e nas finanças continuam na Jornada. Confirme a exclusão no diálogo.

Novas conversas são salvas na conta autenticada e têm uma cópia local separada por conta. O histórico antigo, que não identificava a conta, só é recuperado por sua escolha: abra **Conversas**, recupere o histórico deste aparelho e salve cada conversa desejada na conta. Não há importação silenciosa entre contas. Conflitos preservam uma cópia para revisão; exporte antes de recarregar. A pesquisa abrange as conversas carregadas; use o botão para carregar mais quando disponível. Conversas com mais de mil mensagens permanecem neste aparelho e podem ser exportadas antes de começar outra.

## Configurar o provedor de voz

A tarefa **Chamada ao vivo** é independente de **Conversa do assistente**. A primeira cuida da conversa falada com Gemini, OpenAI, ElevenLabs ou xAI/Grok; a segunda interpreta fotos e planeja ações. Trocar a voz não exige trocar o planejador. O proprietário configura as tarefas em **Administração › Inteligência artificial**; cada pessoa pode cadastrar APIs próprias em **Meu espaço › Minhas chaves de IA**.

As chaves pessoais têm prioridade para texto e não atendem outra conta. A voz do proprietário mantém a configuração administrativa; membros usam suas APIs pessoais Gemini, OpenAI ou xAI. Groq oferece texto e transcrição de mensagens de voz, sem transporte contínuo nesta integração. Assinaturas de aplicativos não equivalem a crédito de API.

Em **Conexões e chaves**, a busca e o filtro mostram primeiro as conexões cadastradas. **Remover chave** exige confirmação, mostra tarefas afetadas e pausa as tarefas que dependem diretamente dela; conexões extras têm remoção própria. Depois escolha outra conexão em **Tarefas e modelos**. Seus registros continuam guardados.

Gemini exige declaração de faturamento pago habilitado para processar dados pessoais. O proprietário declara as condições em **Meu espaço › Minhas chaves de IA › Privacidade das conexões e base para membros**; essa declaração não ativa a base compartilhada. Trocar a chave exige nova declaração. Essa condição decorre dos [termos da API Gemini](https://ai.google.dev/gemini-api/terms).

### Gemini

1. Em **Administração › Inteligência artificial › Conexões e chaves**, abra **Google Gemini** e confira a chave principal ligada com acesso à Live API.
2. Em **Tarefas e modelos › Chamada ao vivo**, escolha **Google Gemini** e **Automático · voz disponível**, marque **Ligada** e salve.
3. Clique em **Testar conexão de voz**. O teste prepara a autorização e verifica a configuração sem microfone, fala ou execução de ações. Se falhar, compartilhe a etapa e o código apresentados; não compartilhe chaves.
4. Quando a configuração for aceita, abra uma nova chamada no Assistente para verificar áudio e uma ação real.

O servidor lista os modelos autorizados para a chave, prioriza modelos regulares e evita escolher raciocínio prolongado quando a alternativa regular da mesma versão está disponível. `GEMINI_LIVE_MODEL`, se configurada na Vercel, fixa um modelo autorizado e prevalece sobre a escolha automática.

A autorização temporária permanece limitada ao modelo, às instruções e às ferramentas. O POST REST usa `bidiGenerateContentSetup`, a forma produzida pelo SDK oficial, com `fieldMask` de campos inteiros. Ferramentas sem argumentos omitem `parameters`; todas aguardam o resultado com `behavior: BLOCKING`. A retomada recebe um handle do cliente, sem substituir a configuração fornecida pelo servidor. Essa correção precisa ser validada com a chave real; testes locais não provam que o Gemini a aceitou. O diagnóstico e as evidências estão em [INCIDENTE_GEMINI_LIVE_2026-10-03.md](./INCIDENTE_GEMINI_LIVE_2026-10-03.md).

### OpenAI / GPT Live

1. Na plataforma de API da OpenAI, crie uma chave de um projeto com acesso e cota para **gpt-live-1**. A assinatura do ChatGPT/Codex não inclui automaticamente esse uso de API.
2. Em **Administração › Inteligência artificial › Conexões e chaves › OpenAI**, cole a chave no campo protegido, marque **Ligado** e salve. Não envie a chave no chat.
3. Na tarefa **Chamada ao vivo**, escolha **OpenAI**, modelo **gpt-live-1**, marque **Ligada** e salve.
4. Mantenha **Conversa do assistente** em um provedor já configurado, como Gemini, para planejar as ações e interpretar fotos.
5. Teste no celular. O erro exibido informa uma referência se a preparação da sessão falhar.

A sessão usa WebRTC e delegação ao núcleo da Jornada. O servidor negocia a sessão com a chave permanente; o navegador recebe a resposta de conexão, não a chave. Não há troca automática entre Gemini e OpenAI durante uma chamada. A mudança exige uma nova chamada e o histórico continua na Jornada. O adaptador foi validado com eventos simulados; a qualidade de áudio e a autorização real precisam de um teste com a chave configurada.

### ElevenLabs

O ElevenLabs conduz a conversa por voz: reconhece a fala, responde com o modelo escolhido para o agente e fala em português. As ferramentas da Jornada rodam no navegador, com o mesmo executor do chat. Por isso consultar, organizar, confirmar, cancelar e desfazer seguem as regras desta página. Pedidos de alteração (organizar_jornada) continuam sendo planejados pela tarefa **Conversa do assistente**, que precisa estar funcionando.

1. Em elevenlabs.io › Developers › API Keys, crie uma chave com acesso a Agents (ElevenAgents). Não envie a chave no chat.
2. Em **Administração › Inteligência artificial › Conexões e chaves**, abra **ElevenLabs · voz**, cole a chave no campo protegido, marque **Ligado** e salve.
3. Em **Tarefas e modelos › Chamada ao vivo**, escolha **ElevenLabs · voz** e **Automático · voz disponível** (ou um modelo da lista), marque **Ligada** e salve.
4. Clique em **Testar conexão de voz**. O servidor cria (ou atualiza) na sua conta o agente **Jornada Plena · voz** e as cinco ferramentas, assina uma conversa e a encerra assim que o ElevenLabs a aceita. O teste pode consumir poucos créditos, porque o agente começa a cumprimentar.
5. Abra uma nova chamada no Assistente para verificar áudio e uma ação real.

O agente exige URL assinada: o navegador recebe um endereço de uso único, nunca a chave. A gravação de áudio fica desligada no agente. O servidor só altera o agente quando o código da Jornada muda a configuração (prompt, ferramentas, modelo ou formato de áudio), marcando a versão em uma etiqueta. A voz escolhida no painel do ElevenLabs é preservada nessas atualizações. Para fixar outra voz na criação, defina `ELEVENLABS_VOICE_ID` na Vercel.

Os créditos do plano são consumidos por minuto de conversa e pelo modelo do agente. No plano gratuito, os créditos rendem poucos minutos por mês; confira o consumo no painel do ElevenLabs. Créditos esgotados, chave recusada ou permissão ausente aparecem com uma mensagem própria e um código da chamada. O **Speech Engine** do ElevenLabs não foi usado porque exige um servidor WebSocket próprio sempre ligado, e as funções da Vercel não mantêm esse tipo de conexão.

A integração segue o formato do SDK oficial (`@elevenlabs/elevenlabs-js` e `@elevenlabs/types`). Os corpos enviados foram conferidos contra os esquemas desse SDK, e o fluxo foi testado com respostas simuladas. A chamada real precisa ser validada com a chave configurada.

### xAI / Grok

Cadastre uma chave de API xAI em **Conexões e chaves**, habilite a conexão e selecione **xAI** com **grok-voice-latest** na tarefa **Chamada ao vivo**. O teste administrativo verifica autorização e configuração, sem usar microfone. Depois teste uma chamada no aparelho. O navegador recebe somente uma autorização temporária; as ações usam o mesmo executor e exigem as mesmas confirmações. Modelo, áudio e ferramentas seguem a [documentação de voz xAI](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech).

### Automático: usar a que funcionar

Em **Tarefas e modelos**, cada tarefa tem **Se a conexão falhar › Automático: usar a que funcionar (recomendado)**. Voz começa pela conexão escolhida; texto ordena todas as conexões elegíveis, incluindo a escolhida. O servidor limita cada preparação a oito candidatos, com orçamento por tentativa; o navegador encerra o início da chamada após 60 segundos, inclusive durante trocas de transporte:

- **Chamada ao vivo:** preserva a escolhida e usa ElevenLabs, Gemini, xAI e OpenAI como alternativas. A troca acontece apenas antes de conectar. Uma conversa já iniciada não troca de provedor.
- **Conversa do assistente e Organizar registros, economia primeiro:** Gemini, Groq, Mistral, DeepSeek, xAI e os modelos gratuitos (`:free`) do OpenRouter; OpenAI e Anthropic ficam por último. Cada empresa escolhe o próprio modelo pela lista da chave. Serviços compatíveis e Google Cloud entram apenas como conexão principal. ElevenLabs nunca responde texto.
- **Áudios normais** (mensagens de voz no Telegram e no WhatsApp): a transcrição segue a mesma ordem e aceita Gemini e o Whisper da Groq (`whisper-large-v3-turbo`, com cota gratuita) ou da OpenAI (`gpt-4o-mini-transcribe`). A voz ao vivo continua separada.

No automático, cota esgotada passa para outra empresa, sem insistir em outras chaves da empresa esgotada. Nas outras políticas, cota e faturamento interrompem o pedido. O limite global da Jornada interrompe todas as opções e informa quando tentar novamente. APIs pessoais usam limites próprios por conta; APIs do proprietário ou da base também consomem o orçamento global. Os dados podem chegar às empresas elegíveis da rota: pause as conexões que não devem ser usadas.

### Reservas e modelos atualizados

**Conexões e chaves** permite cadastrar, pausar, substituir, verificar e remover reservas da mesma empresa. Elas compartilham o projeto/endereço da conexão principal. A chave principal vem primeiro, seguida das duas primeiras reservas ligadas por prioridade. Cota, faturamento ou configuração inválida interrompem o pedido; falhas de rede ou acesso podem tentar uma reserva. Cada tentativa respeita o controle de uso.

**Atualizar modelos** consulta a API da sua conta e atualiza o cache de escolha de modelos de texto. As preferências automáticas priorizam famílias e versões estáveis; não comparam preços em tempo real. Um teste usa a configuração salva, e não alterações ainda em edição.

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
