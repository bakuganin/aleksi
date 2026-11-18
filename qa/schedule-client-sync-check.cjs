#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'schedule-data.js'), 'utf8');
const STORAGE_KEY = 'aleksi.schedule.v1';
const SYNC_KEY = 'aleksi.schedule.sync.v1';
const MIGRATION_KEY = 'aleksi.schedule.migration.v1';

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    api: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
    },
  };
}

function createBackend(initialState, initialRevision) {
  let state = plain(initialState);
  let revision = initialRevision;
  let authorized = true;
  let failNextGet = false;
  let holdNextGet = false;
  let getRelease = null;
  let getStartedResolve = null;
  let dropNextPutResponse = false;
  let putRelease = null;
  let putStartedResolve = null;
  let putStarted = null;
  const requests = [];

  return {
    requests,
    get state() { return plain(state); },
    get revision() { return revision; },
    setAuthorized(value) { authorized = Boolean(value); },
    failOneGet() { failNextGet = true; },
    holdOneGet() {
      holdNextGet = true;
      const started = new Promise((resolve) => { getStartedResolve = resolve; });
      return {
        started,
        release() {
          if (getRelease) getRelease();
        },
      };
    },
    dropOnePutAfterApply() { dropNextPutResponse = true; },
    holdDroppedPut() {
      putStarted = new Promise((resolve) => { putStartedResolve = resolve; });
      return {
        started: putStarted,
        release() {
          if (putRelease) putRelease();
        },
      };
    },
    async fetch(_url, options) {
      requests.push({ method: options.method, body: options.body || '' });
      if (options.method === 'GET') {
        if (failNextGet) {
          failNextGet = false;
          throw new TypeError('offline');
        }
        if (holdNextGet) {
          holdNextGet = false;
          if (getStartedResolve) getStartedResolve();
          await new Promise((resolve) => { getRelease = resolve; });
          getStartedResolve = null;
          getRelease = null;
        }
        return response(200, { state, revision });
      }

      const body = JSON.parse(options.body);
      if (!authorized) return response(401, { error: 'Authentication required' });
      if (body.expectedRevision !== revision) {
        return response(409, { error: 'Revision conflict', state, revision });
      }

      state = plain(body.state);
      revision += 1;
      if (dropNextPutResponse) {
        dropNextPutResponse = false;
        if (putStartedResolve) putStartedResolve();
        if (putStarted) {
          await new Promise((resolve) => { putRelease = resolve; });
          putStarted = null;
          putStartedResolve = null;
          putRelease = null;
        }
        throw new TypeError('response lost');
      }
      return response(200, { state, revision });
    },
  };
}

function boot({ storage, backend, pathname = '/schedule/' }) {
  const eventListeners = new Map();
  const window = {
    location: { pathname },
    localStorage: storage.api,
    addEventListener(type, listener) {
      const listeners = eventListeners.get(type) || [];
      listeners.push(listener);
      eventListeners.set(type, listeners);
    },
    dispatchEvent() {},
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
  };
  if (backend) window.fetch = backend.fetch.bind(backend);
  const sandbox = {
    window,
    CustomEvent: window.CustomEvent,
    document: {},
    console,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Error,
    RegExp,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, sandbox, { filename: 'schedule-data.js' });
  return { store: window.DzhikaevaSchedule, eventListeners };
}

const seedStorage = createStorage();
const defaults = plain(boot({ storage: seedStorage, backend: null, pathname: '/' }).store.getDefaults());

function schedule(label, revision = 1) {
  const value = plain(defaults);
  value.revision = revision;
  value.updatedAt = `2026-09-${String(Math.max(1, Math.min(28, revision))).padStart(2, '0')}T08:00:00.000Z`;
  value.templates[0].title = { ru: label, et: label, en: label };
  return value;
}

function syncMeta(remoteRevision, pending, conflict = false, migration = false) {
  return JSON.stringify({
    remoteRevision,
    pending,
    conflict,
    migration,
    lastSyncedAt: '',
  });
}

function putRequests(backend) {
  return backend.requests.filter((request) => request.method === 'PUT');
}

test('pending base 3 versus different remote 4 becomes conflict without PUT', async () => {
  const local = schedule('offline local', 2);
  const remote = schedule('new remote', 3);
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(local),
    [SYNC_KEY]: syncMeta(3, true),
  });
  const backend = createBackend(remote, 4);
  const { store } = boot({ storage, backend });

  await store.ready;
  await Promise.resolve();

  assert.equal(store.getSyncState().status, 'conflict');
  assert.equal(store.getSyncState().pending, true);
  assert.equal(putRequests(backend).length, 0);
  assert.equal(store.getState().templates[0].title.en, 'offline local');
});

test('a persisted conflict remains blocked after reload', async () => {
  const local = schedule('stale local', 2);
  const remote = schedule('current remote', 3);
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(local),
    [SYNC_KEY]: syncMeta(3, true),
  });
  const backend = createBackend(remote, 4);
  const first = boot({ storage, backend }).store;
  await first.ready;
  assert.equal(first.getSyncState().status, 'conflict');

  const reloaded = boot({ storage, backend, pathname: '/schedule/et/' }).store;
  await reloaded.ready;
  await assert.rejects(reloaded.flush(), (error) => error.code === 'SCHEDULE_SYNC_CONFLICT');

  assert.equal(reloaded.getSyncState().status, 'conflict');
  assert.equal(reloaded.getState().templates[0].title.en, 'stale local');
  assert.equal(putRequests(backend).length, 0);
});

test('retry fetches the remote snapshot when persisted conflict startup was offline', async () => {
  const local = schedule('offline conflict local', 2);
  const remote = schedule('offline conflict remote', 3);
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(local),
    [SYNC_KEY]: syncMeta(3, true, true),
  });
  const backend = createBackend(remote, 4);
  backend.failOneGet();
  const { store } = boot({ storage, backend });
  await store.ready;
  assert.equal(store.getSyncState().status, 'offline');

  await store.retrySync();

  assert.equal(store.getSyncState().status, 'conflict');
  assert.equal(store.getSyncState().pending, true);
  assert.equal(store.getState().templates[0].title.en, 'offline conflict local');
  assert.equal(putRequests(backend).length, 0);
});

test('pending state already present remotely is accepted as synced', async () => {
  const local = schedule('already saved', 2);
  const remote = plain(local);
  remote.revision = 3;
  remote.updatedAt = '2026-09-15T09:00:00.000Z';
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(local),
    [SYNC_KEY]: syncMeta(3, true),
  });
  const backend = createBackend(remote, 4);
  const { store } = boot({ storage, backend });

  await store.ready;

  assert.equal(store.getSyncState().status, 'synced');
  assert.equal(store.getSyncState().pending, false);
  assert.equal(store.getSyncState().remoteRevision, 4);
  assert.equal(putRequests(backend).length, 0);
});

test('fresh editor storage accepts a customized cloud schedule without PUT', async () => {
  const remote = schedule('custom cloud', 5);
  const storage = createStorage();
  const backend = createBackend(remote, 14);
  const { store } = boot({ storage, backend, pathname: '/schedule/' });

  await store.ready;

  assert.equal(store.getSyncState().status, 'synced');
  assert.equal(store.getState().templates[0].title.en, 'custom cloud');
  assert.equal(storage.values.has(MIGRATION_KEY), false);
  assert.equal(putRequests(backend).length, 0);
});

test('pending state saves once when its known base still matches', async () => {
  const local = schedule('safe pending edit', 2);
  const remote = schedule('base', 1);
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(local),
    [SYNC_KEY]: syncMeta(3, true),
  });
  const backend = createBackend(remote, 3);
  const { store } = boot({ storage, backend });

  await store.ready;
  await store.flush();

  assert.equal(store.getSyncState().status, 'synced');
  assert.equal(putRequests(backend).length, 1);
  assert.equal(JSON.parse(putRequests(backend)[0].body).expectedRevision, 3);
  assert.equal(backend.state.templates[0].title.en, 'safe pending edit');
});

test('unknown base after offline load requires explicit conflict resolution', async () => {
  const remote = schedule('cloud while offline', 3);
  const storage = createStorage();
  const backend = createBackend(remote, 8);
  backend.failOneGet();
  const { store } = boot({ storage, backend });
  await store.ready;

  const card = store.getTemplates()[0];
  card.title = { ru: 'offline edit', et: 'offline edit', en: 'offline edit' };
  store.upsertTemplate(card);
  await assert.rejects(store.flush(), (error) => error.code === 'SCHEDULE_SYNC_CONFLICT');

  assert.equal(store.getSyncState().status, 'conflict');
  assert.equal(putRequests(backend).length, 0);
  assert.equal(store.getState().templates[0].title.en, 'offline edit');
});

test('an edit made before initial GET completes cannot overwrite unknown cloud state', async () => {
  const remote = schedule('pre-ready cloud', 6);
  const storage = createStorage();
  const backend = createBackend(remote, 18);
  const held = backend.holdOneGet();
  const { store } = boot({ storage, backend });

  const card = store.getTemplates()[0];
  card.title = { ru: 'pre-ready edit', et: 'pre-ready edit', en: 'pre-ready edit' };
  store.upsertTemplate(card);
  await held.started;
  held.release();
  await store.ready;

  assert.equal(store.getSyncState().status, 'conflict');
  assert.equal(store.getState().templates[0].title.en, 'pre-ready edit');
  assert.equal(putRequests(backend).length, 0);
});

test('retry after an initial GET failure fetches the shared schedule', async () => {
  const remote = schedule('available again', 4);
  const storage = createStorage();
  const backend = createBackend(remote, 12);
  backend.failOneGet();
  const { store } = boot({ storage, backend, pathname: '/calendar/' });

  await store.ready;
  assert.equal(store.getSyncState().status, 'offline');
  await store.retrySync();

  assert.equal(store.getSyncState().status, 'synced');
  assert.equal(store.getState().templates[0].title.en, 'available again');
  assert.equal(putRequests(backend).length, 0);
});

test('an edit made during refresh is retained and becomes an explicit conflict', async () => {
  const base = schedule('refresh base', 3);
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(base),
    [SYNC_KEY]: syncMeta(6, false),
  });
  const backend = createBackend(base, 6);
  const { store } = boot({ storage, backend, pathname: '/calendar/' });
  await store.ready;

  const held = backend.holdOneGet();
  const refreshing = store.refresh();
  await held.started;
  const card = store.getTemplates()[0];
  card.title = { ru: 'edit during refresh', et: 'edit during refresh', en: 'edit during refresh' };
  store.upsertTemplate(card);
  held.release();
  await refreshing;

  assert.equal(store.getState().templates[0].title.en, 'edit during refresh');
  assert.equal(store.getSyncState().status, 'conflict');
  assert.equal(putRequests(backend).length, 0);
});

test('lost response followed by a newer local edit advances safely without false conflict', async () => {
  const base = schedule('base', 3);
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(base),
    [SYNC_KEY]: syncMeta(3, false),
  });
  const backend = createBackend(base, 3);
  const { store } = boot({ storage, backend });
  await store.ready;

  backend.dropOnePutAfterApply();
  const held = backend.holdDroppedPut();
  const first = store.getTemplates()[0];
  first.title = { ru: 'first edit', et: 'first edit', en: 'first edit' };
  store.upsertTemplate(first);
  const failedSave = store.flush();
  await held.started;

  const second = store.getTemplates()[0];
  second.title = { ru: 'newer edit', et: 'newer edit', en: 'newer edit' };
  store.upsertTemplate(second);
  held.release();
  await assert.rejects(failedSave, /response lost/);
  await store.flush();

  assert.equal(store.getSyncState().status, 'synced');
  assert.equal(store.getSyncState().conflict, false);
  assert.equal(backend.state.templates[0].title.en, 'newer edit');
  assert.equal(putRequests(backend).length, 3);
});

test('public legacy backup never PUTs even with live auth and editor requires an explicit choice', async () => {
  const legacy = schedule('legacy local', 2);
  const remote = schedule('shared cloud', 3);
  const storage = createStorage({ [STORAGE_KEY]: JSON.stringify(legacy) });
  const backend = createBackend(remote, 5);

  const publicStore = boot({ storage, backend, pathname: '/' }).store;
  await publicStore.ready;
  await Promise.resolve();

  assert.equal(putRequests(backend).length, 0, 'public pages must never upload legacy state');
  assert.equal(publicStore.getState().templates[0].title.en, 'shared cloud');
  assert.equal(JSON.parse(storage.values.get(MIGRATION_KEY)).templates[0].title.en, 'legacy local');

  const editorStore = boot({ storage, backend, pathname: '/schedule/en/index.html' }).store;
  await editorStore.ready;

  assert.equal(editorStore.getSyncState().status, 'conflict');
  assert.equal(editorStore.getState().templates[0].title.en, 'legacy local');
  assert.equal(putRequests(backend).length, 0);
  await editorStore.resolveConflict('local');

  assert.equal(putRequests(backend).length, 1);
  assert.equal(backend.state.templates[0].title.en, 'legacy local');
  assert.equal(storage.values.has(MIGRATION_KEY), false, 'resolved migration backup must be cleared');

  const reloaded = boot({ storage, backend, pathname: '/schedule/' }).store;
  await reloaded.ready;
  assert.equal(reloaded.getSyncState().status, 'synced');
  assert.equal(putRequests(backend).length, 1, 'cleared backup must not resurrect after reload');
});

test('two active tabs retain independent state and CAS rejects the stale tab', async () => {
  const base = schedule('shared base', 3);
  const backend = createBackend(base, 9);
  const storageA = createStorage({
    [STORAGE_KEY]: JSON.stringify(base),
    [SYNC_KEY]: syncMeta(9, false),
  });
  const storageB = createStorage({
    [STORAGE_KEY]: JSON.stringify(base),
    [SYNC_KEY]: syncMeta(9, false),
  });
  const tabA = boot({ storage: storageA, backend }).store;
  const tabB = boot({ storage: storageB, backend }).store;
  await Promise.all([tabA.ready, tabB.ready]);

  const cardA = tabA.getTemplates()[0];
  cardA.title = { ru: 'tab A edit', et: 'tab A edit', en: 'tab A edit' };
  tabA.upsertTemplate(cardA);
  const cardB = tabB.getTemplates()[0];
  cardB.title = { ru: 'tab B edit', et: 'tab B edit', en: 'tab B edit' };
  tabB.upsertTemplate(cardB);
  await tabA.flush();
  await assert.rejects(tabB.flush(), (error) => error.code === 'SCHEDULE_SYNC_CONFLICT');

  assert.equal(backend.state.templates[0].title.en, 'tab A edit');
  assert.equal(tabB.getState().templates[0].title.en, 'tab B edit');
  assert.equal(tabB.getSyncState().status, 'conflict');
});
