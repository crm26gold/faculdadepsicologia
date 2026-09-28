# Tempo e foco / responsividade

## Implementação

- Controle global, disponível em todas as abas; recolhido acompanha a rolagem.
- Cronômetro livre e metas de 10/25/45 minutos (meta não encerra automaticamente).
- Atividade, área da vida e matéria opcional; histórico com duração em horas/minutos/segundos.
- Intervalos de início/pausa persistidos no workspace, não em contadores voláteis.
- Encerrar grava duração parcial e limpa a sessão na mesma atualização; identificadores estáveis evitam duplicação.
- Divisão pela meia-noite local, sem contar intervalos pausados. Segundos fracionários preservados nos dados.
- Cloud utiliza a API autenticada e o CAS de revisão já existente; local utiliza o armazenamento existente; demo não persiste.
- Antes de fechar, aguardar confirmação de salvamento. Sem conexão/salvamento confirmado não há garantia de recuperação de uma alteração recente. Não há execução JavaScript com navegador fechado: os horários persistidos permitem reconstruir a duração ao voltar.
- Tempo registrado não comprova atenção. Relógio/fuso do dispositivo influenciam os horários. Uma sessão esquecida continua até ser encerrada.

## Compatibilidade

Editor generation 4 preserva os novos campos e aceita backups anteriores. Clientes anteriores falham ao carregar generation 4 em vez de remover campos silenciosamente. Recarregar abas antigas antes de editar.

Em 28/09 foi encontrada no banco remoto a proteção fixa em generation 2. Aplicada a migração já versionada `workspace_generation_three`, substituindo-a pela proteção monotônica (aceita evolução e recusa downgrade). Função e trigger habilitado conferidos. Nenhum registro pessoal foi editado para testar.

## Verificação

- Testes unitários: reconstrução após serialização, pausa/continuação, idempotência, segundos parciais, meia-noite e compatibilidade.
- Teste de navegador: fechar página, abrir outra, pausar/recarregar, trocar aba e encerrar.
- Responsividade: todas as abas a 320, 390 e 768 px, além da suíte desktop/mobile existente.
- Validação autenticada em produção depende de sessão do proprietário; não confundir build ou HTTP 200 com confirmação de gravação real.

## Limites e evolução

- Histórico exibe os 20 últimos registros; relatórios agregados avançados não fazem parte desta correção.
- Não permite duas atividades simultâneas; conflito entre dispositivos é recusado pelo CAS, não mesclado automaticamente.
- Sem alarme garantido quando o navegador estiver fechado, sem sincronização offline e sem detecção automática de atenção.
