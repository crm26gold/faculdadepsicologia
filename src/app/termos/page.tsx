import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = { title: 'Termos de uso · Jornada Plena' };

export default function TermsPage() {
  return <LegalPage title="Termos de uso">
    <p>O Jornada Plena é um organizador de vida e estudos com espaços pessoais e espaços coletivos (salas, grupos e trabalhos). Ao criar sua conta, você concorda com estes termos. Escrevemos de forma simples para que fique claro o que acontece.</p>
    <h2>1. Sua conta</h2>
    <p>Você entra com sua conta Google. Não pedimos nem guardamos senha. A conta é pessoal: não compartilhe o acesso. Você é responsável pelo que publica.</p>
    <h2>2. Espaço pessoal e espaços coletivos</h2>
    <ul>
      <li><strong>Espaço pessoal</strong> (matérias, caderno, agenda, finanças, rotina, metas, contatos): visível apenas para você.</li>
      <li><strong>Salas e grupos</strong>: o que você envia (partes de trabalho, comentários, votos, publicações) fica visível para quem participa daquele espaço e para quem o orienta. Em enquetes, as pessoas veem só os totais; seu voto individual é secreto.</li>
      <li>Você só entra em uma sala por convite ou por inclusão feita por professor(a) ou pela administração. Um grupo não vê o conteúdo de outro grupo.</li>
    </ul>
    <h2>3. Papéis</h2>
    <p>A administração da plataforma define quem é professor(a) em cada sala. Professores e líderes podem organizar trabalhos, pedir revisões e publicar no mural. A administração pode alterar papéis e planos; essas ações ficam registradas em histórico.</p>
    <h2>4. Trabalhos em grupo</h2>
    <p>Ao entregar sua parte, você autoriza que ela seja reunida com as demais no documento do grupo, com padronização de formatação. Se você sair do grupo ou excluir sua conta, o que já foi entregue continua no trabalho coletivo, identificado como “Ex-membro”, porque faz parte da entrega de outras pessoas.</p>
    <h2>5. Conduta</h2>
    <p>Não publique conteúdo ilegal, ofensivo, discriminatório, dados sensíveis de terceiros sem autorização, nem material que viole direitos autorais. Conteúdo impróprio pode ser removido e a conta suspensa.</p>
    <h2>6. Planos</h2>
    <p>O plano Acadêmico é gratuito e inclui a vida acadêmica e os espaços coletivos. O plano Pro inclui os blocos da vida pessoal (como finanças, rotina e metas) e recursos extras. Durante o período de lançamento, recursos podem estar liberados para todos. Quando houver cobrança, as condições, o preço e o direito de arrependimento de 7 dias (Código de Defesa do Consumidor, art. 49) serão informados antes da compra, e o cancelamento poderá ser feito pelo próprio sistema.</p>
    <h2>7. Disponibilidade</h2>
    <p>Trabalhamos para manter o sistema disponível e os dados seguros, mas recomendamos guardar cópias dos seus trabalhos importantes (há opções de exportação em cada trabalho e em “Minha conta”).</p>
    <h2>8. Mudanças</h2>
    <p>Se estes termos mudarem de forma relevante, você será avisado e poderá aceitar novamente ou excluir sua conta.</p>
    <h2>9. Contato</h2>
    <p>Dúvidas e pedidos: fale com a administração do Jornada Plena pelos canais da sua turma.</p>
  </LegalPage>;
}
