# Caderno multimídia — Jornada Plena

## Entrega

- Editor TipTap com parágrafos/títulos, fontes e tamanhos, negrito, itálico,
  sublinhado, tachado, cor, marca-texto, alinhamentos, citações, listas e tabelas.
- Links editáveis, com validação de protocolos e sem execução de JavaScript.
- Imagens por arquivo, colagem e arrastar/soltar; captura pelo seletor de câmera
  do dispositivo quando suportado. No computador pode abrir apenas arquivos.
- Áudio anexado com player no documento, sem reprodução automática.
- Ortografia pt-BR local, Hunspell/VERO em Worker: sublinhados e sugestões
  manuais. Não é revisão gramatical ou IA. Nenhum texto vai a serviço de revisão.
- Tema azul-marinho/branco/cinza, navegação maior e texto inicial de 18 px.

## Armazenamento e acesso

- Bucket `note-attachments` privado, 25 MiB por arquivo, tipos MIME explícitos;
  SVG, HTML, PDF e executáveis não são aceitos nesta etapa.
- A sessão Google Master é validada pelo servidor antes de emitir upload assinado.
- RLS exige allowlist `app_owner` e pasta igual ao UUID autenticado. Não há
  políticas de atualização ou exclusão de arquivos.
- Upload direto ao Storage evita o limite de corpo das funções da Vercel.
  URLs de upload são credenciais temporárias: não publicar nem registrar em logs.
- HTML guarda referência estável `/api/note-media/...`, nunca chave ou URL assinada.
  Ao abrir, o servidor autoriza e redireciona para URL válida por 120 segundos.
  Essa URL temporária pode ser usada por quem a possuir até expirar; não é DRM.
- Conteúdo existente não é migrado nem sobrescrito por este lançamento.
- Remover um bloco não apaga o arquivo; versões/backup podem referenciá-lo.
  Limpeza de órfãos com confirmação e gestão de quota total ficam pendentes.

## Limites transparentes

- Anexos exigem espaço autenticado na nuvem; não são simulados na demo/local.
- JSON exportado inclui texto e referências dos anexos, **não os arquivos**.
  Não é backup completo de mídia. A cópia independente dos arquivos é necessária.
- Sem gravação de microfone, transcrição, OCR ou sincronização Google Docs nesta entrega.
- Câmera depende do navegador/dispositivo; não promete acesso à webcam desktop.
- Sugestões ortográficas podem marcar nomes próprios; ignorar vale nesta sessão.
- Download inicial do dicionário tem aproximadamente 5,5 MB mais o runtime.
- Testes locais de mídia usam arquivos artificiais e verificam preservação de HTML;
  o primeiro envio pela conta real deve ser conferido após a publicação.
- Advisor de segurança: apenas o aviso preexistente de proteção contra senhas
  vazadas desativada; o aplicativo segue exigindo Google. Referência:
  [proteção de senhas no Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Dependências e reprodução

Dependências fixadas no lockfile. `npm run build` e `npm run dev` executam
`scripts/prepare-spelling.mjs`, copiando arquivos originais dos pacotes instalados
para `public/spelling`. Arquivos gerados não são commitados. Licenças upstream
são disponibilizadas junto dos ativos (Hunspell e dicionário VERO).
