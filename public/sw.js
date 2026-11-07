/* Meu Banqueiro: service worker.
 * - Notificações (Web Push): mostra o aviso e, ao tocar, abre a tela certa.
 * - Sem internet: guarda a última versão de cada tela visitada (rede primeiro, cópia se cair) e os
 *   arquivos do app; sem cópia, mostra /offline, onde dá para anotar um gasto.
 * Ao sair da conta, o app pede para apagar as telas guardadas (mensagem "limpar"). */

const VERSION = "v2";
const PAGES = `mb-paginas-${VERSION}`;
const STATIC = `mb-arquivos-${VERSION}`;
const OFFLINE_URL = "/offline";
const NEVER_CACHE = ["/api/", "/entrar", "/criar-conta", "/esqueci-senha", "/redefinir-senha"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mb-") && k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "limpar") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Arquivos do app (nomes com hash): cópia primeiro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Telas: rede primeiro; guarda a última versão boa; sem rede, a cópia ou /offline.
  if (req.mode === "navigate" && !NEVER_CACHE.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected && res.type === "basic") {
            const cache = await caches.open(PAGES);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = (await caches.match(req, { ignoreSearch: false })) || (await caches.match(req, { ignoreSearch: true }));
          return cached || (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Meu Banqueiro", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Meu Banqueiro";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/painel" },
      lang: "pt-BR",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/painel", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
