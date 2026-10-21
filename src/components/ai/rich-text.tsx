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

export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: number) => {
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
  text.split("\n").forEach((line, idx) => {
    const t = line.trim();
    if (/^[•\-*]\s+/.test(t)) {
      list.push(t.replace(/^[•\-*]\s+/, ""));
      return;
    }
    flush(idx);
    if (!t) blocks.push(<div key={`s${idx}`} className="h-2" />);
    else blocks.push(<p key={`p${idx}`}>{inline(t)}</p>);
  });
  flush(-1);
  return <div className="space-y-0.5 text-sm leading-relaxed">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
