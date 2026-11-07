"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="office-floor grid min-h-dvh place-items-center p-6">
      <div className="pixel-frame max-w-md bg-navy-850 p-8 text-center">
        <p className="font-pixel text-3xl text-danger">Ops!</p>
        <h1 className="mt-3 text-lg font-semibold">Algo deu errado nesta tela</h1>
        <p className="mt-2 text-sm text-muted">O erro foi registrado no servidor. Tente de novo.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-md bg-signal px-4 py-2 text-sm font-semibold text-navy-950 hover:brightness-110"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
