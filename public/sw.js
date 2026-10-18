/*
 * The service worker of Essensplan: it makes the app installable and keeps the shopping
 * notes for the shop, where there may be no connection.
 *
 * - The pages of the shopping notes (/einkauf) come from the network when it answers, and
 *   are kept. Without an answer the kept page is shown. The page names the notes worth
 *   keeping ("keep" message, `pagesForTheShop`), and they are fetched ahead.
 * - Scripts and styles are kept as they are loaded, so that a kept page also works, and
 *   the supermarkets' logos from Wikimedia Commons, so that a kept note shows them.
 * - Any other page without a connection shows /offline.html, which says what works.
 *
 * Nothing but GET requests of this origin is touched: ticks, forms and the database go
 * to the network as they always did. Ticks made offline wait in IndexedDB, not here.
 */

const VERSION = 2;
const PAGES = `pages-v${VERSION}`;
const ASSETS = `assets-v${VERSION}`;
const SHELL = `shell-v${VERSION}`;
const OFFLINE_PAGE = "/offline.html";
const SHELL_FILES = [OFFLINE_PAGE];

/** How long the network may take before a kept page is shown, in ms. 0: as long as it takes. */
const WAIT = Number(new URL(self.location.href).searchParams.get("wait") || 0);
/** A kept page younger than this is not fetched again ahead. */
const FRESH = 5 * 60 * 1000;
/** A kept page older than this is of no use in the shop. */
const STALE = 14 * 24 * 60 * 60 * 1000;
/** Scripts and styles of earlier versions of the app go when there are more than this. */
const MAX_ASSETS = 400;

const KEPT_AT = "x-essensplan-kept-at";

/** The supermarkets' logos (`commonsImageUrl`): small pictures that do not change. */
const LOGOS = /https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/[^"'\s\\<>]+/g;

function isLogo(url) {
  return (
    url.hostname === "commons.wikimedia.org" && url.pathname.startsWith("/wiki/Special:FilePath/")
  );
}

/** A page of the shopping notes, with or without a week and a note. */
function isNotesPage(url) {
  return url.origin === self.location.origin && /^\/einkauf\/?$/.test(url.pathname);
}

/** Pages are kept by path and query: "#laden" belongs to the same page. */
function pageKey(url) {
  return url.origin + url.pathname + url.search;
}

/** Only a page of the app itself: not the login page that a lost session leads to. */
function storable(response) {
  return (
    response.ok &&
    !response.redirected &&
    response.type === "basic" &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

/**
 * Keeps a page, stamped with the time it was asked for. A copy asked for earlier never
 * replaces one asked for later: a slow answer is an old answer.
 */
async function keepPage(key, response, askedAt) {
  const body = await response.blob();
  const cache = await caches.open(PAGES);
  const kept = await cache.match(key);
  if (kept && Number(kept.headers.get(KEPT_AT)) > askedAt) return;
  const headers = new Headers(response.headers);
  headers.set(KEPT_AT, String(askedAt));
  await cache.put(key, new Response(body, { status: response.status, headers }));
}

async function offlinePage() {
  return (
    (await caches.match(OFFLINE_PAGE)) ||
    new Response("Keine Verbindung.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => ![PAGES, ASSETS, SHELL].includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isLogo(url)) {
    event.respondWith(logo(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(asset(request));
  }
});

async function navigate(event, url) {
  const notes = isNotesPage(url);
  const askedAt = Date.now();
  const network = fetch(event.request).then((response) => {
    // Kept beside the answer, which goes out as it streams in.
    if (notes && storable(response)) {
      event.waitUntil(keepPage(pageKey(url), response.clone(), askedAt));
    }
    return response;
  });
  // The page is kept even when a kept copy was shown first.
  event.waitUntil(network.catch(() => undefined));
  const kept = notes ? await caches.match(pageKey(url), { cacheName: PAGES }) : undefined;
  if (!kept) return network.catch(() => offlinePage());
  return new Promise((resolve) => {
    let answered = false;
    const answer = (response) => {
      if (answered) return;
      answered = true;
      resolve(response);
    };
    network.then(answer, () => answer(kept));
    // In the shop the connection often hangs instead of failing.
    if (WAIT > 0) setTimeout(() => answer(kept), WAIT);
  });
}

/**
 * Scripts and styles. What the build names after its content never changes and comes from
 * the cache first; anything else (the dev server's) from the network first.
 */
async function asset(request) {
  const cache = await caches.open(ASSETS);
  const kept = await cache.match(request);
  if (kept && (kept.headers.get("cache-control") || "").includes("immutable")) return kept;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (kept) return kept;
    throw error;
  }
}

/** The pages being fetched ahead, one request after the other. */
let keeping = Promise.resolve();

/** A logo from the cache, or fetched and kept. Without either the picture is left out. */
async function logo(request) {
  const cache = await caches.open(ASSETS);
  const kept = await cache.match(request.url);
  if (kept) return kept;
  try {
    const response = await fetch(request);
    // A picture of another site comes back opaque: it can be kept, not looked into.
    if (response.ok || response.type === "opaque") await cache.put(request.url, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "keep" && Array.isArray(data.pages)) {
    // One after the other: the server is asked for one page at a time.
    keeping = keeping.then(() => keepAhead(data.pages, data.again === true)).catch(() => {});
    event.waitUntil(keeping);
  }
});

/**
 * Fetches the pages named, and what they load, unless they were fetched a moment ago, or
 * `again`: the page shown changed.
 */
async function keepAhead(pages, again) {
  const cache = await caches.open(PAGES);
  for (const page of pages) {
    const url = new URL(page, self.location.origin);
    if (!isNotesPage(url)) continue;
    const key = pageKey(url);
    const kept = await cache.match(key);
    if (kept && !again && Date.now() - Number(kept.headers.get(KEPT_AT)) < FRESH) continue;
    const askedAt = Date.now();
    let response;
    try {
      response = await fetch(key, { credentials: "same-origin", headers: { accept: "text/html" } });
    } catch {
      // The connection went: the rest another time.
      return;
    }
    if (!storable(response)) continue;
    const html = await response.clone().text();
    await keepPage(key, response, askedAt);
    await keepAssetsOf(html);
  }
  await tidy();
}

/** The scripts and styles a page names, also inside its inline data. */
async function keepAssetsOf(html) {
  const cache = await caches.open(ASSETS);
  const urls = new Set(html.match(/\/_next\/static\/[^"'\s\\)<>]+/g) || []);
  for (const path of urls) {
    const request = new Request(new URL(path, self.location.origin).href);
    if (await cache.match(request)) continue;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response);
    } catch {
      return;
    }
  }
  for (const url of new Set(html.match(LOGOS) || [])) {
    if (await cache.match(url)) continue;
    try {
      await cache.put(url, await fetch(url, { mode: "no-cors" }));
    } catch {
      return;
    }
  }
}

/** Forgets pages too old for the shop and scripts of versions long gone. */
async function tidy() {
  const pages = await caches.open(PAGES);
  for (const request of await pages.keys()) {
    const response = await pages.match(request);
    if (!response || Date.now() - Number(response.headers.get(KEPT_AT)) > STALE) {
      await pages.delete(request);
    }
  }
  const assets = await caches.open(ASSETS);
  const kept = await assets.keys();
  if (kept.length <= MAX_ASSETS) return;
  // What a kept page still names stays; of the rest the oldest go first.
  const named = new Set();
  for (const request of await pages.keys()) {
    const response = await pages.match(request);
    const html = response ? await response.text() : "";
    for (const path of html.match(/\/_next\/static\/[^"'\s\\)<>]+/g) || []) {
      named.add(new URL(path, self.location.origin).href);
    }
  }
  let over = kept.length - MAX_ASSETS;
  for (const request of kept) {
    if (over <= 0) break;
    if (named.has(request.url)) continue;
    await assets.delete(request);
    over -= 1;
  }
}
