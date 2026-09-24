# Roadmap

Este é um plano de evolução, sem datas prometidas. A [matriz do README](../README.md#estado-do-projeto) registra o que existe no código local. Uma tela, variável ou migração preparada não significa integração ativa.

## 1. Concluir a publicação e separar os ambientes

O projeto de demo `faculdadepsicologia-demo` já foi criado. Antes de anunciar uma demo disponível:

- Concluir a remoção de conteúdo identificável, grade real e referências privadas desnecessárias de código, testes, documentos, imagens e artefatos públicos.
- Validar `APP_MODE=demo` com exemplos inventados e armazenamento independente. A execução local deve funcionar sem Vercel ou credenciais.
- Exigir, na Vercel, que `DEMO_VERCEL_PROJECT_ID` coincida com `VERCEL_PROJECT_ID` e seja diferente do projeto privado. Testar também os casos de recusa.
- Impedir que credenciais de Supabase, proprietário, Google ou IA façam parte do ambiente de demo.
- Iniciar um workspace privado novo vazio e preservar os dados existentes na chave local. Retirar uma grade do código público não autoriza removê-la dos dados pessoais existentes.
- Validar os testes de navegador no CI, com os servidores isolados e os dados sintéticos definidos na implementação principal.

Critério de conclusão: código público sem dados pessoais, demo identificada e isolada, verificações negativas de acesso aprovadas e preservação dos dados existentes demonstrada. Projeto de hospedagem criado não equivale a deployment concluído.

## 2. Validar o workspace privado

Concluir Google OAuth exclusivo do proprietário, conferir UUID e e-mail no servidor e verificar as origens permitidas. Provisionar a identidade autorizada explicitamente, sem cadastro público ou promoção do primeiro login.

A migração Supabase deve ser revisada e aplicada somente no projeto privado correto. Verificar leitura/gravação do proprietário, recusa de outros usuários e anônimos, RLS e conflitos de revisão. Só então ativar as flags correspondentes. A instalação nova permanece vazia, sem copiar exemplos da demo ou dados locais automaticamente.

Critério de conclusão: evidência externa de autenticação, autorização e persistência; backup e recuperação verificados. No estado documental atual, Google/Supabase remotos não foram configurados/verificados.

## 3. Ampliar o modelo acadêmico e pessoal

Todos os módulos abaixo estão no roadmap, não disponíveis como módulos completos.

| Área | Escopo planejado | Dependência para entrega |
| --- | --- | --- |
| Vários cursos | Cursos independentes, períodos e vínculo de matérias, agenda, notas e materiais. | Migração versionada que preserve os dados atuais e filtros por curso. |
| Finanças | Receitas, despesas, categorias, orçamento e acompanhamento de pagamentos. | Modelo próprio, validação de valores e privacidade; integração bancária não está incluída. |
| Saúde | Registros pessoais e compromissos de cuidado escolhidos pela pessoa. | Acesso restrito e consentimento por finalidade; dados de saúde não seguem automaticamente para IA. |
| Rotina | Hábitos, recorrências pessoais e organização diária. | Recorrências próprias e controle de lembretes, além das tarefas acadêmicas atuais. |
| Social | Contatos, compromissos e organização de relações/grupos. | Permissões e convites explícitos antes de qualquer compartilhamento. |
| Inventário | Bens, materiais, localização, empréstimos e manutenção. | Cadastro e histórico próprios, sem expor bens pessoais na demo. |
| Metas | Objetivos, etapas, prazos e acompanhamento de progresso. | Relações claras com tarefas e revisão manual das sugestões. |

Critério comum: modelo, interface e testes de persistência próprios, estados vazios úteis e exemplos públicos inteiramente sintéticos. Renomear um painel ou reutilizar uma lista de tarefas não conclui um módulo.

## 4. Integrar serviços com autorização

Calendários externos, biblioteca de materiais, serviços institucionais e assistentes por matéria dependem de APIs disponíveis e permissões específicas. A exportação `.ics` atual não equivale a sincronização, e login Google não concede acesso ao Drive ou à Agenda.

Antes de enviar conteúdo a uma IA, definir provedor, orçamento, limites, conteúdo autorizado, retenção e forma de revogar a permissão. As chaves permanecem no servidor. Nenhum módulo privado alimenta IA por padrão.

## 5. Oráculo por WhatsApp

O Oráculo é uma integração futura de consulta e organização via WhatsApp. Não há bot ativo, mensagens enviadas, webhook implementado ou conexão com modelo de IA nesta versão.

A entrega exige:

1. Identidade de tenant derivada de uma sessão/conta autorizada no servidor. Telefone ou texto recebido, por si só, não define autorização.
2. Vinculação verificada entre remetente, usuário e workspace, com possibilidade de revogar e refazer o vínculo.
3. Consentimento explícito para o canal, os módulos consultáveis e o eventual envio de conteúdo ao provedor de IA. Esse consentimento deve poder ser revogado.
4. Autorização por operação e isolamento entre tenants, com testes para impedir leitura ou escrita em outro workspace.
5. Validação da origem dos eventos, proteção contra repetição, limites de uso e registro mínimo de ações sem copiar notas ou dados sensíveis para logs.
6. Confirmação antes de alterações relevantes, comunicação clara do resultado e controle sobre lembretes e mensagens iniciadas pelo serviço.

Critério de conclusão: integração real verificada em ambiente de teste, consentimento e revogação funcionais, testes de isolamento e implantação separada da demo pública.
