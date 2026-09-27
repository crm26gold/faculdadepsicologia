# Jornada Plena — captura rápida

## Escopo

Caixa de entrada para texto livre, sem exigir matéria, área ou caderno.
A primeira linha vira título; o texto completo é preservado como parágrafos,
com HTML escapado. Limite de 10.000 caracteres por captura.

As capturas são anotações normais: a caixa mostra todas as notas sem área,
matéria ou caderno, inclusive antigas. Ao organizar, a mesma anotação sai da
lista, sem cópia ou exclusão. Não há classificação por IA nesta etapa.

## Persistência

Reutiliza o salvamento existente, com RLS e controle de revisão no modo cloud.
Não cria tabela, migração, credencial ou permissão nova. O indicador de
sincronização distingue atualização local de salvamento remoto; falhas mantêm
os mecanismos de proteção e backup existentes. Rascunhos no campo de captura
só são adicionados ao clicar em **Guardar ideia**.

## Verificação e limites

Testes de domínio cobrem escape de HTML, títulos Unicode, limites e organização.
Teste de navegador cobre captura, reload, organização sem perda, acessibilidade
e largura mobile. Resultados de execução e publicação são informados na entrega.

Continuam pendentes cursos, projetos/metas, conversão de captura em tarefa,
integração Google Agenda e IA generativa. Não confundir a caixa de entrada com
um gerenciador completo de tarefas ou com módulos financeiros/de saúde.
