import Link from "next/link";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MascotArt } from "@/components/mascots/mascot-art";
import { getMascot, type MascotId } from "@/mascots/catalog";

const SUGGESTIONS = ["Quanto posso gastar hoje?", "Posso gastar R$ 600 neste fim de semana?", "Qual meta corre maior risco de atraso?"];

/** Entrada do assistente no painel: leva a pergunta para a conversa completa. */
export function AskMascot({ mascotId }: { mascotId: MascotId }) {
  const m = getMascot(mascotId);
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <MascotArt id={mascotId} state="guidance" size={52} />
        <div>
          <h2 className="text-base font-semibold">Converse com {m.article === "a" ? "a" : "o"} {m.name}</h2>
          <p className="text-xs text-muted">Respostas com seus números, calculadas pelo motor financeiro.</p>
        </div>
      </div>
      <form action="/assistente" className="relative mt-4">
        <input type="hidden" name="enviar" value="1" />
        <label htmlFor="ask-mascot" className="sr-only">
          Sua pergunta
        </label>
        <input id="ask-mascot" name="pergunta" required minLength={2} placeholder="Ex.: Posso gastar R$ 600 neste fim de semana?" className="h-11 w-full rounded-xl border border-field-line bg-field pl-4 pr-12 text-sm focus:border-petrol-400 focus:outline-none focus:ring-2 focus:ring-petrol-400/25" />
        <button aria-label="Perguntar" className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg bg-accent text-accent-ink transition hover:brightness-110">
          <Send className="size-4" />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((q) => (
          <Link key={q} href={`/assistente?enviar=1&pergunta=${encodeURIComponent(q)}`} className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-petrol-400 hover:text-ink">
            {q}
          </Link>
        ))}
      </div>
    </Card>
  );
}
