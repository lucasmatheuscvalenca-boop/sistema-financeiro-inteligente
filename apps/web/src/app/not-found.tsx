import Link from "next/link";

export default function NotFound() {
  return (
    <main className="office-floor grid min-h-dvh place-items-center p-6">
      <div className="pixel-frame max-w-md bg-navy-850 p-8 text-center">
        <p className="font-pixel text-4xl text-signal">404</p>
        <h1 className="mt-3 text-lg font-semibold">Sala não encontrada</h1>
        <p className="mt-2 text-sm text-muted">
          Este endereço não existe ou pertence a um universo ao qual você não tem acesso.
        </p>
        <Link href="/inicio" className="mt-6 inline-block text-sm font-medium text-signal underline-offset-4 hover:underline">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
