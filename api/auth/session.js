import {
  noStoreHeaders,
  readAuthEnvironment,
  readCookie,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "../../server/auth-session.js";

export async function GET(request) {
  const environment = readAuthEnvironment();
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const authenticated = Boolean(
    environment && token && (await verifySessionToken(token, environment.sessionSecret))
  );

  return Response.json(
    { authenticated },
    {
      status: authenticated ? 200 : 401,
      headers: noStoreHeaders(),
    },
  );
}
