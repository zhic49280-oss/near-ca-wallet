// Shared test helpers (extracted from the former single near-ca-wallet.test.js)
﻿'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

// Load all 7 core modules in browser script order (each attaches cleanly to globalThis.NearCA* & module.exports)
const cryptoEngine = require('../src/crypto-engine.js');
const tokenRegistry = require('../src/token-registry.js');
const nearIntents = require('../src/near-intents.js');
const chainContracts = require('../src/chain-contracts.js');
const limitOrders = require('../src/limit-orders.js');
const hlPerps = require('../src/hyperliquid-perps.js');
const miningPro = require('../src/mining-pro.js');
const state = require('../src/state.js');
const uiController = require('../src/ui-controller.js');

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Helper to create a Response-like mock compatible with fetchJsonWithTimeout (.text) & fetchWithTimeout (.json)
function jsonResponse(body, status = 200, statusText = 'OK') {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => serialized,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body)
  };
}

async function withMockedFetch(handler, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options, calls);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function createMemoryStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, val) {
      store.set(String(key), String(val));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    _store: store
  };
}

async function withMockedStorage(initialEntries, fn) {
  const prevStorage = globalThis.localStorage;
  const storage = createMemoryStorage(initialEntries);
  globalThis.localStorage = storage;
  try {
    return await fn(storage);
  } finally {
    if (prevStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = prevStorage;
    }
  }
}

function readBorshString(buf, offset) {
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;
  return {
    value: buf.slice(start, end).toString('utf8'),
    nextOffset: end
  };
}

// Snapshot initial STAKING_POOLS state before any tests mutate it
const INITIAL_STAKING_SNAPSHOT = chainContracts.STAKING_POOLS.map((p) => ({
  id: p.id,
  apy: p.apy,
  rate: p.rate,
  tvlText: p.tvlText,
  stakersCount: p.stakersCount
}));

function createMockClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...cls) => cls.forEach((c) => set.add(c)),
    remove: (...cls) => cls.forEach((c) => set.delete(c)),
    toggle: (c, force) => {
      if (typeof force === 'boolean') {
        if (force) set.add(c);
        else set.delete(c);
        return force;
      }
      if (set.has(c)) { set.delete(c); return false; }
      set.add(c);
      return true;
    },
    contains: (c) => set.has(c),
    _set: set
  };
}

function createMockDomElement(id, extra = {}) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    className: '',
    disabled: false,
    style: {},
    attributes: {},
    classList: createMockClassList(extra.classes || []),
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    querySelectorAll() { return []; },
    ...extra
  };
}

module.exports = {
  test,
  assert,
  fs,
  path,
  nodeCrypto,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  nearIntents,
  chainContracts,
  limitOrders,
  hlPerps,
  miningPro,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  createMemoryStorage,
  withMockedStorage,
  readBorshString,
  INITIAL_STAKING_SNAPSHOT,
  createMockClassList,
  createMockDomElement
};
