const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const moduleUrl = (relativePath) => pathToFileURL(path.join(root, relativePath)).href;

const AUTH_ENV = {
  SCHEDULE_ADMIN_USERNAME: 'alexandra',
  SCHEDULE_ADMIN_PASSWORD_HASH: [
    'scrypt',
    '16384',
    '8',
    '1',
    Buffer.alloc(16, 7).toString('base64url'),
    Buffer.alloc(32, 11).toString('base64url'),
  ].join('$'),
  SCHEDULE_SESSION_SECRET: 'test-session-secret-'.repeat(4),
  SUPABASE_URL: 'https://unit-test.supabase.co',
  SUPABASE_SECRET_KEY: `sb_secret_${'a'.repeat(48)}`,
};

function localized(value) {
  return { ru: value, et: value, en: value };
}

function scheduleState(revision, suffix = '') {
  return {
    schemaVersion: 4,
    revision,
    timeZone: 'Europe/Tallinn',
    updatedAt: `2026-09-15T12:${String(revision).padStart(2, '0')}:00.000Z`,
    templates: [
      {
        id: `children-card${suffix}`,
        venue: 'sillamae',
        title: localized(`Children${suffix}`),
        audience: localized('Ages 6-16'),
        durationMinutes: 60,
      },
    ],
    sessions: [
      {
        id: `children-session${suffix}`,
        weekday: 1,
        recurrence: 'weekly',
        weekdays: [1, 3, 5],
        date: '',
        startsOn: '2026-09-14',
        endsOn: '',
        start: '17:00',
        end: '18:00',
        venue: 'sillamae',
        title: localized(`Children${suffix}`),
        audience: localized('Ages 6-16'),
        status: 'active',
      },
    ],
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function request(method, body, { cookie, origin = 'https://aleksi.test' } = {}) {
  const headers = new Headers({ origin });
  if (cookie) headers.set('cookie', cookie);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request('https://aleksi.test/api/schedule/state', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function installEnvironment() {
  const previous = {};
  Object.entries(AUTH_ENV).forEach(([key, value]) => {
    previous[key] = process.env[key];
    process.env[key] = value;
  });
  return () => {
    Object.keys(AUTH_ENV).forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  };
}

test('Supabase schedule API enforces its public-read/private-CAS-write contract', async (t) => {
  const restoreEnvironment = installEnvironment();
  const originalFetch = globalThis.fetch;

  try {
    const schema = await import(moduleUrl('server/schedule-schema.js'));
    const auth = await import(moduleUrl('server/auth-session.js'));
    const api = await import(moduleUrl('api/schedule/state.js'));

    const initial = scheduleState(7);
    assert.deepEqual(
      schema.validateScheduleState(initial),
      initial,
      'the server schema must accept the same complete v4 document as the browser store',
    );
    assert.throws(
      () => schema.validateScheduleState({ ...initial, unsupported: true }),
      schema.ScheduleValidationError,
      'unknown top-level fields must be rejected server-side',
    );

    const token = await auth.createSessionToken(AUTH_ENV.SCHEDULE_SESSION_SECRET);
    const cookie = `${auth.SESSION_COOKIE_NAME}=${token}`;

    await t.test('GET is public and returns the shared schedule without a cookie', async () => {
      const calls = [];
      globalThis.fetch = async (input, init = {}) => {
        calls.push({ input: String(input), init });
        return jsonResponse([{ id: 'main', state: initial, revision: initial.revision }]);
      };

      const response = await api.GET(request('GET'));
      const payload = await readJson(response);

      assert.equal(response.status, 200);
      assert.deepEqual(payload, { state: initial, revision: initial.revision });
      assert.equal(calls.length, 1);
      assert.match(calls[0].input, /^https:\/\/unit-test\.supabase\.co\/rest\/v1\//);
      assert.equal(new Headers(calls[0].init.headers).get('apikey'), AUTH_ENV.SUPABASE_SECRET_KEY);
      assert.equal(response.headers.get('cache-control')?.includes('no-store'), true);
    });

    await t.test('PUT without the HttpOnly session is rejected before storage access', async () => {
      let fetchCalls = 0;
      globalThis.fetch = async () => {
        fetchCalls += 1;
        throw new Error('storage must not be called');
      };

      const response = await api.PUT(request('PUT', {
        expectedRevision: initial.revision,
        state: scheduleState(initial.revision + 1, '-next'),
      }));

      assert.equal(response.status, 401);
      assert.equal(fetchCalls, 0);
    });

    await t.test('authenticated cross-origin PUT is rejected before storage access', async () => {
      let fetchCalls = 0;
      globalThis.fetch = async () => {
        fetchCalls += 1;
        throw new Error('storage must not be called');
      };

      const response = await api.PUT(request('PUT', {
        expectedRevision: initial.revision,
        state: scheduleState(initial.revision + 1, '-next'),
      }, { cookie, origin: 'https://attacker.example' }));

      assert.equal(response.status, 403);
      assert.equal(fetchCalls, 0);
    });

    await t.test('malformed schedule state is rejected before storage access', async () => {
      let fetchCalls = 0;
      globalThis.fetch = async () => {
        fetchCalls += 1;
        throw new Error('storage must not be called');
      };

      const response = await api.PUT(request('PUT', {
        expectedRevision: initial.revision,
        state: { ...scheduleState(initial.revision + 1), unsupported: true },
      }, { cookie }));

      assert.equal(response.status, 400);
      assert.equal(fetchCalls, 0);
    });

    await t.test('authenticated same-origin PUT saves through the atomic CAS endpoint', async () => {
      const next = scheduleState(initial.revision + 1, '-saved');
      const calls = [];
      globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        const method = String(init.method || 'GET').toUpperCase();
        calls.push({ url, method, init });

        if (url.includes('/rpc/compare_and_set_schedule_state') && method === 'POST') {
          const rpcBody = JSON.parse(String(init.body));
          assert.equal(rpcBody.p_expected_revision, initial.revision);
          assert.deepEqual(rpcBody.p_state, next);
          return jsonResponse([{
            applied: true,
            current_state: next,
            current_revision: next.revision,
          }]);
        }
        throw new Error(`Unexpected Supabase request: ${method} ${url}`);
      };

      const response = await api.PUT(request('PUT', {
        expectedRevision: initial.revision,
        state: next,
      }, { cookie }));
      const payload = await readJson(response);

      assert.equal(response.status, 200);
      assert.deepEqual(payload, { state: next, revision: next.revision });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'POST');
      assert.equal(response.headers.get('cache-control')?.includes('no-store'), true);
    });

    await t.test('a stale compare-and-set write becomes 409 with the current state', async () => {
      const current = scheduleState(9, '-current');
      const calls = [];
      globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        const method = String(init.method || 'GET').toUpperCase();
        calls.push({ url, method, init });

        if (method === 'GET') {
          return jsonResponse([{ id: 'main', state: current, revision: current.revision }]);
        }
        if (url.includes('/rpc/')) {
          return jsonResponse([{
            applied: false,
            current_state: current,
            current_revision: current.revision,
          }]);
        }
        if (method === 'PATCH') return jsonResponse([]);
        throw new Error(`Unexpected Supabase request: ${method} ${url}`);
      };

      const response = await api.PUT(request('PUT', {
        expectedRevision: initial.revision,
        state: scheduleState(initial.revision + 1, '-stale-write'),
      }, { cookie }));
      const payload = await readJson(response);

      assert.equal(response.status, 409);
      assert.equal(payload.error, 'revision_conflict');
      assert.deepEqual(payload.state, current);
      assert.equal(payload.revision, current.revision);
      assert.ok(calls.some((call) => call.method !== 'GET'), 'CAS must attempt an atomic write');
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});
