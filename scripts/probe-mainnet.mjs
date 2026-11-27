#!/usr/bin/env node
'use strict';

/**
 * Read-only Mainnet Contract / RPC / Aggregator Probe
 * Usage: node scripts/probe-mainnet.mjs
 * Strictly read-only: NEVER signs or broadcasts any transaction.
 */

const TIMEOUT_MS = 8000;

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const ms = Date.now() - t0;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: res.ok, status: res.status, ms, json, text };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: err && err.message ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function probeNearView(accountId, methodName, argsObj = {}) {
  const argsBase64 = Buffer.from(JSON.stringify(argsObj)).toString('base64');
  const r = await fetchJson('https://rpc.mainnet.near.org', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: accountId,
        method_name: methodName,
        args_base64: argsBase64
      }
    })
  });
  if (!r.ok || !r.json || r.json.error || !r.json.result || !Array.isArray(r.json.result.result)) {
    return { ok: false, status: r.status, ms: r.ms, detail: r.error || (r.json && r.json.error && r.json.error.message) || `HTTP ${r.status}` };
  }
  const decoded = Buffer.from(r.json.result.result).toString('utf8');
  return { ok: true, status: 200, ms: r.ms, detail: decoded.slice(0, 90) };
}

async function probeEvmRpc(name, url) {
  const r = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
  });
  return {
    name: `EVM RPC (${name})`,
    ok: r.ok && r.json && typeof r.json.result === 'string',
    ms: r.ms,
    detail: (r.json && r.json.result) || r.error || `HTTP ${r.status}`
  };
}

async function main() {
  const tasks = [
    // NEAR contracts
    probeNearView('orhea-conv.rhealab.near', 'storage_balance_bounds').then((r) => ({ name: 'NEAR orhea-conv storage_bounds', ...r })),
    probeNearView('orhea-conv.rhealab.near', 'get_conversion_strategy_infos').then((r) => ({ name: 'NEAR orhea-conv strategies', ...r })),
    probeNearView('token.rhealab.near', 'storage_balance_bounds').then((r) => ({ name: 'NEAR token.rhealab storage_bounds', ...r })),
    probeNearView('lst.rhealab.near', 'get_summary').then((r) => ({ name: 'NEAR lst.rhealab summary', ...r })),
    probeNearView('meta-pool.near', 'get_contract_state').then((r) => ({ name: 'NEAR meta-pool state', ...r })),
    probeNearView('linear-protocol.near', 'get_summary').then((r) => ({ name: 'NEAR linear summary', ...r })),
    probeNearView('contract.main.burrow.near', 'get_asset', { token_id: 'wrap.near' }).then((r) => ({ name: 'NEAR Burrow wrap.near', ...r })),
    probeNearView('v2.ref-finance.near', 'get_pool', { pool_id: 0 }).then((r) => ({ name: 'NEAR Ref v2 pool #0', ...r })),
    probeNearView('dclv2.ref-labs.near', 'get_metadata').then((r) => ({ name: 'NEAR DCL v2 metadata', ...r })),

    // Solana
    fetchJson('https://solana-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] })
    }).then((r) => ({ name: 'Solana RPC (publicnode)', ok: r.ok && Boolean(r.json?.result?.value?.blockhash), ms: r.ms, detail: r.json?.result?.value?.blockhash?.slice(0, 16) || r.error || `HTTP ${r.status}` })),
    fetchJson('https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50')
      .then((r) => ({ name: 'Jupiter Swap V1 Quote', ok: r.ok && Boolean(r.json?.outAmount), ms: r.ms, detail: r.json?.outAmount ? `out=${r.json.outAmount}` : (r.error || `HTTP ${r.status}`) })),
    fetchJson('https://api.marinade.finance/msol/apy/30d')
      .then((r) => ({ name: 'Marinade APY', ok: r.ok && Number.isFinite(Number(r.json?.value)), ms: r.ms, detail: r.json?.value ? `apy=${(Number(r.json.value) * 100).toFixed(2)}%` : (r.error || `HTTP ${r.status}`) })),

    // EVM RPCs
    probeEvmRpc('ETH', 'https://ethereum-rpc.publicnode.com'),
    probeEvmRpc('Base', 'https://base-rpc.publicnode.com'),
    probeEvmRpc('Arbitrum', 'https://arbitrum-one-rpc.publicnode.com'),
    probeEvmRpc('BSC', 'https://bsc-rpc.publicnode.com'),

    // Hyperliquid, BTC, Pearl, 1Click
    fetchJson('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    }).then((r) => ({ name: 'Hyperliquid metaAndAssetCtxs', ok: r.ok && Array.isArray(r.json) && r.json[0]?.universe?.length > 0, ms: r.ms, detail: `markets=${r.json?.[0]?.universe?.length || 0}` })),
    fetchJson('https://mempool.space/api/v1/fees/recommended')
      .then((r) => ({ name: 'Bitcoin mempool.space fees', ok: r.ok && Number.isFinite(r.json?.halfHourFee), ms: r.ms, detail: r.json?.halfHourFee ? `${r.json.halfHourFee} sat/vB` : (r.error || `HTTP ${r.status}`) })),
    fetchJson('https://blockbook.pearlresearch.ai/api/v2')
      .then((r) => ({ name: 'Pearl Blockbook API', ok: r.ok && Boolean(r.json?.blockbook), ms: r.ms, detail: `height=${r.json?.blockbook?.bestHeight || '?'}` })),
    fetchJson('https://1click.chaindefuser.com/v0/tokens')
      .then((r) => ({ name: '1Click Tokens API', ok: r.ok && Array.isArray(r.json) && r.json.length > 0, ms: r.ms, detail: `tokens=${r.json?.length || 0}` }))
  ];

  const results = await Promise.all(tasks);
  let pass = 0;
  let fail = 0;
  for (const row of results) {
    const tag = row.ok ? 'PASS' : 'FAIL';
    if (row.ok) pass += 1; else fail += 1;
    console.log(`[${tag}] ${row.name.padEnd(34)} ${String(row.ms).padStart(4)}ms | ${row.detail}`);
  }
  console.log(`\nSummary: ${pass}/${results.length} passed, ${fail} failed.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
