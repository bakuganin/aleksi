"use strict";

var CACHE_NAME = "aleksi-schedule-assets-20260916-v27";
var ASSET_URLS = [
  "/schedule/manifest.webmanifest",
  "/schedule.css?v=20260916-schedule-ux-v8",
  "/schedule-dates.js?v=20260915-cloud-v1",
  "/schedule-data.js?v=20260916-schedule-ux-v8",
  "/schedule-widget.js?v=20260916-schedule-ux-v8",
  "/schedule-calendar.js?v=20260916-schedule-ux-v8",
  "/schedule-app.js?v=20260916-schedule-ux-v8",
  "/i18n.js?v=20260913-page-config-v1",
  "/locales/ru.json",
  "/locales/et.json",
  "/locales/en.json",
  "/assets/brand-mark.svg",
  "/assets/boxing-glove-marquee.svg",
  "/assets/pwa/icon-192.png",
  "/assets/pwa/icon-512.png",
  "/assets/pwa/icon-maskable-512.png",
  "/assets/pwa/apple-touch-icon.png"
];
var PRECACHE_URLS = ASSET_URLS.slice();
var ASSET_PATHS = ASSET_URLS.map(function (value) {
  return new URL(value, self.location.origin).pathname;
});

function canonicalRequest(path) {
  return new Request(path, { credentials: "same-origin", cache: "reload" });
}

function cacheSuccessful(cache, request, response) {
  if (response && response.ok && response.type === "basic") {
    return cache.put(request, response.clone()).then(function () { return response; });
  }
  return Promise.resolve(response);
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS.map(canonicalRequest));
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME && key.indexOf("aleksi-schedule-") === 0) return caches.delete(key);
        return false;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function cacheFirstAsset(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        return cacheSuccessful(cache, request, response);
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Authenticated pages, login routes and API responses must always reach the network.
  if (event.request.mode === "navigate" || /^\/api(?:\/|$)/.test(url.pathname) || /^\/schedule\/login(?:\/|$)/.test(url.pathname)) return;

  if (ASSET_PATHS.indexOf(url.pathname) !== -1) {
    event.respondWith(cacheFirstAsset(event.request));
  }
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
