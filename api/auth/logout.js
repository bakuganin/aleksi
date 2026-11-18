import {
  clearSessionCookie,
  isSecureRequest,
  noStoreHeaders,
} from "../../server/auth-session.js";

function requestIsSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function POST(request) {
  if (!requestIsSameOrigin(request)) {
    return Response.json(
      { ok: false, error: "Request rejected" },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: noStoreHeaders({
        "Set-Cookie": clearSessionCookie(isSecureRequest(request)),
      }),
    },
  );
}
