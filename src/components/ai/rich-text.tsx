import { Fragment, type ReactNode } from "react";

/** Renderização segura de um subconjunto simples de marcação (**negrito**, _itálico_, • listas). Nunca injeta HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    out.push(token.startsWith("**") ? <strong key={i++}>{token.slice(2, -2)}</strong> : <em key={i++} className="text-muted">{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Seções de apoio que ficam recolhidas para a resposta caber na tela (continuam a um toque). */
const COLLAPSIBLE = /^(Premissas|Para uma análise mais precisa):?$/i;

function Blocks({ lines, keyBase }: { lines: string[]; keyBase: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={`l${key}`} className="my-1 space-y-0.5 pl-1">
          {list.map((li, idx) => (
            <li key={idx} className="flex gap-2">
              <span aria-hidden className="text-petrol-500">•</span>
              <span>{inline(li)}</span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (/^[•\-*]\s+/.test(t)) {
      list.push(t.replace(/^[•\-*]\s+/, ""));
      return;
    }
    flush(`${keyBase}-${idx}`);
    if (!t) blocks.push(<div key={`s${keyBase}-${idx}`} className="h-2" />);
    else blocks.push(<p key={`p${keyBase}-${idx}`}>{inline(t)}</p>);
  });
  flush(`${keyBase}-end`);
  return <>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</>;
}

export function RichText({ text }: { text: string }) {
  // Agrupa em seções separadas por linha em branco; seções de apoio viram <details>.
  const sections: string[][] = [[]];
  for (const line of text.split("\n")) {
    if (!line.trim()) sections.push([]);
    else sections[sections.length - 1]!.push(line);
  }
  return (
    <div className="space-y-2.5 text-sm leading-relaxed">
      {sections.filter((sec) => sec.length).map((sec, i) =>
        COLLAPSIBLE.test(sec[0]!.trim()) ? (
          <details key={i} className="group rounded-xl bg-surface-2 px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-semibold text-muted transition group-open:mb-1 hover:text-ink">{sec[0]!.trim().replace(/:$/, "")}</summary>
            <Blocks lines={sec.slice(1)} keyBase={String(i)} />
          </details>
        ) : (
          <div key={i}>
            <Blocks lines={sec} keyBase={String(i)} />
          </div>
        ),
      )}
    </div>
  );
}
