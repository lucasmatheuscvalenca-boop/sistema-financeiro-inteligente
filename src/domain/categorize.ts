import type { ISODate } from "./dates";
import { diffDays } from "./dates";
import type { Cents } from "./money";

/**
 * Categorização automática a partir da descrição do extrato, como os aplicativos dos bancos
 * fazem. Três fontes, nesta ordem (resolvidas no serviço): regra aprendida com a pessoa,
 * dicionário de estabelecimentos abaixo e, no Open Finance, a categoria que o banco informa.
 * Nada aqui troca uma categoria que a pessoa escolheu: só preenche o que está vazio.
 */

export type TxKindForRules = "income" | "expense";

export interface CategorySuggestion {
  /** Nome da categoria padrão (ver default-categories). */
  category: string;
  /** Subcategoria padrão, quando existir. */
  sub?: string;
}

function plain(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[*|/\\_#:;,.()[\]{}'"-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "de", "da", "do", "das", "dos", "com", "no", "na", "em", "para", "pelo", "pela", "por", "a", "o", "e",
  "compra", "compras", "cartao", "debito", "credito", "pix", "enviado", "enviada", "recebido", "recebida",
  "transferencia", "transf", "pagamento", "pgto", "pag", "parcela", "parc", "ltda", "me", "sa", "eireli",
  "loja", "ref", "aut", "autorizado", "ted", "doc", "brasil", "br", "sp", "rj", "mg", "pr", "rs", "sc", "ba",
]);

/**
 * Chave do estabelecimento: a descrição sem números, datas, finais de cartão e palavras de
 * ligação, reduzida às duas primeiras palavras. "UBER *TRIP HELP.UBER.COM 03/11" → "uber trip".
 */
export function merchantKey(description: string): string {
  const tokens = plain(description)
    .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\b\w*\d\w*\b/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
  return tokens.slice(0, 2).join(" ");
}

type Rule = { test: RegExp; category: string; sub?: string; kind?: TxKindForRules };

const E = (test: RegExp, category: string, sub?: string): Rule => ({ test, category, sub, kind: "expense" });
const I = (test: RegExp, category: string): Rule => ({ test, category, kind: "income" });

/** Dicionário de estabelecimentos e serviços como aparecem nos extratos brasileiros. */
export const MERCHANT_RULES: readonly Rule[] = [
  // Transporte
  E(/\buber(?!\s*eats)\b|\b99\s*(pop|taxi|app)?\b|\bcabify\b|\bindriver?\b|\bbuser\b|\bblablacar\b/, "Transporte", "Aplicativos"),
  E(/\b(shell|ipiranga|petrobras|br\s*distribuidora|texaco|ale\s*combust|posto|auto\s*posto|combustive(l|is)|gasolina|etanol)\b/, "Transporte", "Combustível"),
  E(/\b(bilhete\s*unico|sptrans|metro|cptm|supervia|brt|riocard|top\s*recarga|cartao\s*top|vem\s*recarga|onibus|passagem)\b/, "Transporte", "Transporte público"),
  E(/\b(estacionamento|estapar|zona\s*azul|parking|multipark|sem\s*parar|conectcar|veloe|move\s*mais|pedagio|taggy)\b/, "Transporte", "Estacionamento"),
  E(/\b(localiza|movida|unidas|detran|ipva|licenciamento|lavagem|lava\s*rapido|auto\s*center|pneu|mecanic)/, "Transporte"),
  // Restaurantes e delivery
  E(/\bifood\b|\bifd\b|\brappi\b|\buber\s*eats\b|\bze\s*delivery\b|\bdaki\b|\bjames\s*delivery\b|\baiqfome\b/, "Restaurantes e delivery"),
  E(/\b(mc\s*donald|mcdonalds|burger\s*king|bk\b|subway|habibs|habib s|giraffas|outback|madero|spoleto|china\s*in\s*box|pizza|pizzaria|sushi|hamburg|burger|lanchonete|restaurante|rest\b|bar\b|boteco|churrascaria|cafeteria|cafe\b|starbucks|padaria|confeitaria|doceria|sorveteria|acai|pastel|esfiha|temakeria|bistro|cantina|food|lanches|coffee)\b/, "Restaurantes e delivery"),
  // Mercado
  E(/\b(carrefour|pao\s*de\s*acucar|extra\b|assai|atacadao|big\b|walmart|sams\s*club|makro|dia\b|zaffari|condor|angeloni|savegnago|mambo|st\s*marche|hortifruti|oba\s*hortifruti|natural\s*da\s*terra|supermercado|supermerc|mercado|mercadinho|minimercado|emporio|quitanda|sacolao|acougue|frutaria|hiper|atacado|bistek|muffato|tauste|comper|guanabara|prezunic|mundial|covabra|bretas|epa\b|bahamas|bompreco|nordestao|cometa)\b/, "Mercado"),
  // Assinaturas
  E(/\b(netflix|spotify|disney|hbo|max\b|prime\s*video|amazon\s*prime|globoplay|paramount|apple\s*tv|apple\.com\/bill|apple\s*com\s*bill|itunes|icloud|google\s*one|google\s*play|youtube|deezer|crunchyroll|star\+|telecine|dazn|kindle|audible|dropbox|microsoft\s*365|office\s*365|adobe|canva|chatgpt|openai|anthropic|claude|notion|github|duolingo|headspace|calm\b|strava|ps\s*plus|playstation|xbox|nintendo|steam|twitch|patreon|uol\s*assinatura|folha\b|estadao|globo\s*com|o\s*globo)\b/, "Assinaturas"),
  // Contas da casa
  E(/\b(enel|cemig|cpfl|light\b|copel|celesc|coelba|neoenergia|equatorial|energisa|elektro|edp\b|eletropaulo|celpe|cosern|ceee|amazonas\s*energia|energia\s*eletrica|conta\s*de\s*luz)\b/, "Contas da casa", "Energia"),
  E(/\b(sabesp|cedae|copasa|sanepar|casan|embasa|caesb|compesa|cagece|corsan|saneago|agua\s*e\s*esgoto|conta\s*de\s*agua)\b/, "Contas da casa", "Água"),
  E(/\b(vivo|claro|tim\b|oi\b|net\s*servicos|net\b|sky\b|algar|nextel|telefonica|internet|fibra|banda\s*larga|telefone|celular\s*recarga|recarga)\b/, "Contas da casa", "Internet e telefone"),
  E(/\b(comgas|naturgy|ultragaz|liquigas|copagaz|supergasbras|gas\s*natural|botijao|gas\b)\b/, "Contas da casa", "Gás"),
  // Moradia
  E(/\b(aluguel|locacao|imobiliaria|quintoandar|quinto\s*andar|loft\b|creci)\b/, "Moradia", "Aluguel"),
  E(/\b(condominio|cond\b|sindico|taxa\s*condominial)\b/, "Moradia", "Condomínio"),
  E(/\b(leroy\s*merlin|telhanorte|c\s*c\b|cec\b|obramax|tumelero|cassol|dicico|material\s*de\s*construcao|encanador|eletricista|pintor|reforma|marcenaria|chaveiro)\b/, "Moradia", "Manutenção"),
  // Saúde
  E(/\b(drogasil|droga\s*raia|raia\b|raiadrogasil|drogaria|drogarias|pacheco|pague\s*menos|panvel|nissei|sao\s*joao|drogaria\s*sao\s*paulo|farmacia|farma\b|ultrafarma|farmais|extrafarma|onofre|bifarma)\b/, "Saúde", "Farmácia"),
  E(/\b(unimed|amil|bradesco\s*saude|sulamerica|sul\s*america|hapvida|notredame|notre\s*dame|prevent\s*senior|porto\s*seguro\s*saude|plano\s*de\s*saude|golden\s*cross|seguros\s*unimed)\b/, "Saúde", "Plano de saúde"),
  E(/\b(hospital|clinica|laboratorio|lab\b|fleury|dasa|hermes\s*pardini|delboni|consulta|dentista|odonto|ortodont|psicolog|terapia|fisioterap|nutricion|medic[oa]|dr\b|dra\b|exame|oftalm|dermat)\b/, "Saúde", "Consultas"),
  E(/\b(smart\s*fit|smartfit|bluefit|bio\s*ritmo|bodytech|selfit|academia|crossfit|pilates|yoga|gympass|wellhub|totalpass|natacao|muay|jiu)\b/, "Saúde"),
  // Educação
  E(/\b(escola|colegio|faculdade|universidade|uninove|unip|anhanguera|estacio|cruzeiro\s*do\s*sul|puc\b|fiap|mackenzie|senac|senai|curso|udemy|alura|coursera|hotmart|kiwify|eduzz|wizard|ccaa|cultura\s*inglesa|fisk|kumon|mensalidade|livraria|saraiva|cultura\b|amazon\s*kindle|apostila|material\s*escolar|papelaria|kalunga)\b/, "Educação"),
  // Impostos e taxas
  E(/\b(iptu|ipva|darf|das\b|simples\s*nacional|inss|receita\s*federal|gru\b|tarifa|taxa\s*de|anuidade|juros|multa|iof|encargos|cartorio|detran|prefeitura|governo|fgts|cobranca\s*bancaria|pacote\s*de\s*servicos)\b/, "Impostos e taxas"),
  // Compras
  E(/\b(amazon(?!\s*prime)|mercado\s*livre|mercadolivre|meli\b|shopee|aliexpress|shein|magazine\s*luiza|magalu|americanas|casas\s*bahia|ponto\s*frio|fast\s*shop|kabum|pichau|terabyte|dell|apple\s*store|samsung|renner|riachuelo|c&a|cea\b|zara|hering|marisa|centauro|netshoes|nike|adidas|decathlon|lojas?\s|havan|tok\s*stok|etna|mobly|madeira\s*madeira|camicado|le\s*biscuit|polishop|boticario|o\s*boticario|natura|sephora|mac\s*cosmetics|ri\s*happy|pbkids|game\s*stop|pag\s*seguro|pagseguro|sumup|stone\b|cielo|rede\b|getnet|mp\s*\*|mercadopago\s*\*)/, "Compras"),
  // Lazer
  E(/\b(cinema|cinemark|cinepolis|kinoplex|uci\b|ingresso\s*com|ingresso\.com|sympla|eventim|ticket|teatro|show\b|museu|parque|zoologico|aquario|boliche|karaoke|bar\b|balada|club\b|clube|festa|hopi\s*hari|beto\s*carrero|cerveja|chopp|ze\s*delivery)\b/, "Lazer"),
  // Viagens
  E(/\b(latam|gol\s*linhas|gol\b|azul\b|avianca|tap\b|american\s*airlines|copa\s*airlines|booking|airbnb|hotel|hostel|pousada|resort|decolar|cvc\b|hurb|123\s*milhas|maxmilhas|expedia|trivago|rodoviaria|viacao|buser|passagem\s*aerea|aeroporto|seguro\s*viagem)\b/, "Viagens"),
  // Cuidados pessoais
  E(/\b(salao|salão|cabeleireir|barbearia|barber|manicure|estetica|spa\b|depilacao|perfumaria|cosmetic|boticario|natura|avon|eudora|quem\s*disse\s*berenice)\b/, "Cuidados pessoais"),
  // Pets
  E(/\b(petz|cobasi|petlove|pet\s*shop|petshop|veterinari|clinica\s*vet|racao|pet\b)\b/, "Pets"),
  // Presentes e doações
  E(/\b(presente|doacao|vaquinha|apoia\s*se|igreja|dizimo|oferta|caridade|unicef|medicos\s*sem\s*fronteiras|graac|aacd|instituto)\b/, "Presentes e doações"),
  // Receitas
  I(/\b(salario|sal\b|folha|pagto\s*sal|remuneracao|vencimentos|holerite|pro\s*labore|prolabore|adiantamento\s*salarial|13o|decimo\s*terceiro|ferias)\b/, "Salário"),
  I(/\b(comissao|comissoes|bonus|bonificacao|premiacao|gratificacao)\b/, "Comissões"),
  I(/\b(rendimento|rendimentos|juros|dividendo|dividendos|jcp\b|jscp|cupom|resgate\s*rend|rend\s*poupanca|rend\s*cdb|tesouro|proventos|cashback)\b/, "Rendimentos"),
  I(/\b(freela|freelance|servico\s*prestado|nota\s*fiscal|nf\b|honorario|cliente|venda|vendas|mercado\s*pago\s*recebimento|pagseguro\s*recebimento|stone\s*recebimento|getnet\s*recebimento|cielo\s*recebimento)\b/, "Renda variável"),
  I(/\b(restituicao|premio|loteria|mega\s*sena|heranca|indenizacao|fgts\s*saque|acerto)\b/, "Ganhos extraordinários"),
];

/** Sugere categoria (e subcategoria) pelo dicionário. Nulo quando não reconhece. */
export function suggestCategory(description: string, kind: TxKindForRules): CategorySuggestion | null {
  const text = ` ${plain(description)} `;
  for (const r of MERCHANT_RULES) {
    if (r.kind !== kind) continue;
    if (r.test.test(text)) return { category: r.category, sub: r.sub };
  }
  return null;
}

/**
 * Tradução das categorias que o Open Finance (Pluggy) manda em inglês ou português para as
 * categorias padrão do NEXO. Parcial de propósito: o que não casa cai no dicionário acima.
 */
export function categoryFromBank(bankCategory: string | null | undefined): CategorySuggestion | null {
  if (!bankCategory) return null;
  const c = plain(bankCategory);
  const table: Array<[RegExp, CategorySuggestion]> = [
    [/groceries|supermarket|mercado/, { category: "Mercado" }],
    [/restaurant|food|delivery|eating out|alimentacao|bar/, { category: "Restaurantes e delivery" }],
    [/taxi|ride|uber|transporte por app|mobilidade/, { category: "Transporte", sub: "Aplicativos" }],
    [/gas station|fuel|combustivel/, { category: "Transporte", sub: "Combustível" }],
    [/parking|toll|estacionamento|pedagio/, { category: "Transporte", sub: "Estacionamento" }],
    [/public transport|transporte publico|bus|metro/, { category: "Transporte", sub: "Transporte público" }],
    [/transport|vehicle|car|auto/, { category: "Transporte" }],
    [/subscription|streaming|assinatura|digital services|software/, { category: "Assinaturas" }],
    [/electricity|energia|luz/, { category: "Contas da casa", sub: "Energia" }],
    [/water|agua/, { category: "Contas da casa", sub: "Água" }],
    [/internet|phone|telecom|telefon/, { category: "Contas da casa", sub: "Internet e telefone" }],
    [/gas\b|gas bill/, { category: "Contas da casa", sub: "Gás" }],
    [/utilities|bills|contas/, { category: "Contas da casa" }],
    [/rent|aluguel/, { category: "Moradia", sub: "Aluguel" }],
    [/condominium|condominio/, { category: "Moradia", sub: "Condomínio" }],
    [/housing|home|moradia|casa/, { category: "Moradia" }],
    [/pharmacy|farmacia|drugstore/, { category: "Saúde", sub: "Farmácia" }],
    [/health insurance|plano de saude/, { category: "Saúde", sub: "Plano de saúde" }],
    [/health|medical|saude|gym|fitness|academia|wellness/, { category: "Saúde" }],
    [/education|educacao|school|course|curso|books/, { category: "Educação" }],
    [/tax|imposto|fees|taxa|government|governo|fine|multa|bank fees|tarifa/, { category: "Impostos e taxas" }],
    [/shopping|clothing|electronics|compras|roupa|eletronic|department|retail|online/, { category: "Compras" }],
    [/leisure|entertainment|lazer|entretenimento|games|cinema|events/, { category: "Lazer" }],
    [/travel|viagem|hotel|airline|flight|lodging/, { category: "Viagens" }],
    [/personal care|beauty|cuidados pessoais|beleza|barber|salon/, { category: "Cuidados pessoais" }],
    [/pet/, { category: "Pets" }],
    [/gift|donation|presente|doacao|charity/, { category: "Presentes e doações" }],
    [/salary|salario|payroll|wages|income/, { category: "Salário" }],
    [/investment income|dividend|interest|rendimento|yield|proventos/, { category: "Rendimentos" }],
  ];
  for (const [re, s] of table) if (re.test(c)) return s;
  return null;
}

export interface SubscriptionTx {
  id: string;
  date: ISODate;
  description: string;
  amountCents: Cents;
  accountId?: string | null;
  cardId?: string | null;
  categoryId?: string | null;
}

export interface DetectedSubscription {
  key: string;
  name: string;
  amountCents: Cents;
  /** Dia do mês em que costuma cair. */
  day: number;
  occurrences: number;
  lastDate: ISODate;
  accountId: string | null;
  cardId: string | null;
  categoryId: string | null;
}

/**
 * Assinaturas: o mesmo estabelecimento cobrando mais de uma vez, com valor parecido (até 15%)
 * e intervalo de um mês (20 a 40 dias). Considera só saídas realizadas.
 */
export function detectSubscriptions(txs: readonly SubscriptionTx[]): DetectedSubscription[] {
  const groups = new Map<string, SubscriptionTx[]>();
  for (const t of txs) {
    if (t.amountCents <= 0) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: DetectedSubscription[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) continue;
    let monthly = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = diffDays(sorted[i - 1]!.date, sorted[i]!.date);
      const a = sorted[i - 1]!.amountCents;
      const b = sorted[i]!.amountCents;
      if (gap >= 20 && gap <= 40 && Math.abs(a - b) <= Math.max(a, b) * 0.15) monthly++;
    }
    if (monthly === 0) continue;
    const last = sorted[sorted.length - 1]!;
    const name = prettyMerchant(last.description);
    out.push({
      key,
      name,
      amountCents: last.amountCents,
      day: Number(last.date.slice(8, 10)),
      occurrences: sorted.length,
      lastDate: last.date,
      accountId: last.accountId ?? null,
      cardId: last.cardId ?? null,
      categoryId: last.categoryId ?? null,
    });
  }
  return out.sort((a, b) => b.amountCents - a.amountCents);
}

/** Nome apresentável do estabelecimento: "IFD*IFOOD CLUB 03/11" → "Ifood Club". */
export function prettyMerchant(description: string): string {
  const key = plain(description)
    .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, " ")
    .replace(/\b\w*\d\w*\b/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
    .slice(0, 3);
  if (key.length === 0) return description.trim();
  return key.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export interface MerchantTotal {
  key: string;
  name: string;
  cents: Cents;
  count: number;
}

/** Onde mais saiu dinheiro: soma por estabelecimento. */
export function topMerchants(txs: readonly SubscriptionTx[], limit = 5): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>();
  for (const t of txs) {
    if (t.amountCents <= 0) continue;
    const key = merchantKey(t.description) || plain(t.description);
    const cur = map.get(key) ?? { key, name: prettyMerchant(t.description), cents: 0, count: 0 };
    cur.cents += t.amountCents;
    cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, limit);
}
