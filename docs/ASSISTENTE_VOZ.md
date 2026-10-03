# Assistente de voz da Jornada Plena

## Uso

Entre com sua conta, abra **Assistente**, toque em **Conversar ao vivo** e em **Iniciar chamada**. Autorize o microfone no navegador. A conversa usa áudio contínuo: não é necessário enviar cada fala. O assistente pode ser interrompido enquanto responde.

A entrada da chamada fica no topo do Assistente, no cartão **Sua jornada, em uma conversa**. **Prefiro escrever** leva ao campo do chat, preservando a conversa e seus anexos. Falhas no ditado ou na síntese de voz do navegador não bloqueiam a abertura da chamada. Se o navegador não conseguir abrir o diálogo, os mesmos controles aparecem na página; o microfone continua desligado até tocar em **Iniciar chamada**. Um conflito de sincronização permite abrir a tela e ler a orientação, mas impede iniciar uma chamada até resolver o conflito.

Os controles permitem desligar o microfone, silenciar a resposta, interromper a fala e encerrar a chamada. A transcrição acompanha a conversa escrita. Cada chamada dura até 20 minutos; outra chamada pode ser iniciada depois. Fechar a tela, sair da página ou encerrar libera o microfone e interrompe a conexão.

O botão de microfone do chat continua servindo para **ditar uma mensagem** e revisá-la antes de enviar.

## Ações disponíveis

O mesmo executor validado atende ao chat escrito e à voz:

- Consulta agenda, anotações, finanças, hábitos, metas, projetos e estudos.
- Cria, edita e exclui compromissos, anotações, lançamentos financeiros, hábitos, metas, projetos, cursos, matérias, aulas, cadernos, flashcards e áreas.
- Reagenda compromissos, marca tarefas e hábitos como feitos e registra contas pagas ou recebidas.
- Inicia, pausa, retoma e encerra sessões de foco.
- Desfaz a última alteração sem sobrescrever mudanças posteriores nos mesmos itens.

Nomes ambíguos e vínculos inválidos são recusados. Excluir um registro ou substituir todo o conteúdo de uma anotação exige uma segunda confirmação: **“confirmo a exclusão”**, **“confirmo a substituição”** ou o botão **Confirmar**. Um simples “sim” não autoriza a exclusão. A confirmação identifica o registro exato e verifica se ele mudou desde o pedido.

O assistente só anuncia uma alteração como salva após a confirmação da persistência. Se a sincronização falhar, informa que a mudança está no aparelho e orienta verificar os dados antes de repetir. Chamadas de ferramenta repetidas com o mesmo identificador não executam a ação novamente.

Pagamentos bancários, mensagens externas, gerenciamento de contas/permissões e lembretes do sistema operacional não fazem parte deste recurso. Marcar uma conta como paga altera o registro financeiro; não movimenta dinheiro.

## Configuração e privacidade

A chamada usa a **Gemini Live API**. Em **Administração › Inteligência artificial**, a tarefa **Conversa do assistente** precisa estar habilitada com Gemini e uma chave que tenha acesso à Live API e cota disponível. O modelo do chat escrito continua independente: o servidor descobre um modelo compatível com áudio ao vivo. A variável opcional `GEMINI_LIVE_MODEL` fixa um modelo, desde que ele apareça na lista de modelos Live autorizados para a chave.

A rota autenticada `/api/ai/live` mantém a chave permanente no servidor e emite uma autorização temporária limitada ao modelo, às instruções e às ferramentas. O navegador envia áudio diretamente ao Gemini. A Jornada Plena não grava o áudio desta chamada; a transcrição entra no histórico local de conversas existente. O provedor recebe o áudio e os dados necessários para responder. Conteúdo completo de uma nota só é consultado quando solicitado especificamente.

Não há nova migração de banco. As ações reutilizam o workspace, a validação do formato, a revisão de salvamento e a autorização existentes. A demo não recebe credenciais nem acesso ao áudio ao vivo.

## Validação

- Testes de domínio cobrem seleção inequívoca, confirmação, preservação de notas/vínculos, desfazer, consultas, datas, finanças e PCM.
- Testes de navegador em desktop e Android simulado usam um microfone sintético e um servidor Gemini simulado. Exercitam o AudioWorklet real, controles, transcrição, salvamento, duplicação de ferramentas, cancelamento, exclusão por voz/toque, acessibilidade e encerramento durante a permissão.
- Testes de bloqueio incluem a nova rota de autorização da voz. Build e verificação de tipos fazem parte dos gates.

Esses testes não comprovam disponibilidade/cota do Gemini nem uma chamada no aparelho real. A validação final deve usar uma sessão autenticada, ouvir uma resposta, consultar a agenda, criar um compromisso de teste, reagendá-lo e excluí-lo com confirmação. Confirmar a gravação também em outro dispositivo. Não exportar as variáveis secretas de produção para executar essa verificação.

Referências do provedor: [autorizações temporárias](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [WebSocket](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket) e [capacidades de áudio](https://ai.google.dev/gemini-api/docs/live-api/capabilities).
