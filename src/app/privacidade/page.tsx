import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = { title: 'Privacidade · Jornada Plena' };

export default function PrivacyPage() {
  return <LegalPage title="Política de privacidade">
    <p>Esta política explica, em linguagem simples, quais dados o Jornada Plena usa, por quê, com quem são compartilhados e como você exerce seus direitos pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</p>
    <h2>1. Dados que usamos</h2>
    <ul>
      <li><strong>Da sua conta Google:</strong> nome, e-mail e identificador da conta. Não recebemos sua senha.</li>
      <li><strong>O que você cria:</strong> seu espaço pessoal (matérias, anotações, anexos, agenda, finanças, rotina, metas), seus contatos, e o que você envia a salas e grupos.</li>
      <li><strong>Conversas do assistente:</strong> mensagens, transcrições, pedidos e resultados das conversas salvas na sua conta. Há também uma cópia neste navegador separada por conta; o histórico antigo só é enviado à nuvem quando você escolhe recuperá-lo e salvá-lo.</li>
      <li><strong>Registros de uso necessários:</strong> datas de criação e alteração, aceite destes termos e, para a administração, histórico de ações administrativas.</li>
    </ul>
    <h2>2. Para que usamos</h2>
    <p>Para funcionar: guardar seu espaço, organizar salas e trabalhos, mostrar a cada pessoa apenas o que ela pode ver. A base legal é a execução do serviço que você solicitou (LGPD, art. 7º, V) e, quando indicado, o seu consentimento.</p>
    <h2>3. Quem vê o quê</h2>
    <ul>
      <li><strong>Seu espaço pessoal e seus contatos:</strong> só você. Nem a administração tem acesso pelo sistema.</li>
      <li><strong>Salas e grupos:</strong> quem participa daquele espaço e quem o orienta. O e-mail das pessoas aparece apenas para quem gerencia a sala.</li>
      <li><strong>Administração:</strong> vê nome, e-mail, plano e em quais salas cada conta participa, para gerenciar acessos.</li>
    </ul>
    <p>A separação é garantida no banco de dados, não apenas na tela.</p>
    <h2>4. Onde ficam os dados</h2>
    <p>Usamos provedores de infraestrutura (Supabase, para banco de dados e arquivos, com servidores em São Paulo; e Vercel, para hospedagem). Eles processam os dados em nosso nome e com medidas de segurança.</p>
    <p>Para evitar downloads repetidos, imagens, áudios e vídeos privados podem ficar no cache deste navegador. O acesso é conferido ao carregar o anexo. Ao sair da conta, pedimos ao navegador que limpe esse cache, quando ele oferece suporte. Contadores de uso por conta ajudam a limitar abuso de IA, uploads e transferências; não contêm o conteúdo das conversas ou dos arquivos.</p>
    <h2>5. Inteligência artificial</h2>
    <p>Quando recursos de IA forem ativados (por exemplo, para revisar um trabalho de grupo), você será avisado antes sobre qual conteúdo é enviado e para qual provedor. Não usamos seus dados para treinar modelos e não vendemos dados.</p>
    <p>Na chamada do assistente, o áudio é enviado ao provedor de voz configurado (Gemini, OpenAI ou ElevenLabs). A Jornada não guarda a gravação e, com ElevenLabs, a gravação de áudio é desativada no agente; a transcrição fica na conversa. Pedidos autorizados e seus resultados ficam na sua conta para acompanhar a execução mesmo depois de encerrar a chamada. Fotos enviadas ficam em anotações privadas e, quando você pede leitura, são processadas pelo provedor de IA configurado. Ao usar o bot vinculado, o Telegram também processa as mensagens e os anexos.</p>
    <p>Em Assistente → Conversas você pode exportar ou excluir uma conversa e o histórico dos pedidos ligados a ela. Os registros que ela criou na agenda, nas notas e nas finanças continuam no seu espaço e podem ser editados ou excluídos separadamente. “Baixar todos os meus dados” inclui as conversas sincronizadas e os pedidos; a exclusão da conta também os apaga.</p>
    <h2>6. Melhoria do sistema</h2>
    <p>Para evoluir o Jornada Plena usamos apenas estatísticas anônimas (por exemplo, quantos trabalhos foram criados), nunca o conteúdo das suas anotações ou trabalhos.</p>
    <h2>7. Seus direitos</h2>
    <ul>
      <li><strong>Acessar e levar seus dados:</strong> em Meu espaço → Minha conta → “Baixar todos os meus dados”.</li>
      <li><strong>Corrigir:</strong> você edita seus dados diretamente no sistema.</li>
      <li><strong>Excluir:</strong> em Minha conta → “Excluir minha conta”. Apagamos seu espaço pessoal, anexos, contatos e participação nas salas. O que você já entregou a um trabalho de grupo permanece no trabalho, identificado como “Ex-membro”, pois é parte da entrega coletiva de outras pessoas.</li>
      <li><strong>Revogar o consentimento</strong> a qualquer momento, excluindo a conta.</li>
    </ul>
    <h2>8. Dados de terceiros</h2>
    <p>Na sua agenda de contatos você pode guardar dados de pessoas que não usam o sistema. Guarde apenas o necessário, para uso pessoal. Esses dados não são cruzados com contas nem mostrados a ninguém.</p>
    <h2>9. Menores de idade</h2>
    <p>O serviço é voltado a estudantes do ensino superior e profissionais. Menores de 18 anos devem usar com autorização dos responsáveis.</p>
    <h2>10. Contato</h2>
    <p>Para pedidos sobre seus dados, fale com a administração do Jornada Plena pelos canais da sua turma.</p>
  </LegalPage>;
}
