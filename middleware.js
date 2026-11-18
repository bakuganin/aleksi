import { next } from "@vercel/functions";

import {
  noStoreHeaders,
  readAuthEnvironment,
  readCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "./server/auth-session.js";

const EDITOR_ROUTES = new Map([
  ["/schedule", "ru"],
  ["/schedule/index.html", "ru"],
  ["/schedule/et", "et"],
  ["/schedule/et/index.html", "et"],
  ["/schedule/en", "en"],
  ["/schedule/en/index.html", "en"],
]);

export const config = {
  matcher: [
    "/schedule",
    "/schedule/",
    "/schedule/index.html",
    "/schedule/et",
    "/schedule/et/",
    "/schedule/et/index.html",
    "/schedule/en",
    "/schedule/en/",
    "/schedule/en/index.html",
  ],
};

function normalizedPathname(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function loginRedirect(request, language) {
  const requestedUrl = new URL(request.url);
  const loginUrl = new URL("/schedule/login/", requestedUrl.origin);
  loginUrl.searchParams.set("lang", language);
  loginUrl.searchParams.set("next", `${requestedUrl.pathname}${requestedUrl.search}`);

  return new Response(null, {
    status: 303,
    headers: noStoreHeaders({
      Location: loginUrl.toString(),
      Vary: "Cookie",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    }),
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const language = EDITOR_ROUTES.get(normalizedPathname(url.pathname));
  if (!language) return next();

  const environment = readAuthEnvironment();
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const authenticated = Boolean(
    environment && token && (await verifySessionToken(token, environment.sessionSecret))
  );

  if (!authenticated) return loginRedirect(request, language);

  return next({
    headers: noStoreHeaders({
      Vary: "Cookie",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    }),
  });
}
