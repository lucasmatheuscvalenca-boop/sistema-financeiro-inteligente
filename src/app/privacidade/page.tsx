import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/app/logo";

export const metadata: Metadata = { title: "Aviso de privacidade" };

const SECTIONS: Array<[string, string[]]> = [
  [
    "Quais dados tratamos",
    [
      "Dados de conta: nome, e-mail e senha (guardada apenas como hash scrypt — nunca em texto).",
      "Dados financeiros que você informa ou importa: contas, cartões, movimentações, orçamentos, metas, patrimônio, dívidas e plano de aposentadoria.",
      "Respostas do briefing e itens de memória do assistente (declarados por você ou inferidos e confirmados por você).",
      "Conversas com o assistente, alertas, revisões e conquistas.",
      "Dados técnicos mínimos de segurança: sessões (com o navegador usado) e registros de auditoria. Endereços IP são guardados apenas como hash.",
    ],
  ],
  [
    "Para que usamos",
    [
      "Exclusivamente para calcular e apresentar sua situação financeira, simulações, alertas e respostas do assistente para você.",
      "Não vendemos dados, não exibimos publicidade e não usamos seus dados para oferecer crédito.",
    ],
  ],
  [
    "Assistente com IA",
    [
      "Quando o modo com IA está ativo, o texto da sua pergunta, o histórico recente da conversa e os resultados das ferramentas de cálculo necessários para a resposta são enviados ao provedor do modelo de linguagem (Anthropic) para gerar a resposta.",
      "Sem a chave do provedor configurada, o assistente funciona em modo local e nada é enviado para fora.",
      "O assistente não executa transações nem altera seus dados financeiros.",
    ],
  ],
  [
    "Conexões bancárias",
    [
      "Nunca pedimos nem guardamos senha bancária. A autorização acontece no ambiente do banco ou do agregador de Open Finance.",
      "Guardamos o consentimento (escopos, finalidade, validade), o identificador da conexão cifrado e o histórico de sincronizações. Você pode revogar a qualquer momento e apagar os dados importados.",
    ],
  ],
  [
    "Compartilhamento",
    ["Só existe se você convidar alguém para uma meta específica. A pessoa vê apenas essa meta e seus aportes, e você pode revogar o acesso quando quiser."],
  ],
  [
    "Seus controles",
    [
      "Exportar todos os seus dados em JSON, corrigir informações, apagar itens de memória e conversas, encerrar sessões e excluir a conta com todos os dados — em Configurações › Privacidade e segurança.",
    ],
  ],
  [
    "Segurança",
    [
      "Isolamento por conta em todas as consultas, cookies de sessão httpOnly, limites de tentativas de login, cifragem de identificadores sensíveis e registro de auditoria.",
      "Nenhum sistema é invulnerável. Esta é uma versão em desenvolvimento: antes de uso em produção com dados reais, a operação deve passar por revisão jurídica (LGPD), definição do controlador e do encarregado, política de retenção e testes de segurança independentes.",
    ],
  ],
];

export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/" aria-label="Página inicial">
        <Logo />
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">Aviso de privacidade</h1>
      <p className="mt-3 text-muted">Explicação em linguagem simples de como o Rumo trata seus dados. Este texto descreve o funcionamento do software e não substitui uma política jurídica revisada por profissional habilitado.</p>
      <div className="mt-8 space-y-8">
        {SECTIONS.map(([title, items]) => (
          <section key={title}>
            <h2 className="text-lg font-semibold">{title}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
