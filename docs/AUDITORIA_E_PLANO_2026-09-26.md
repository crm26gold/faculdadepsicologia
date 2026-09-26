# Jornada Plena — auditoria e mapa de execução

Data: 26/09/2026. Retrato técnico do commit `2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce`.

Nome oficial definido pelo usuário: **Jornada Plena**. A escolha do nome está concluída; não é uma pendência do projeto.

Este é o documento consolidado da auditoria e do plano de ação nesta data. Reúne o estado verificado, as lacunas, a arquitetura proposta e o escopo de evolução por fases. Não substitui as especificações detalhadas de cada tela, campo, regra e integração, que serão elaboradas conforme a execução, nem afirma que todos os recursos planejados já existem.

Documento de diagnóstico e planejamento. Não representa funcionalidades entregues nem autorização automática para executar todas as etapas. Nesta auditoria não foram alterados código da aplicação, dados, autenticação, variáveis de ambiente ou deploys. Este relatório é a única entrega documental nova.

## 1. Veredito executivo

**Existe um aplicativo acadêmico real, publicado, com autenticação restrita, banco provisionado e testes. Ainda não existe a plataforma completa de gestão da vida nem uma IA generativa integrada.**

O trabalho já realizado não deve ser descartado. A diferença entre a visão e a experiência atual decorre principalmente de fluxos incompletos, persistência ainda sem comprovação de uso real nesta auditoria e funcionalidades planejadas que aparecem como possibilidades, não como integrações operacionais.

As conclusões mais importantes:

1. GitHub, Vercel e Supabase correspondem ao mesmo projeto inspecionado. Não foi encontrado vínculo com outro projeto nos arquivos/configurações examinados. Isso não é uma auditoria de todas as contas, instalações antigas ou de todo o computador.
2. O código local, a branch `main` remota e o deploy de produção identificado correspondem ao mesmo commit.
3. A identidade Google da conta Master está vinculada à lista de acesso do banco. Isso não significa que exista um painel administrativo multiusuário.
4. O Supabase está ativo, com duas migrações aplicadas e proteção por usuário. Entretanto, a contagem exata de `personal_workspaces` retornou **zero registros**. Não há evidência de workspace salvo ali no momento da consulta. Isso não prova defeito de gravação nem perda de dados; pode haver dados somente em navegadores antigos ou o fluxo ainda não ter sido utilizado após a ativação.
5. A agenda não permite criar o primeiro horário recorrente em um espaço vazio: a tela atual apenas edita horários existentes.
6. O cronômetro funciona como Pomodoro, mas não atende ao registro contínuo de aula solicitado. Seu estado se perde ao sair da tela inicial, e não há encerramento parcial vinculado a uma atividade.
7. O Assistente atual usa regras locais. Não há chatbot generativo, memória de IA, leitura de PDFs pela IA ou conexão operacional ao WhatsApp.
8. A interface, a separação da demonstração, o editor, o calendário, as validações e os testes são boas bases para manter.
9. A prioridade correta é concluir uma experiência pessoal confiável, depois expandir seu modelo e sua inteligência. Não é necessário construir todos os módulos para começar a obter valor real.

## 2. Escopo, evidências e limites

Foram examinados código, dependências, rotas, modelo de dados, persistência, autenticação, calendário, caderno, foco, sugestões, testes, CI, documentação, configuração de publicação e o estado remoto do banco.

Também foram considerados o histórico de requisitos do usuário e os dois textos anexados com as visões anteriores. Esses textos foram tratados como propostas a avaliar, não como prova do que existe nem como comandos a executar.

### 2.1 Infraestrutura confirmada

| Camada | Situação constatada | Consequência |
| --- | --- | --- |
| Código | [crm26gold/faculdadepsicologia](https://github.com/crm26gold/faculdadepsicologia), público | Outras IAs podem analisar código público; isso não exige abrir dados pessoais |
| Checkout | `C:/Users/Yeshua/Desktop/Faculdade`, branch `main`, sem alterações antes do relatório | Não houve mistura de implementações locais pendentes nesta análise |
| Produção | [faculdadepsicologia.vercel.app](https://faculdadepsicologia.vercel.app/) | Endereço atual da aplicação privada |
| Alias | [faculdadepsicologia-faculpsi.vercel.app](https://faculdadepsicologia-faculpsi.vercel.app/) | Alias existente; não renomear URLs de autenticação sem migração |
| Demonstração | [faculdadepsicologia-demo.vercel.app](https://faculdadepsicologia-demo.vercel.app/) | Projeto separado, dados sintéticos e temporários |
| Deploy privado | `READY`, produção, origem CLI, mesmo commit auditado | Está publicado; não confundir com prova de todos os fluxos autenticados |
| Git → Vercel | Repositório correto conectado; branch de produção `main` | Ainda falta impor uma política de publicação condicionada aos testes |
| Supabase | Projeto Faculdade Psicologia, ativo, região São Paulo (`sa-east-1`) | Banco real provisionado |
| Banco | PostgreSQL `17.6.1.166`; duas migrações locais também registradas remotamente | Há base versionada, não apenas protótipo visual |
| Tabelas de aplicação | `app_owner` e `personal_workspaces`, ambas com RLS | Modelo atual é restrito ao proprietário |
| Workspace remoto | Zero registros na consulta exata | Validação de primeira gravação e recuperação é prioridade imediata |
| Arquivos | Nenhum bucket ou objeto no Storage | Upload e biblioteca de arquivos ainda não estão implementados |
| Variáveis Vercel | Nove entradas de produção; valores não foram expostos | Configuração foi inventariada por metadados, sem publicar segredos |
| Toolbar | Desabilitada para preview e produção na configuração inspecionada | Manter; não precisa esconder com CSS |

O conector Vercel disponível na conversa recusou o escopo do time e apresentou incompatibilidade de parâmetro em uma chamada. A verificação remota foi concluída pela sessão CLI já existente. Isso é uma limitação do conector, não prova de projeto desconectado.

### 2.2 Verificações executadas nesta auditoria

| Verificação | Resultado | O que não comprova |
| --- | --- | --- |
| Testes unitários | 40/40 aprovados | Não substituem uso real da conta Google |
| Testes de bloqueio/configuração | 13/13 aprovados | Não executam consentimento Google real |
| Testes de navegador | 16/16 aprovados | Cenários locais isolados, não escrita na conta de produção |
| TypeScript | Aprovado | Não garante correção funcional completa |
| Build Next.js | Aprovado | Não garante persistência remota |
| Scanner de publicação | 60 arquivos rastreados, sem alertas | Não é varredura integral do histórico Git ou do computador |
| Auditoria npm | Zero vulnerabilidades conhecidas reportadas naquele momento | Não significa ausência de toda vulnerabilidade |
| CI remoto | [Execução aprovada](https://github.com/crm26gold/faculdadepsicologia/actions/runs/36210441907) | O workflow não faz validação autenticada remota nem publica o app |
| HTTP produção | Página 200; `/api/workspace` sem login retorna 401 | Não testou a sessão privada do usuário |
| HTTP demonstração | Página 200; `/api/workspace` retorna 404 | A demonstração não oferece acesso à API pessoal |
| Supabase | Migrações, políticas, privilégios, funções e contagens lidos | Nenhum registro de teste foi criado nesta auditoria |
| Logs Vercel | Nenhum erro retornado no recorte consultado de 24h | Ausência de resultado não garante ausência de problemas |
| Capturas desktop/mobile | Calendário e dashboard inspecionados | Não equivale a teste manual em todos os dispositivos |

Os testes foram executados com Node 24, compatível com o projeto. O Node padrão do terminal era 20; foi usado o runtime correto apenas no processo de teste. Restrições de rede/subprocessos do ambiente exigiram repetir alguns diagnósticos com permissão adequada; não eram falhas da aplicação.

O runtime de inspeção do navegador integrado não inicializou. Por isso, não se declara teste manual autenticado na produção. A verificação visual utilizou as capturas produzidas pelos testes Playwright locais.

### 2.3 O que continua sem confirmação

- Login Google completo, salvamento real e leitura em um segundo dispositivo nesta versão publicada.
- Existência de dados pessoais em navegadores antigos; não foram lidos nem descartados.
- Restauração operacional de backup remoto e de arquivos.
- Configuração administrativa completa de provedores Auth, inscrições e recuperação no Supabase.
- Valores atuais das variáveis secretas; foram preservados.
- Proteção de todas as contas externas, MFA dos provedores e inventário integral de tokens antigos.
- Desempenho com anos de notas e documentos, carga simultânea e Safari real.
- Conformidade jurídica integral, certificação de acessibilidade ou pentest independente.

## 3. AS_IS — o que o sistema realmente tem

### 3.1 Tecnologia

| Elemento | Implementação atual | Decisão |
| --- | --- | --- |
| Aplicação | Next.js 16.3.6, React 19.3.0, TypeScript | Manter e atualizar de forma controlada |
| Execução | Node 24, Vercel | Manter; alinhar terminal e CI |
| Banco e identidade | Supabase/PostgreSQL, Supabase Auth/SSR | Manter |
| Editor | TipTap 3.31.3 | Evoluir, sem substituir por editor caseiro |
| Validação | Zod, limites de tamanho, validação de referências | Manter e aproximar das restrições do banco |
| Interface | Componentes próprios, Lucide, DM Sans, paleta verde/creme | Preservar identidade e melhorar ergonomia |
| Qualidade | Testes Node, Playwright, axe, GitHub Actions | Manter e ampliar cobertura dos fluxos reais |
| IA | Sugestões determinísticas em código | Preservar como automação simples; não apresentar como LLM |
| Persistência | JSON completo por proprietário, revisão otimista | Manter no curto prazo; migrar gradualmente para registros por entidade |

Não há justificativa encontrada para trocar de framework, criar microserviços, implantar banco de grafos ou adicionar vários fornecedores de IA imediatamente.

### 3.2 Inventário funcional

| Capacidade | Estado atual | Lacuna principal |
| --- | --- | --- |
| Login pessoal | Fluxo Google, sessão no servidor e verificação do proprietário | Revalidar ponta a ponta e documentar recuperação |
| Master | Identidade permitida no banco | Não existe administração de outros usuários |
| Meu Dia | Próximas tarefas, prioridades simples, calendário resumido e foco | Personalização ainda limitada ao contexto acadêmico |
| Matérias | Cadastro e edição, professor, semestre e cor | Cursos/instituições separados e arquivamento ausentes |
| Tarefas | Criar, editar, concluir, data, duração, tipo e matéria | Sem projetos, prioridade explícita, recorrência ou tarefa sem data |
| Agenda | Mês/semana, detalhes, teclado, filtros, tarefas e aulas recorrentes | Falta criar a primeira aula, exceções e integração externa |
| Grade | Edição de horários existentes e ativação/desativação | Espaço vazio não tem caminho completo de cadastro |
| Caderno | Notas formatadas, vínculo com matéria, edição e pesquisa | Sem anexos, versões, colaboração ou diário com isolamento próprio |
| Busca | Pesquisa global básica de matérias, tarefas e conteúdo de notas; Ctrl+K | Sem arquivos, busca remota escalável ou filtros por novos domínios |
| Pomodoro | Iniciar, pausar e reiniciar; durações predefinidas | Não persiste sessão em andamento; sem encerramento parcial/contexto |
| Histórico de foco | Data e minutos das sessões concluídas | Não identifica matéria, tarefa, pausas ou tempo parcial |
| Assistente | Regras sugerem preparação/revisão; usuário aceita a tarefa | Não é IA generativa; não lê arquivos nem conversa |
| Integrações | Exportação de calendário ICS funciona | Cards Google/Drive/Microsoft/IA são informativos |
| Backup pelo usuário | Exportação/importação JSON com confirmação | Importação substitui o workspace; não faz mesclagem |
| Salvamento | Modo local, cloud ou demo, com indicação de estado | Recuperação após erro/conflito é limitada |
| Arquivamento/lixeira | Não implementados como ciclo completo de entidades | Necessários antes de exclusão e automação amplas |
| Mobile | Layout responsivo e testes de ausência de overflow | Muito deslocamento vertical e textos secundários pequenos |
| Vida integral | Não implementada | Finanças, saúde, projetos, sonhos, contatos etc. são roadmap |
| WhatsApp | Não implementado | Depende de identidade vinculada, API de ações e canal operacional |
| SaaS/cobrança | Não implementados | Não são requisito para o uso individual atual |

### 3.3 Modelo atual e seus limites

`personal_workspaces.data` guarda, em um documento JSON, `subjects`, `tasks`, `notes`, `sessions`, `classes` e um período letivo global. As entidades dentro desse documento têm identificadores e referências validadas na aplicação; não são tabelas independentes no banco.

Há controle de revisão para evitar sobrescrita silenciosa. É uma boa proteção inicial, mas a unidade de conflito continua sendo o espaço inteiro: editar duas notas diferentes em dispositivos diferentes pode competir pela mesma revisão.

Limites atuais do esquema incluem 100 matérias, 2.000 tarefas, 300 notas, 5.000 sessões e 300 horários, além de limite global próximo de 2 MB. São limites defensivos de um MVP; não constituem dimensionamento adequado para quatro anos de uso com documentos.

O semestre atual é global; a tarefa exige data e possui tipos acadêmicos. Isso precisa evoluir para múltiplos cursos e compromissos pessoais, sem transformar cada domínio em um tipo solto de JSON.

## 4. O que está bom e deve ser mantido

1. **Interface acolhedora e coerente.** Melhorar densidade, legibilidade e rapidez sem abandonar tudo o que já foi aprovado.
2. **Produção privada e demonstração separadas.** A demo serve para avaliações de outras IAs; dados pessoais não precisam ser publicados.
3. **Autenticação delegada ao Google/Supabase.** Manter validação no servidor, em vez de voltar à senha fictícia mencionada anteriormente.
4. **Verificação de proprietário por identidade interna e identidade Google verificada.** Não conceder poder administrativo com um campo enviado pelo navegador.
5. **RLS e autorização dentro da operação de gravação.** A proteção não depende apenas de esconder botões.
6. **Migrações versionadas e controle otimista de concorrência.** Evoluir esses mecanismos, não removê-los para facilitar alterações.
7. **Tratamento de origem, limite de requisição e respostas privadas sem cache.** São boas bases para as próximas APIs.
8. **Editor TipTap, navegação de calendário por teclado e diálogos nativos.** Acrescentar capacidades sem regressão de acessibilidade.
9. **Regras locais úteis.** Revisão de aula e preparação de prova não precisam consumir IA toda vez.
10. **Exportação JSON, exportação ICS e validação de importação.** Preservar a portabilidade e compatibilidade de arquivos antigos.
11. **Testes e scanner de publicação.** Expandir a cobertura; não trocar evidência por uma lista de recursos prometidos.
12. **Código publicável sem dados pessoais.** Manter exemplos sintéticos e exclusões de anexos/segredos.

## 5. GAPS e TECH_DEBT — problemas em ordem de atenção

P0 aqui significa bloqueador de confiança ou verificação urgente, não necessariamente vulnerabilidade crítica confirmada. P1 é correção funcional próxima; P2 é evolução estrutural/operacional; P3 é expansão posterior.

### A01 — P0: comprovar persistência real antes de confiar a vida ao sistema

- Evidência: zero registros em `personal_workspaces`, embora exista estrutura remota e conta permitida.
- Impacto: não se pode dizer que notas e agenda já estejam guardadas na nuvem apenas porque a aplicação abre ou exibe “Sincronizado”.
- Ação: teste autorizado de login → criar item neutro → confirmar gravação → fechar/reabrir → segundo dispositivo → editar → exportar/recuperar.
- Critério: mesmos IDs e conteúdo recuperados, revisão avançando e erros mostrados honestamente. Distinguir espaço vazio carregado de alteração efetivamente salva.
- Cuidado: primeiro identificar/exportar possíveis dados locais; nunca substituí-los automaticamente por um workspace vazio.

### A02 — P0: backup e recuperação precisam de prova, não de suposição

- Existe exportação manual; o estado do backup operacional remoto não foi comprovado.
- Definir periodicidade, retenção, local seguro e responsável; testar restauração em ambiente separado.
- Banco e futuros objetos de Storage precisam de estratégias próprias. Backup do banco não deve ser confundido com cópia dos arquivos. Conferir os recursos do plano contratado na [documentação Supabase](https://supabase.com/docs/guides/platform/backups).
- Definir objetivos de perda máxima tolerável de dados e tempo de recuperação. Não contratar serviço pago sem decisão explícita.

### A03 — P1: agenda sem cadastro inicial completo

- Fonte: `src/components/academic-calendar.tsx`, `ScheduleSettings`, aproximadamente linhas 72–100.
- A tela percorre horários existentes, mas não fornece criação do primeiro horário.
- Criar fluxo para matéria, dia, início, término opcional, local/modalidade, recorrência, data de referência e período letivo.
- Não inventar hora de término ou data inicial da aula a cada três semanas. Dados não informados devem ficar pendentes de confirmação.
- O texto fixo “Transcrita da foto enviada” é inadequado para um espaço vazio ou dados sintéticos; deve depender da origem real do cadastro.

### A04 — P1: foco não acompanha o uso real solicitado

- Fontes: `src/components/focus-timer.tsx` e montagem em `src/components/workspace-app.tsx:152`.
- O estado reside no componente da tela Meu Dia; mudar de seção desmonta esse estado.
- Somente a conclusão integral registra minutos. Não existe vínculo com aula/matéria/tarefa nem encerramento parcial.
- Construir sessão persistente com iniciar, pausar, retomar e encerrar; registrar intervalos e atividade.
- Tempo de cronômetro é tempo registrado, não prova objetiva de concentração. Relatórios devem usar linguagem honesta.

### A05 — P1: salvamento falha de forma pouco recuperável

- Fonte: `src/components/use-workspace.ts`, carga e gravação, aproximadamente linhas 24–99.
- Após erro, a edição é bloqueada; não há fluxo completo de tentar novamente ou resolver conflito. Alterações não confirmadas ficam em memória.
- O workspace inteiro é serializado a cada alteração, com fila em memória; falta reduzir gravações sucessivas e recuperar trabalho após interrupção.
- Formulários fecham antes da confirmação remota. Não devem transmitir “concluído” quando só houve alteração otimista local.
- Implementar estados claros: editando, pendente, enviando, salvo, offline, conflito e falha. Separar erro temporário de sessão expirada e de revisão conflitante.
- Projetar rascunho/outbox recuperável com privacidade explícita; não espalhar dados sensíveis em armazenamento local sem opção e limpeza adequadas.

### A06 — P1: falta ciclo de arquivamento e desfazer

- Cadastro/edição/conclusão existem; não há ciclo completo de arquivar, restaurar e excluir entidades relacionadas.
- Adotar arquivamento reversível, prévia do impacto e lixeira. Matéria com notas/tarefas não pode ser removida com perda implícita de conteúdo.
- Importação JSON hoje substitui o conjunto: acrescentar prévia, backup anterior e opção futura de mesclagem por identificador.

### A07 — P2: JSON único limita crescimento, colaboração e privacidade granular

- Fontes: `src/lib/workspace.ts` e migração `20260924205403_personal_workspace.sql`.
- Edição de uma nota regrava todas as coleções; consultas, compartilhamento e autorização por item tornam-se difíceis.
- Migrar incrementalmente para entidades tipadas. Não há necessidade de remover o JSON antes de a alternativa estar validada.
- A própria documentação PostgreSQL explica que JSON e relações podem coexistir e que atualizações de documentos grandes continuam bloqueando a linha inteira. [Referência](https://www.postgresql.org/docs/current/datatype-json.html#JSON-DOC-DESIGN).

### A08 — P2: validações e limites precisam ser coerentes entre camadas

- A aplicação valida referências e conteúdo com Zod; a função SQL valida principalmente estrutura geral, versão e tamanho.
- Uma chamada direta autorizada à RPC pode não receber as mesmas validações profundas da API. Isso é risco de integridade para o próprio workspace, não evidência de acesso anônimo a terceiros.
- A importação mede comprimento de string; HTTP/SQL aplicam limites de bytes e representação diferentes. Testar caracteres acentuados, emojis e bordas de tamanho.
- Levar invariantes essenciais ao banco, usar tipos consistentes e contratos versionados de entrada/saída.

### A09 — P1/P2: documentação e comunicação do produto estão atrasadas

- README, guias de publicação e registro histórico ainda contêm pendências que já mudaram, como vínculo inicial do proprietário.
- O produto publicado ainda usa Faculdade Psi, mas o nome oficial já escolhido é Jornada Plena. Padronizar os textos visíveis e a apresentação no OAuth com esse nome, sem renomear infraestrutura às cegas nem reabrir a escolha da marca.
- O selo “IA” pode superestimar o Assistente atual, embora o texto interno explique que ele usa regras. Identificar claramente automação por regras, IA disponível e integração planejada.
- Atualizar documentação de estado atual preservando registros históricos datados. Não editar o passado como se todos os testes tivessem ocorrido agora.

### A10 — P2: governança de publicação incompleta

- `main` não estava protegida na consulta. CI existe e passou; o deploy atual veio da CLI.
- Implantar revisão/checks obrigatórios compatíveis com o plano, política de branches e publicação do commit aprovado.
- Configurar ambiente de teste privado isolado; as entradas de ambiente listadas estavam direcionadas somente à produção.
- O projeto Vercel aparece sem preset no nível do painel, mas o deploy usa Next.js via configuração. Alinhar por clareza; não tratar isso como falha do deploy atual.

### A11 — P2: observabilidade e desempenho sem linha de base

- Não há comprovação de monitoramento de erros e métricas de uso integrado à aplicação apenas pela existência de IDs na Vercel.
- Funções em `iad1` e banco em `sa-east-1`: medir latência antes de decidir região. Não declarar lentidão sem medição.
- Revisar chamadas repetidas de validação de sessão após estabelecer métricas.
- Registrar falhas, tempo de salvamento, conflitos e indisponibilidade com IDs técnicos e redação de conteúdo pessoal.

### A12 — P1/P2: manutenção de segurança com escopo correto

- Não foi demonstrado acesso anônimo ao workspace. Os testes e políticas fornecem evidências positivas, não uma garantia de invulnerabilidade.
- O advisor Supabase apontou proteção contra senhas vazadas desativada. Como o app pretende usar Google, primeiro confirmar os provedores realmente ativos; a rota de senha da aplicação já retorna 410. Não inventar que há senha em uso.
- O Supabase anunciou atualização de segurança de PostgreSQL em 25/09, enquanto o projeto reporta 17.6.1.166. Conferir upgrade suportado, compatibilidade e backup antes de agendar manutenção. Não executar atualização durante a auditoria nem afirmar exploração das falhas. [Changelog oficial](https://supabase.com/changelog).
- CSP não foi observada nas respostas inspecionadas; há HSTS e bloqueio de frames. Planejar CSP compatível com Next.js, inicialmente monitorada, e limites de uso nas APIs conforme exposição.
- Recuperação de conta, revogação de sessões e reautenticação para ações de alto impacto devem anteceder dependência em documentos muito sensíveis e acesso por novos canais.

### A13 — P2: função remota antiga não é um provisionador ativo

- `provision-faculdade-owner` ainda aparece como função ativa na infraestrutura, mas seu código atual apenas retorna HTTP 410, sem credenciais ou lógica para criar administrador.
- Não há base para descrevê-la como backdoor. Registrar seu estado; removê-la só se desnecessária e sem consumidores, ou manter resposta de aposentadoria de forma versionada.

### A14 — P1/P2: ergonomia e acessibilidade evolutivas

- Manter a aparência atual. Encurtar o caminho até a próxima ação, dar prioridade ao dia selecionado no celular e revisar textos muito pequenos.
- Não depender de grandes blocos motivacionais para chegar à tarefa importante. Permitir reduzir enfeites e ocultar módulos não usados.
- A suíte automatizada cobre regras de acessibilidade, não certifica WCAG 2.2 AA. Complementar com teclado, leitor de tela, zoom, foco, mensagens de erro e autenticação acessível.
- Não adiar rótulos, contraste e navegação por teclado até existirem clientes pagantes: fazem parte da experiência pessoal atual.

### A15 — P2: navegação e organização do código

- As seções são controladas por estado da interface, sem URLs próprias por nota/projeto/entidade.
- Criar endereços estáveis e comportamento coerente de voltar/avançar antes de lembretes e WhatsApp precisarem apontar para itens.
- Extrair gradualmente responsabilidades do componente principal para módulos de domínio, formulários e serviços testáveis. Não reescrever o layout por causa disso.

## 6. O que tirar — somente quando necessário

| Item | Decisão | Proteção contra perda/regressão |
| --- | --- | --- |
| Texto de grade transcrita sem origem real | Corrigir/condicionar | Preservar dados; mudar apenas afirmação incorreta |
| Rótulos que fazem integração planejada parecer ativa | Corrigir | Informar exatamente o que funciona |
| Exemplo acadêmico no espaço pessoal | Não inserir automaticamente | Exemplos ficam na demo; grade real é privada |
| Fluxo de senha fictícia | Manter aposentado | Não reutilizar senha compartilhada em conversa |
| JSON monolítico como banco definitivo | Substituir gradualmente | Compatibilidade, cópia, comparação e reversão antes da retirada |
| Função remota aposentada | Limpeza opcional | Confirmar ausência de uso; 410 atual é aceitável |
| Nome antigo em textos visíveis | Padronizar como Jornada Plena, nome já definido | Não apagar chaves locais, IDs ou URLs sem migração |
| CSS/imports/arquivos supostamente inúteis | Remover só após comprovar desuso | Testes e inspeção; nenhuma limpeza destrutiva genérica |

Não tirar: testes, RLS, confirmação de ações sensíveis, validações, backup, separação da demo, editor atual ou exportação. Também não remover outros projetos ou integrações da conta global sob o pretexto de limpar este repositório.

## 7. Avaliação crítica das propostas de ChatGPT e Claude

### O que faz sentido

- Conectar áreas da vida, em vez de construir abas que não conversam.
- Acrescentar Projeto entre objetivo e tarefas; incluir Inbox, hábitos, revisões e captura de baixa fricção.
- Preparar arquitetura evolutiva sem construir toda a visão de uma vez.
- Manter a stack e preservar funcionalidades aprovadas.
- Separar dados estruturados, documentos, conversas e memória inferida da IA.
- Fazer cálculos financeiros em código determinístico e usar IA para interpretação.
- Deixar compartilhamento amplo e cobrança para depois da validação pessoal.

### O que precisa ser corrigido

1. **“Tudo como entidade genérica + JSON” não é a única arquitetura boa.** Datas, dinheiro, recorrência, autoria e permissões precisam de contratos fortes. Uma camada genérica de relações pode complementar tabelas específicas, não substituir todas as regras.
2. **“Sem grafo desde o primeiro dia será preciso reescrever tudo” é exagerado.** É possível evoluir com migrações, IDs estáveis e separação de domínio. As relações devem ser previstas; um motor universal não precisa ser construído antes da primeira melhoria útil.
3. **“Permissão da IA é só uma regra no prompt” está tecnicamente errado.** A autorização deve ser validada pelo servidor em cada ferramenta. O modelo não escolhe a identidade nem recebe poder irrestrito de banco. A orientação OWASP recomenda controles fora do modelo, mínimo privilégio e aprovação de ações relevantes. [Fonte](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/).
4. **“Segurança, auditoria e acessibilidade só quando houver pagantes” é amplo demais.** Controles básicos, recuperação, logs mínimos de ações e UX acessível importam agora. Programa formal de conformidade e administração empresarial podem ser graduais.
5. **“Adiar tudo isso não custa nada” não é correto.** Acrescentar isolamento depois de misturar informações sensíveis custa caro. É preciso desenhar fronteiras antes de guardar esses dados, sem montar toda a burocracia de uma empresa grande.
6. **“Uma IA por matéria evolui automaticamente” exige precisão.** Inicialmente significa contexto, fontes, preferências e ferramentas separados, não treinar um modelo próprio a cada disciplina ou absorver permanentemente todo conteúdo.
7. **Ter várias IAs ajudando acelera trabalho, mas não elimina integração e validação.** Revisões paralelas são úteis; alterações conflitantes, migrações concorrentes e publicação sem testes continuam sendo riscos.
8. **Não precisamos esperar Finanças, Saúde e todos os módulos para entregar IA útil.** Uma assistente acadêmica limitada, com fontes e custo controlado, pode entrar assim que o núcleo e suas permissões estiverem confiáveis.

Síntese: preparar contratos e fronteiras para crescer; entregar experiências completas em fatias pequenas. Nem superarquitetura universal, nem atalhos de segurança baseados em confiança no modelo.

## 8. TARGET_ARCHITECTURE — arquitetura proposta

### 8.1 Estrutura geral

Manter um **monólito modular**: uma aplicação organizada por domínios, no mesmo projeto, com serviços de autorização e operações reutilizados pela interface, pela IA e pelos futuros canais.

| Camada | Responsabilidade |
| --- | --- |
| Experiência | Meu Dia, Estudos, Agenda, Caderno, Projetos e módulos opcionais |
| Aplicação | Casos de uso tipados: criar tarefa, registrar sessão, consultar compromissos |
| Autorização | Identidade, espaço, recursos, escopo da integração e confirmação necessária |
| Domínio | Regras de tarefas, calendários, cursos, finanças e demais áreas |
| Dados | PostgreSQL relacional, JSON para metadados apropriados, Storage privado |
| Inteligência | Recuperação de contexto permitido, respostas com fontes e propostas de ações |
| Operação | Jobs duráveis, eventos, notificações, auditoria, métricas, backups |
| Canais | Web primeiro; WhatsApp, voz e outros depois, sem duplicar o domínio |

Uma ação importante passa por: identidade verificada → permissão → validação → eventual confirmação → execução transacional → registro do resultado. Interface e IA usam o mesmo caminho.

### 8.2 DOMAIN_MAP — entidades e relações

| Núcleo | Entidades/relacionamentos propostos | Quando construir |
| --- | --- | --- |
| Identidade | Usuário interno → espaço pessoal; futuramente memberships e permissões | Base agora; membros só antes de compartilhar |
| Educação | Curso → períodos → matérias → horários/avaliações/materiais | Primeira migração funcional |
| Organização | Inbox → tarefa, nota, evento ou projeto, preservando origem | Próximo núcleo |
| Execução | Objetivo/meta → projeto → tarefa → bloco de agenda → sessão de foco | Incremental, começando por projetos e tarefas |
| Conhecimento | Nota/documento → fonte, versão, tags e links autorizados | Caderno e biblioteca |
| Temporal | Evento, recorrência, exceção, timezone, lembrete | Agenda evoluída |
| Histórico | Autor, criação, atualização, arquivo, ações e versões relevantes | Desde a evolução do núcleo |
| Vida prática | Conta/transação, contato, bem, hábito, registro de saúde | Uma fatia por vez, com contratos específicos |
| Inteligência | Conversa, geração, fontes, proposta de ação, confirmação e memória | Quando a IA entrar |
| Integração | Conta conectada, escopos, cursor de sincronização, execução e falha | Primeiro conector real |

Relações obrigatórias devem usar chaves estrangeiras e regras claras. Relações flexíveis, como “esta nota explica esta meta”, podem usar ligações explícitas entre recursos registrados. Os dois extremos da relação devem pertencer a espaços autorizados; UUID sozinho não concede acesso.

JSON continua útil para preferências, conteúdo estruturado do editor e metadados versionados. Não será depósito sem contrato para dinheiro, permissões ou toda a vida do usuário.

Não criar dezenas de tabelas vazias. Cada migração entra junto com um fluxo útil, seus testes e plano de reversão.

### 8.3 Privacidade e Master

- Hoje: somente a conta Master autorizada utiliza a aplicação privada.
- Futuro: separar administração do produto de autorização para ler conteúdo pessoal. Não criar acesso secreto a diários de colegas.
- Espaço compartilhado de uma disciplina não equivale ao espaço pessoal inteiro.
- Acesso a Saúde, Diário ou Finanças pela IA deve ser opt-in e limitado ao necessário para a tarefa.
- Autoridade do proprietário sobre o serviço não significa liberdade irrestrita sobre dados e direitos de outras pessoas.
- Não prometer impossibilidade absoluta de acesso por administradores de infraestrutura. Se o requisito for sigilo criptográfico contra o operador, avaliar arquitetura própria e os impactos na IA; RLS, sozinha, não entrega essa propriedade.
- Conteúdo enviado por outros usuários não vira automaticamente patrimônio reutilizável ou material de treinamento. Finalidades, permissões, retenção e exclusão precisam estar claras antes da abertura a terceiros.

### 8.4 IA e integrações

- A inteligência roda no servidor e consulta fontes autorizadas. A conta de desenvolvimento e seus plugins não são automaticamente o motor de IA dos usuários do aplicativo.
- Contextos por matéria compartilham infraestrutura, mas não compartilham indiscriminadamente documentos privados.
- Ferramentas específicas substituem SQL arbitrário: por exemplo, `consultar_agenda`, `propor_plano_estudo`, `criar_tarefa_confirmada`.
- Separar sugestão de execução; gravar resultado, permitir desfazer quando possível e limitar custo/volume.
- Login Google não concede automaticamente acesso a Agenda, Drive ou e-mail. Cada integração terá autorização própria, estado de sincronização e revogação.
- Jobs importantes não dependem de uma aba aberta. Notificações, importação e processamento de arquivos terão fila, tentativas e prevenção de duplicidade conforme forem implementados.

## 9. DATA_MIGRATION_RISKS — como evoluir sem perder dados

1. Inventariar dados locais, exports e dados remotos antes de qualquer mudança de formato. Banco vazio não permite concluir que não existem dados em outro lugar.
2. Manter os leitores do formato `version: 1` e da chave local atual até existir importação testada.
3. Gerar uma cópia recuperável; testar restauração fora de produção.
4. Criar novas tabelas de forma aditiva, com RLS, constraints e IDs estáveis.
5. Converter explicitamente matéria, tarefa, nota, aula e sessão; gerar relatório de contagens, referências e itens não convertidos.
6. Preservar HTML/conteúdo do editor e datas; não converter fuso ou arredondar minutos sem regra documentada.
7. Ensaiar em dados sintéticos, incluindo backup antigo, documento grande, Unicode, referências inválidas e conflito de IDs.
8. Definir uma única fonte de verdade durante a transição. Evitar dois escritores independentes no JSON antigo e nas tabelas novas.
9. Validar login, leitura, escrita, busca, exportação e restauração na estrutura nova antes da troca.
10. Fazer a troca controlada com plano para retornar ao leitor antigo. Preservar a cópia anterior por período definido.
11. Só depois remover código e estruturas antigas que realmente não tenham mais uso.

Não executar a suíte SQL antiga de provisionamento apagando o proprietário para fazê-la passar. Ela possui uma guarda que exige tabela de proprietário vazia; deve ser adaptada ou executada em banco isolado.

## 10. ROADMAP — ordem estratégica e entregas verificáveis

As fases abaixo indicam dependências, não datas prometidas. As frentes de UX, testes e documentação podem andar em paralelo. Migrações e publicação devem ter coordenação única. Esforço e prazo devem ser estimados por entrega depois de detalhar a implementação, não pela quantidade de IAs disponíveis.

### Fase 0 — verdade operacional e proteção do que já existe

**Objetivo:** saber exatamente onde estão os dados e demonstrar um ciclo real de uso privado.

1. **F0.1 — Consolidar estado e identidade.** Usar esta auditoria como fotografia inicial e registrar Jornada Plena como nome oficial já definido; inventariar onde a apresentação ainda usa o nome antigo, preservando URLs e identificadores técnicos. Aceite: inventário de ambientes e pontos de padronização sem ambiguidades; nenhuma nova escolha de nome é necessária.
2. **F0.2 — Identificar dados anteriores.** Verificar com o usuário se há notas locais e obter exportação privada quando necessário. Aceite: origem e cópia segura conhecidas, sem publicar conteúdo.
3. **F0.3 — Validar conta e configuração efetiva.** Confirmar Google, proprietário, modo cloud, origem e encerramento do bootstrap, sem divulgar valores secretos. Aceite: só a identidade autorizada acessa o espaço; visitante e outra conta não acessam.
4. **F0.4 — Testar escrita e recuperação reais.** Criar item neutro autorizado, conferir registro/revisão, reabrir e ler em outro dispositivo. Aceite: prova do ciclo completo, não apenas screenshot do dashboard.
5. **F0.5 — Ensaiar backup/restauração.** Definir política viável para o plano atual e restaurar em ambiente separado. Aceite: contagens e conteúdo de teste preservados; procedimento registrado.
6. **F0.6 — Revisar manutenção da plataforma.** Confirmar provedores de login, exposição, upgrade PostgreSQL suportado e recursos de backup. Aceite: riscos classificados e plano de manutenção aprovado; nenhuma atualização cega.

### Fase 1 — tornar o núcleo atual realmente utilizável

**Depende:** entendimento de F0. Pode iniciar correções isoladas enquanto a validação remota é concluída.

7. **F1.1 — Salvamento resiliente.** Estados corretos, tentar novamente, sessão expirada, conflito, proteção de rascunho e redução de gravações desnecessárias. Aceite: falha de rede simulada não vira sucesso falso nem sobrescreve versão mais nova.
8. **F1.2 — Criar a grade do zero.** Cadastro/edição/arquivo de horários e período letivo. Aceite: usuário com workspace vazio monta uma semana sem editar código ou importar JSON manualmente.
9. **F1.3 — Cadastrar sua grade privada.** Usar a foto como fonte, confirmar abreviações, datas e recorrências; não incluir material pessoal no repositório público. Aceite: dias e inícios conferidos, sem provas ou términos inventados.
10. **F1.4 — Foco persistente.** Timer global, sessões parciais, pausas e associação a atividade. Aceite: mudar de tela, recarregar e retomar não duplica nem perde tempo registrado.
11. **F1.5 — Arquivar, restaurar e desfazer.** Começar por tarefas/notas e estabelecer regra para matérias vinculadas. Aceite: teste de recuperação e prévia de impacto.
12. **F1.6 — Melhorar o uso no celular.** Próxima ação, agenda de hoje, textos legíveis, menos rolagem e feedback de gravação. Aceite: executar cadastro, edição e recuperação de erro com teclado e celular sem passos ocultos.
13. **F1.7 — Atualizar documentação e comunicação.** Estado real, marca definida, versão coerente e indicadores honestos. Aceite: nada planejado é descrito como integração ativa.
14. **F1.8 — Fortalecer publicação.** Checks, política de revisão, preview privado apropriado e rollback do deploy. Aceite: saber qual commit está publicado e como retornar à versão anterior.

**Marco 1:** aplicação pessoal confiável para matérias, agenda, tarefas, notas e foco, utilizada de verdade em mais de um dispositivo.

### Fase 2 — criar o núcleo expansível sem reescrever a aplicação

**Depende:** cópia/restauração testada e fluxos da Fase 1 estabilizados.

15. **F2.1 — Modelar o núcleo tipado.** Espaço, cursos, períodos, matérias, tarefas, eventos, notas e sessões. Aceite: regras, índices, RLS, migração e testes de isolamento definidos junto do primeiro fluxo.
16. **F2.2 — Migrar incrementalmente.** Primeiro uma fatia, validar, depois as demais. Aceite: paridade de dados e funcionalidades, leitor de backup antigo mantido e reversão ensaiada.
17. **F2.3 — Múltiplas formações.** Faculdade, extensão, cursos, treinamento, palestra, mentoria e estudo independente como contextos adequados. Aceite: dois cursos simultâneos não compartilham semestre/grade indevidamente.
18. **F2.4 — Inbox universal.** Captura textual de baixa fricção; classificar depois como tarefa, nota, evento ou ideia, preservando fonte. Aceite: capturar sem escolher curso, matéria ou data obrigatoriamente.
19. **F2.5 — Projetos e metas básicas.** Projeto contém etapas e tarefas; meta acompanha resultado. Aceite: trabalho acadêmico e projeto pessoal usam a mesma base sem ficarem confundidos.
20. **F2.6 — Relações, tags e endereços estáveis.** Relacionar recursos com autorização e abrir item por URL. Aceite: links funcionam após recarregar; usuário sem permissão não obtém conteúdo ou títulos privados.
21. **F2.7 — Evoluir a busca existente.** Consultas por domínio, data e contexto no servidor conforme crescimento. Aceite: encontrar registros dos dois cursos sem carregar toda a história no navegador.

**Marco 2:** núcleo útil para estudar e organizar a vida, com entidades conectadas e estrutura que suporta novos módulos.

### Fase 3 — conhecimento e primeira IA realmente útil

**Depende:** identidade, persistência e autorização confiáveis; não depende de concluir Finanças ou Saúde.

22. **F3.1 — Biblioteca privada e anexos.** Storage privado, tamanho/tipo, links temporários, exclusão e backup de arquivos. Aceite: arquivo não abre sem autorização; anexos não entram no Git.
23. **F3.2 — Caderno evoluído.** Histórico recuperável, organização por contexto, links, anexos e exportação útil. Aceite: atualizar editor não perde formatação/conteúdo antigo.
24. **F3.3 — Processamento de documentos.** PDF/texto primeiro; OCR e transcrição depois, com indicação de origem e erro. Aceite: conteúdo extraído é rastreável ao arquivo e pode ser removido.
25. **F3.4 — IA acadêmica de consulta.** Escolher provedor/modelo para o caso real, configurar credencial no servidor e orçamento. Aceite: responder sobre material permitido, apontar fontes e admitir informação ausente.
26. **F3.5 — Assistentes por matéria.** Contextos separados, plano de estudo e explicações ajustáveis. Aceite: uma matéria não recebe automaticamente documentos privados de outra área.
27. **F3.6 — Propostas de ação.** IA sugere tarefas/blocos, mostra prévia e só executa conforme regra da ferramenta. Aceite: confirmações, idempotência, registro e desfazer testados.
28. **F3.7 — Memória controlável.** Separar fatos, preferências, conversas e inferências; permitir ver, corrigir e esquecer. Aceite: excluir fonte/memória também impede sua recuperação futura pelo mecanismo definido.
29. **F3.8 — Avaliação e custo.** Testes de respostas sem fonte, instrução maliciosa em documento, vazamento, ferramenta indevida e limite de consumo. Aceite: falhas bloqueiam publicação da capacidade afetada.

**Marco 3:** primeira assistente acadêmica conectada, com fontes, limites e utilidade concreta; não apenas um botão com rótulo IA.

### Fase 4 — agenda conectada, avisos e automações

**Depende:** eventos estáveis, identidade e recuperação. Google Agenda pode ser antecipado em relação à Fase 3 se trouxer mais valor imediato; não depende de IA generativa.

30. **F4.1 — Central de integrações real.** Conectar, ver escopos, última sincronização, erro e revogar. Aceite: interface diferencia conexão ativa, expirada e inexistente.
31. **F4.2 — Google Agenda.** Começar com fluxo controlado; definir direção da sincronização, calendário-alvo, conflitos, recorrência e fuso. Aceite: criar/alterar/cancelar não duplica compromissos; desconectar interrompe acesso.
32. **F4.3 — Notificações duráveis.** Preferências, horários silenciosos, adiamento, resumo e registro de entrega. Aceite: lembrete funciona sem a aba aberta; repetição de job não envia aviso duplicado.
33. **F4.4 — Google Drive seletivo.** Seleção explícita de arquivos/pastas e escopos mínimos. Aceite: não varrer todo o Drive por padrão; revogação testada.
34. **F4.5 — E-mail e Microsoft.** Leitura/rascunho antes de envio autônomo; avaliar Graph, Teams e conta institucional. Aceite: compatibilidade e autorização confirmadas por serviço; indisponibilidade institucional aparece claramente.
35. **F4.6 — Regras de automação.** “Quando uma prova for cadastrada, sugerir revisão”, com deduplicação e histórico. Aceite: automação é explicável, pausável e reversível quando possível.

Não prometer integração com UNIP, tráfego/mapas ou sistemas acadêmicos sem verificar API, permissão e condições de uso. Cada integração precisa justificar manutenção e custo.

### Fase 5 — vida organizada, começando pelo que tem uso frequente

36. **F5.1 — Rotina e hábitos.** Frequência, exceções, pausa, histórico e revisão sem punição. Aceite: ausência de registro não gera diagnóstico ou “fracasso”.
37. **F5.2 — Plano de Ação.** Situação atual, desejo, indicador, projeto, próxima ação, obstáculo e revisão por ciclo. Aceite: uma meta real se converte em ações acompanháveis.
38. **F5.3 — Finanças essenciais.** Contas, saldo inicial datado, entradas, saídas, transferências, pagar/receber e categorias. Aceite: saldo calculado por regras testadas; transferências não contam como renda/gasto duplicado.
39. **F5.4 — Finanças evoluídas.** Cartão, parcelas, dívidas, recorrência, orçamento, reservas e projeções com hipóteses explícitas. Aceite: separar realizado de previsto; juros e arredondamento validados por testes, não pelo texto da IA.
40. **F5.5 — Revisões.** Semana/mês/ciclo, concluído, pendências, tempo registrado e ajustes. Aceite: síntese baseada nos registros, sem “nota geral da vida”.

### Fase 6 — demais dimensões pessoais, opt-in

41. **F6.1 — Trabalho e carreira.** Experiências, competências, currículo, oportunidades e projetos; CRM profissional como extensão, não mistura obrigatória com amizades. Aceite: estudar uma competência se relaciona a um objetivo profissional.
42. **F6.2 — Relações, convivência e networking.** Contatos com múltiplos papéis, datas, eventos e lembretes escolhidos. Aceite: não importar contatos ou mensagens indiscriminadamente.
43. **F6.3 — Descanso e lazer.** Hobbies, pausas, experiências e tempo livre opcional. Aceite: planejamento respeita descanso sem transformá-lo em cobrança.
44. **F6.4 — Casa e inventário.** Bens, manutenção, garantia, empréstimo, vender/doar e documentos. Aceite: item gera lembrete/projeto sem exigir marketplace.
45. **F6.5 — Saúde e cuidados.** Registros voluntários de medidas, água, sono, atividade, consultas e metas; privacidade específica antes do primeiro dado. Aceite: exportar/apagar/controlar acesso; nenhuma promessa de diagnóstico, prescrição ou acompanhamento clínico automático.
46. **F6.6 — Diário, medos, problemas e decisões.** Contexto, intensidade autorrelatada opcional, ações possíveis, revisão e histórico. Aceite: não inferir transtorno ou enviar conteúdo íntimo a integrações sem escolha explícita.
47. **F6.7 — Valores e propósito.** Reflexões, crenças e espiritualidade opcionais, sem visão imposta. Aceite: pode ser inteiramente desativado e excluído.
48. **F6.8 — Sonhos, viagens e experiências.** Quadro visual ligado a metas/projetos/orçamento/eventos. Aceite: um sonho pode virar plano sem criar duplicatas desconectadas.
49. **F6.9 — Documentos e linha do tempo.** Validades, acontecimentos escolhidos, histórico e portabilidade. Aceite: usuário decide o que preservar e o que esquecer; não guardar tudo para sempre por padrão.

Essas entregas compartilham serviços e dados básicos, mas não devem aparecer como dezenas de botões obrigatórios. Ativação de módulos e nível de detalhe serão configuráveis.

### Fase 7 — Oráculo por WhatsApp, voz e imagens

**Depende:** API de ações, autorização, trilha mínima, limites, filas e custos definidos. Pode atender só ao proprietário antes do SaaS.

50. **F7.1 — Canal oficial e número controlado.** Confirmar provedor, disponibilidade e custos; preferir número recuperável e sob controle duradouro. Aceite: possibilidade documentada de trocar o canal sem perder dados ou lógica.
51. **F7.2 — Vinculação de identidade.** Usuário autenticado vincula número e comprova posse. Aceite: mensagem é resolvida no servidor para o usuário correto; não confiar em ID declarado no texto.
52. **F7.3 — Consultas e captura primeiro.** Agenda, próximas provas, ideias e lançamentos propostos. Aceite: respostas só incluem dados autorizados e datas/fusos claros.
53. **F7.4 — Ações controladas.** Prévia, confirmação proporcional ao risco, deduplicação de webhook e revogação. Aceite: mensagem repetida não cria dois gastos; ação de alto impacto exige confirmação mais forte quando aplicável.
54. **F7.5 — Multimodalidade.** Áudio/transcrição, imagem/OCR e voz no app conforme consentimento e orçamento. Aceite: falha de reconhecimento pede correção, não executa silenciosamente.

A confirmação inicial pode estabelecer um vínculo duradouro para uso cotidiano. Isso não significa “acesso total irrevogável para sempre”: troca de número, perda do aparelho e ações sensíveis precisam de recuperação, revogação e revalidação proporcionais. O telefone é canal, não a fonte de verdade do sistema.

### Fase 8 — colaboração e SaaS, somente quando você decidir

55. **F8.1 — Isolamento multiusuário demonstrado.** Testes com dois usuários, espaços privados e compartilhados, incluindo busca, arquivos e IA. Aceite: nenhum vazamento por ID, listagem, relatório ou sugestão.
56. **F8.2 — Convites e permissões.** Visualizar, sugerir, editar e administrar no recurso/espaço adequado; Master controla o serviço sem promessa enganosa de sigilo. Aceite: mudança de papel e revogação têm efeito real no servidor.
57. **F8.3 — Privacidade e direitos.** Finalidades, termos, autorização de contribuições, exportação, correção, exclusão e retenção; revisão jurídica proporcional antes da abertura. Aceite: promessas correspondem ao comportamento implementado.
58. **F8.4 — Administração e limites.** Bloquear conta, encerrar convite, limites de uso, custos, suporte e registros administrativos. Aceite: suspensão não apaga dados de surpresa; exclusão segue procedimento definido.
59. **F8.5 — Planos/cobrança opcionais.** Benefícios e concessões separados de autenticação. Aceite: oferecer acesso gratuito ou pago não depende de editar usuários manualmente no banco.
60. **F8.6 — Operação ampliada.** Monitoramento, resposta a incidentes, recuperação, capacidade e revisão de segurança independente. Aceite: evidências operacionais e responsável definidos, não apenas páginas de política.

**Marco final desta visão:** plataforma expansível com uso pessoal consolidado; abertura a terceiros é decisão separada, não consequência automática de publicar código.

## 11. NEXT_MILESTONE — o próximo pacote coerente

Não iniciar agora os 60 itens. O próximo pacote deve ser chamado **“Meu espaço pessoal confiável”**, composto por:

1. Conferir dados locais e preservar exportação, se existirem.
2. Validar login Master, primeira escrita real e leitura após reabrir.
3. Confirmar leitura/edição em segundo dispositivo e provar bloqueio para outra identidade.
4. Implementar recuperação de erro de salvamento e feedback correto.
5. Permitir montar uma grade em espaço vazio.
6. Inserir a grade real no espaço privado, confirmando as poucas informações ausentes.
7. Manter o foco ao navegar e salvar sessões parciais com contexto.
8. Acrescentar arquivamento/recuperação inicial e testar exportação/restauração.
9. Atualizar comunicação e documentação do que realmente está ativo.
10. Publicar o commit aprovado e verificar os mesmos fluxos na produção.

O banco relacional evolutivo deve ser desenhado em paralelo; sua migração não precisa bloquear a correção do cadastro de aula ou do timer. Inbox e Projetos entram no pacote seguinte, junto da primeira evolução tipada do modelo.

**Critério de conclusão do pacote:** você consegue organizar e usar uma semana real de faculdade, trocar de aparelho e recuperar o que registrou, sem exemplos se passando por dados reais e sem depender de uma aba permanentemente aberta.

## 12. Como saber que uma entrega está pronta

Cada item do plano terá responsável, dependências, tamanho estimado, evidência e estado. Estados sugeridos: planejado → em implementação → validado localmente → aplicado remotamente, se houver → publicado → validado em produção.

Uma entrega só será chamada de concluída quando:

- A ação útil funciona desde a interface até o armazenamento necessário.
- Erros, permissões e recuperação foram testados, não apenas o caminho feliz.
- O código passou pelos checks adequados e corresponde ao commit publicado.
- Migração, se necessária, foi aplicada e confirmada no ambiente certo.
- Não houve exposição de segredo ou conteúdo pessoal no repositório/demo/logs.
- Existem instruções de reversão proporcionais ao risco.
- O usuário consegue reconhecer o benefício na aplicação.

Não usar “100% pronto” para uma visão evolutiva sem escopo fechado. Dizer exatamente qual marco está pronto, com provas e pendências.

## 13. Evidências de código e referências

Links abaixo apontam para o commit auditado, não para uma branch que muda:

- [Modelo e limites do workspace](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/src/lib/workspace.ts).
- [Carregamento, gravação e conflitos](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/src/components/use-workspace.ts).
- [Agenda e edição de grade](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/src/components/academic-calendar.tsx).
- [Pomodoro atual](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/src/components/focus-timer.tsx).
- [Interface e montagem das seções](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/src/components/workspace-app.tsx).
- [API do workspace](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/src/app/api/workspace/route.ts).
- [Configuração e validação de identidade](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/src/lib/config.ts).
- [Migração inicial, RLS e RPC](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/supabase/migrations/20260924205403_personal_workspace.sql).
- [Restrição da função interna](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/supabase/migrations/20260925004423_restrict_internal_trigger.sql).
- [Workflow CI](https://github.com/crm26gold/faculdadepsicologia/blob/2d4145b4f31b3edd7090ce807bb90fdd99f3e0ce/.github/workflows/ci.yml).

Os resultados de configuração remota são uma fotografia de 26/09/2026 e podem mudar. As recomendações de arquitetura são decisões propostas nesta análise, não fatos já implementados. A aplicação dos guias Supabase e Vercel orientou especialmente a separação entre schema existente, publicação e fluxo real confirmado; a orientação de web moderna reforçou preservar controles nativos acessíveis em vez de substituí-los sem necessidade.

## 14. Direção do produto em uma frase

**Registrar com facilidade, organizar sem sobrecarga, relacionar com contexto, receber ajuda confiável e agir com controle — preservando a própria história sem obrigar a pessoa a medir toda a vida.**

Esta visão não depende de ter todas as ferramentas imediatamente. Depende de cada ferramenta entregue funcionar de verdade e se encaixar na seguinte.
