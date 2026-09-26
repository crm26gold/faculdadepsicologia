# Jornada Plena — primeira entrega após a auditoria

## Escopo implementado

- Nome Jornada Plena no login, navegação, títulos de página e exportações.
- Preservação da chave local antiga e dos identificadores ICS: a alteração de marca não apaga dados nem cria novos IDs para eventos já exportados.
- Cadastro do primeiro horário em uma grade vazia, após cadastrar uma matéria.
- Escolha de matéria, dia, início, término opcional, intervalo semanal, primeira data e local/modalidade.
- Edição com ID estável e pausa por desativação, sem duplicar o horário.
- Validação de término, correspondência entre primeira data e dia da semana, matéria existente e limite de horários.
- Primeira data desconhecida em recorrências maiores que uma semana permanece pendente, sem datas inventadas.
- Formulário preservado quando sua atualização é recusada; mensagens da grade distinguem alteração local de confirmação de salvamento.
- Indicador específico para espaço cloud ainda sem registros; não exibir “Sincronizado” como se houvesse conteúdo previamente gravado.
- Planejador identificado como “Regras” na navegação, preservando sua utilidade sem apresentá-lo como IA generativa.

## Como usar

1. Entre com a conta Google autorizada.
2. Em Matérias, cadastre uma matéria se o espaço ainda estiver vazio.
3. Em Agenda, abra Minha grade e clique em Adicionar horário.
4. Preencha as informações conhecidas. O término e a primeira data podem ficar vazios; leia a observação sobre intervalos maiores que uma semana.
5. Salve e confira o indicador geral antes de sair.
6. Para editar ou pausar, abra novamente o horário dentro de Minha grade.

## Validação e limites

Foram acrescentados testes unitários de criação/edição/limites e testes de navegador para validação de datas, acessibilidade, edição/pausa, cadastro a partir de um espaço vazio e preservação após recarregar.

Os testes de navegador usam ambientes isolados, dados sintéticos e, no cenário de persistência, armazenamento local. Eles não substituem o teste de gravação real pela conta Google na produção. Não houve inserção de grade pessoal, alteração de RLS ou migração de banco nesta entrega.

A ferramenta auxiliar agent-browser não estava instalada nem disponível no cache. A verificação utilizou a suíte Playwright existente, com cenários desktop/mobile e capturas para inspeção visual.

## O que permanece na próxima etapa

- Confirmar primeira gravação cloud e leitura em outro dispositivo, sem sobrescrever possíveis dados locais antigos.
- Recuperação de falhas de rede/conflitos, rascunhos e tentativa de salvamento: ainda não implementadas.
- Foco persistente entre telas, sessões parciais e vínculo com atividade.
- Arquivamento/lixeira e restauração operacional de backup.
- Cadastro da grade real exclusivamente no espaço privado, com confirmação dos dados ausentes.
- Padronização do nome no consentimento OAuth externo, se ainda necessária; não foi alterada nesta entrega.

O mapa de auditoria permanece como fotografia do commit anterior. Este documento registra a evolução; não declara concluído o pacote inteiro “Meu espaço pessoal confiável”.
