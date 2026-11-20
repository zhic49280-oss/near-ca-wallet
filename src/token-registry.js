/**
 * NEAR Chain Abstraction Wallet - Authoritative Token & Chain Icon Registry
 * Multi-CDN icon resolution (TrustWallet Assets, CoinGecko, Solana/Jupiter, cryptocurrency-icons)
 * with iridescent Pearl SVG, 14px chain corner badges, and zero hardcoded fake prices.
 * Attaches to globalThis.NearCATokens, window.NearCATokens, and module.exports.
 */
(function (root) {
  'use strict';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const QTC_OFFICIAL_ICON_URL =
    'https://static.datapi.jup.ag/token-icons/0d58709eb553999608b6d798b17018d4974eb86a3eaa68a4f05614056fb9e9bd.webp';

  function sanitizeImageUrl(url) {
    const clean = String(url || '').trim();
    if (!clean) return '';
    if (/^https?:\/\/[^\s"'<>]+$/i.test(clean)) return clean;

    if (/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(clean)) {
      const compact = clean.replace(/\s+/g, '');
      if (compact.includes('R0lGODlhAQABAIAAAAAAAP')) return '';
      if (/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=_-]+$/i.test(compact)) {
        if (/^data:image\/svg\+xml;base64,/i.test(compact)) {
          try {
            const b64 = compact.slice(compact.indexOf(',') + 1);
            const decoded = typeof atob === 'function'
              ? atob(b64)
              : (typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : '');
            if (/<script|\bon\w+\s*=|javascript:|<iframe|<object|<foreignObject/i.test(decoded)) return '';
          } catch (_) {
            return '';
          }
        }
        return compact;
      }
      return '';
    }

    if (/^data:image\/svg\+xml[;,]/i.test(clean)) {
      let decoded = clean;
      try {
        decoded = decodeURIComponent(clean);
      } catch (_) {}
      const xssRe = /<script|\bon\w+\s*=|javascript:|<iframe|<object|<foreignObject/i;
      if (xssRe.test(clean) || xssRe.test(decoded)) return '';
      const commaIdx = clean.indexOf(',');
      if (commaIdx < 0) return '';
      const body = clean.slice(commaIdx + 1).trim();
      if (!body) return '';
      if (/[<>"'#\r\n]/.test(body)) {
        const safeBody = body
          .replace(/[\r\n]+/g, ' ')
          .replace(/"/g, '%22')
          .replace(/'/g, '%27')
          .replace(/</g, '%3C')
          .replace(/>/g, '%3E')
          .replace(/#/g, '%23');
        return `data:image/svg+xml;utf8,${safeBody}`;
      }
      return `data:image/svg+xml;utf8,${body}`;
    }

    return '';
  }

  // ======================== Zero-GFW-Block On-Chain & Inline SVG Icons ========================

  const ICON_NEAR_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2300EC97'/%3E%3Cpath d='M21.4 9.2l-3.9 5.8c-.3.4.2.9.6.5l3.8-3.1c.1-.1.3 0 .3.2v7.2c0 .2-.2.3-.3.1l-9.9-11.8c-.5-.6-1.2-.9-2-.9h-.6c-1.4 0-2.5 1.1-2.5 2.5v12.8c0 1.4 1.1 2.5 2.5 2.5.9 0 1.7-.5 2.2-1.2l3.9-5.8c.3-.4-.2-.9-.6-.5l-3.8 3.1c-.1.1-.3 0-.3-.2v-7.2c0-.2.2-.3.3-.1l9.9 11.8c.5.6 1.2.9 2 .9h.6c1.4 0 2.5-1.1 2.5-2.5V10.5c0-1.4-1.1-2.5-2.5-2.5-.9 0-1.7.5-2.2 1.2z' fill='%23000'/%3E%3C/svg%3E";
  const ICON_ETH_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23627EEA'/%3E%3Cpath d='M16.4 5v8.2l6.9 3.1L16.4 5z' fill='%23fff' fill-opacity='.6'/%3E%3Cpath d='M16.4 5L9.5 16.3l6.9-3.1V5z' fill='%23fff'/%3E%3Cpath d='M16.4 21.5V27l6.9-9.6-6.9 4.1z' fill='%23fff' fill-opacity='.6'/%3E%3Cpath d='M16.4 27v-5.5l-6.9-4.1L16.4 27z' fill='%23fff'/%3E%3Cpath d='M16.4 20.2l6.9-4-6.9-3v7z' fill='%23fff' fill-opacity='.2'/%3E%3Cpath d='M9.5 16.2l6.9 4v-7l-6.9 3z' fill='%23fff' fill-opacity='.6'/%3E%3C/svg%3E";
  const ICON_STETH_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2300A3FF'/%3E%3Cpath d='M16 6l-5.5 8.5L16 17.8l5.5-3.3L16 6z' fill='%23fff'/%3E%3Cpath d='M16 19.3l-6.2-3.7c-1 2.2-.3 5.2 1.7 7.1 2.5 2.3 6.5 2.3 9 0 2-1.9 2.7-4.9 1.7-7.1L16 19.3z' fill='%23fff' fill-opacity='.85'/%3E%3C/svg%3E";
  const ICON_SUSDE_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23111827'/%3E%3Ccircle cx='16' cy='16' r='14.5' fill='none' stroke='%2338BDF8' stroke-width='1.5'/%3E%3Cpath d='M10 11h12v2.4H12.8v1.8h7.4v2.2h-7.4v1.8H22V21.5H10V11z' fill='%23fff'/%3E%3C/svg%3E";
  const ICON_KHYPE_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23072723'/%3E%3Cpath d='M22 16c0 3.3-1.8 5.2-3.8 5.2-1.7 0-2.5-1.3-3.2-2.7-.5-1-.9-1.7-1.6-1.7-.9 0-1.4 1.1-1.4 2.6 0 1.4.4 2.4.4 2.4H9.6s-.6-1.1-.6-3c0-3.1 1.6-5.6 4.1-5.6 1.8 0 2.6 1.3 3.2 2.6.5 1 .9 1.8 1.7 1.8.9 0 1.4-1 1.4-2.4 0-1.3-.4-2.2-.4-2.2h2.7s.3 1.1.3 3z' fill='%2397FCE4'/%3E%3C/svg%3E";
  const ICON_JUP_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='jg' x1='0' y1='0' x2='32' y2='32' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23C7F284'/%3E%3Cstop offset='1' stop-color='%2300BEF0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='16' fill='%230D1B2A'/%3E%3Cpath d='M8.5 12.5c4.5-3.2 10.5-3.2 15 0M7.2 16.5c5.4-3.3 12.2-3.3 17.6 0M9.2 20.5c4-2.4 9.6-2.4 13.6 0' stroke='url(%23jg)' stroke-width='2.4' stroke-linecap='round' fill='none'/%3E%3C/svg%3E";
  const ICON_MSOL_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23183B37'/%3E%3Cpath d='M9 21V11l7 6.5L23 11v10' stroke='%2343D9A3' stroke-width='2.8' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E";
  const ICON_INF_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%231E1B4B'/%3E%3Cpath d='M11.5 19.5c-2 0-3.5-1.5-3.5-3.5s1.5-3.5 3.5-3.5c2.2 0 4.5 3.5 4.5 3.5s2.3-3.5 4.5-3.5c2 0 3.5 1.5 3.5 3.5s-1.5 3.5-3.5 3.5c-2.2 0-4.5-3.5-4.5-3.5s-2.3 3.5-4.5 3.5z' stroke='%23A78BFA' stroke-width='2.4' fill='none'/%3E%3C/svg%3E";
  const ICON_USDT_DATA =
    "data:image/svg+xml;utf8,%3Csvg width='111' height='90' viewBox='0 0 111 90' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M24.4825 0.862305H88.0496C89.5663 0.862305 90.9675 1.64827 91.7239 2.92338L110.244 34.1419C111.204 35.7609 110.919 37.8043 109.549 39.1171L58.5729 87.9703C56.9216 89.5528 54.2652 89.5528 52.6139 87.9703L1.70699 39.1831C0.305262 37.8398 0.0427812 35.7367 1.07354 34.1077L20.8696 2.82322C21.6406 1.60483 23.0087 0.862305 24.4825 0.862305ZM79.8419 14.8003V23.5597H61.7343V29.6329C74.4518 30.2819 83.9934 32.9475 84.0642 36.1425L84.0638 42.803C83.993 45.998 74.4518 48.6635 61.7343 49.3125V64.2168H49.7105V49.3125C36.9929 48.6635 27.4513 45.998 27.3805 42.803L27.381 36.1425C27.4517 32.9475 36.9929 30.2819 49.7105 29.6329V23.5597H31.6028V14.8003H79.8419ZM55.7224 44.7367C69.2943 44.7367 80.6382 42.4827 83.4143 39.4727C81.0601 36.9202 72.5448 34.9114 61.7343 34.3597V40.7183C59.7966 40.8172 57.7852 40.8693 55.7224 40.8693C53.6595 40.8693 51.6481 40.8172 49.7105 40.7183V34.3597C38.8999 34.9114 30.3846 36.9202 28.0304 39.4727C30.8066 42.4827 42.1504 44.7367 55.7224 44.7367Z' fill='%23009393'/%3E%3C/svg%3E";
  const ICON_USDC_DATA =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Ccircle cx='128' cy='128' r='128' fill='%232775CA'/%3E%3Cpath fill='%23FFFFFF' d='M104,217c0,3-2.4,4.7-5.2,3.8C60,208.4,32,172.2,32,129.3c0-42.8,28-79.1,66.8-91.5c2.9-0.9,5.2,0.8,5.2,3.8v7.5c0,2-1.5,4.3-3.4,5C69.9,65.4,48,94.9,48,129.3c0,34.5,21.9,63.9,52.6,75.1c1.9,0.7,3.4,3,3.4,5V217z'/%3E%3Cpath fill='%23FFFFFF' d='M136,189.3c0,2.2-1.8,4-4,4h-8c-2.2,0-4-1.8-4-4v-12.6c-17.5-2.4-26-12.1-28.3-25.5c-0.4-2.3,1.4-4.3,3.7-4.3h9.1c1.9,0,3.5,1.4,3.9,3.2c1.7,7.9,6.3,14,20.3,14c10.3,0,17.7-5.8,17.7-14.4c0-8.6-4.3-11.9-19.5-14.4c-22.4-3-33-9.8-33-27.3c0-13.5,10.3-24.1,26.1-26.3V69.3c0-2.2,1.8-4,4-4h8c2.2,0,4,1.8,4,4v12.7c12.9,2.3,21.1,9.6,23.8,21.8c0.5,2.3-1.3,4.4-3.7,4.4h-8.4c-1.8,0-3.3-1.2-3.8-2.9c-2.3-7.7-7.8-11.1-17.4-11.1c-10.6,0-16.1,5.1-16.1,12.3c0,7.6,3.1,11.4,19.4,13.7c22,3,33.4,9.3,33.4,28c0,14.2-10.6,25.7-27.1,28.3V189.3z'/%3E%3Cpath fill='%23FFFFFF' d='M157.2,220.8c-2.9,0.9-5.2-0.8-5.2-3.8v-7.5c0-2.2,1.3-4.3,3.4-5c30.6-11.2,52.6-40.7,52.6-75.1c0-34.5-21.9-63.9-52.6-75.1c-1.9-0.7-3.4-3-3.4-5v-7.5c0-3,2.4-4.7,5.2-3.8C196,50.2,224,86.5,224,129.3C224,172.2,196,208.4,157.2,220.8z'/%3E%3C/svg%3E";
  const ICON_RNEAR_DATA =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzIwMjE2XzIyNzQpIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTUuNSIgZmlsbD0iYmxhY2siIHN0cm9rZT0iIzRDNEM0QyIvPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTEwLjY1NTEgMTEuOTg3MlYyMC4wOTY4TDE0LjY3MTcgMTYuOTk4NEwxNS4wNzMzIDE3LjM2MjFMMTEuNzA1MiAyMi4yNTk5QzEwLjQ1MzcgMjMuNDQ1MiA4LjI0NTEyIDIyLjY0MzIgOC4yNDUxMiAyMS4wMDM1VjEwLjk5MDhDOC4yNDUxMiA5LjI5NDg4IDEwLjU4MyA4LjUyMjM3IDExLjc4OTYgOS44MTk2M0wyMS4wOTgzIDE5LjgyNzdWMTIuMDUwOUwxNy40ODMzIDE0LjgxNjVMMTcuMDgxNyAxNC40NTI5TDE5Ljk0NjUgOS44ODA5MkMyMS4xNDIyIDguNTU5NjMgMjMuNTA4MiA5LjMyNTE0IDIzLjUwODIgMTEuMDMzM1YyMC44MjQxQzIzLjUwODIgMjIuNTIwMSAyMS4xNzA0IDIzLjI5MjYgMTkuOTYzNyAyMS45OTUzTDEwLjY1NTEgMTEuOTg3MloiIGZpbGw9IiMwMEY3QTUiLz4KPC9nPgo8ZGVmcz4KPGNsaXBQYXRoIGlkPSJjbGlwMF8yMDIxNl8yMjc0Ij4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPgo=';
  const ICON_XRHEA_DATA =
    'data:image/png;base64,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';
  const ICON_ORHEA_DATA =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzIxNDcyXzc0MjIpIj4KPHBhdGggZD0iTTEwIDAuMzQ5NjA5QzE1LjMyOTYgMC4zNDk2MDkgMTkuNjUwNCA0LjY3MDQ1IDE5LjY1MDQgMTBDMTkuNjUwNCAxNS4zMjk1IDE1LjMyOTYgMTkuNjUwNCAxMCAxOS42NTA0QzQuNjcwNDUgMTkuNjUwNCAwLjM0OTYwOSAxNS4zMjk1IDAuMzQ5NjA5IDEwQzAuMzQ5NjA5IDQuNjcwNDYgNC42NzA0NSAwLjM0OTYyMiAxMCAwLjM0OTYwOVoiIGZpbGw9IiMwOTEyMUEiIHN0cm9rZT0iIzRDNEM0QyIgc3Ryb2tlLXdpZHRoPSIwLjciLz4KPHBhdGggZD0iTTEwLjEwNjQgMTUuNDYwOUwxMS4zODY3IDE2LjUyNjRMMTEuMDUzNyAxNi44MTI1TDEwLjA3ODEgMTUuNDk5TDkuMTAzNTIgMTYuODEyNUw4Ljc3MDUxIDE2LjUyNjRMMTAuMDQ5OCAxNS40NjA5TDkuOTU3MDMgMTUuMzM1OUwxMC4wNzgxIDE1LjQzNjVMMTAuMjAwMiAxNS4zMzU5TDEwLjEwNjQgMTUuNDYwOVpNNy41MzIyMyAxMy40MzE2QzguOTQzMjMgMTMuODEyNiA5LjcwOTM5IDE0LjgyODYgOS45MTYwMiAxNS4yODkxQzkuODkxNDUgMTUuMjg0MyA5Ljg2NzIzIDE1LjI3NjkgOS44NDI3NyAxNS4yNzE1QzguODg4NTEgMTUuOTkyNyA3LjQxMTc0IDE2LjA4NDQgNi44OTE2IDE1LjgxNTRDNy45MDg3NCAxNS4xNDM1IDguOTYwNjcgMTUuMTAyMyA5LjU2MTUyIDE1LjE5MzRDOC41MjkwMSAxNC44NDkxIDcuNjYwNzQgMTMuOTQ1MiA3LjUzMjIzIDEzLjQzMTZaTTEyLjYyODkgMTMuNDMxNkMxMi41MDAxIDEzLjk0NjQgMTEuNjI3NSAxNC44NTI4IDEwLjU5MTggMTUuMTk1M0MxMS4xOTAxIDE1LjEwMTQgMTIuMjUwOSAxNS4xMzggMTMuMjc2NCAxNS44MTU0QzEyLjc1NTkgMTYuMDg0NiAxMS4yNzc0IDE1Ljk5MjkgMTAuMzIzMiAxNS4yNzA1QzEwLjI5NzEgMTUuMjc2NCAxMC4yNzE0IDE1LjI4NCAxMC4yNDUxIDE1LjI4OTFDMTAuNDUxOSAxNC44Mjg2IDExLjIxOCAxMy44MTI2IDEyLjYyODkgMTMuNDMxNlpNMTEuNzE2OCAxNC44NDQ3QzEyLjAzNDkgMTQuNjgwNSAxMy4wODE4IDE0LjQyMTYgMTMuODkyNiAxNC45Mjc3QzEzLjU2MDkgMTUuMTgxNiAxMi40NzM0IDE1LjIzOSAxMS43MTY4IDE0Ljg0NDdaTTUuOTQxNDEgMTQuOTA3MkM2LjgwOTk0IDE0LjM2NDkgNy45MzE5MiAxNC42NDE1IDguMjcyNDYgMTQuODE3NEM3LjQ2MjE3IDE1LjIzOTggNi4yOTY5MyAxNS4xNzkxIDUuOTQxNDEgMTQuOTA3MlpNMy45MDYyNSAxMy44MzVDNC4zMzQzOCAxMy42NjE3IDUuODM2NDMgMTMuMzc1NiA2Ljk0NTMxIDE0LjM1MTZDNi42NTIyOCAxNC41Mzg2IDQuNzA3MjcgMTQuNTQgMy45MDYyNSAxMy44MzVaTTEzLjIxNDggMTQuMzUxNkMxNC4zMjM3IDEzLjM3NTYgMTUuODI1NyAxMy42NjE3IDE2LjI1MzkgMTMuODM1QzE1LjQ1MjUgMTQuNTQgMTMuNTA2OSAxNC41Mzg3IDEzLjIxNDggMTQuMzUxNlpNNS44MTkzNCAxMS43Njc2QzYuMjMyOTEgMTEuOTc0NCA3LjQzOTM4IDEyLjkxMDkgNy40Mzk0NSAxNC4zODY3QzcuMTA1MyAxNC4yOTA3IDUuODE5NDggMTIuODM0MSA1LjgxOTM0IDExLjc2NzZaTTE0LjM1MTYgMTEuNzY3NkMxNC4zNTE0IDEyLjgzNDQgMTMuMDY0MiAxNC4yOTE1IDEyLjczMDUgMTQuMzg2N0MxMi43MzA1IDEyLjkxMDUgMTMuOTM4MyAxMS45NzQxIDE0LjM1MTYgMTEuNzY3NlpNMy45MDYyNSAxMi4xMjIxQzQuMzY4MTMgMTIuMTE3NCA1Ljg3MDcgMTIuNDAwMiA2LjU0NDkyIDEzLjcxMzlDNi4yMDQwOCAxMy43ODA5IDQuMzkzNDIgMTMuMDcxMiAzLjkwNjI1IDEyLjEyMjFaTTE2LjI1MzkgMTIuMTIyMUMxNS43NjY1IDEzLjA3MTMgMTMuOTU1NiAxMy43ODEyIDEzLjYxNTIgMTMuNzEzOUMxNC4yODkzIDEyLjQwMDEgMTUuNzkxOCAxMi4xMTc1IDE2LjI1MzkgMTIuMTIyMVpNNC45NjI4OSAxMC4yODcxQzUuMzAyOTkgMTAuNzAyNiA1LjYwOTY1IDExLjQzMjMgNS4yMTA5NCAxMi4zNDY3QzUuMDI5OTUgMTIuMTk3NyA0LjY3NDg0IDEwLjk0ODEgNC45NjI4OSAxMC4yODcxWk0xNS4yNDggMTAuMzk0NUMxNS41MTY2IDExLjAxMTUgMTUuMTg0NSAxMi4xNzc0IDE1LjAxNTYgMTIuMzE2NEMxNC42NDM2IDExLjQ2MjkgMTQuOTMwNSAxMC43ODIyIDE1LjI0OCAxMC4zOTQ1Wk0yLjk2ODc1IDEwLjM3MTFDMy42MzgwNyAxMC40NzYzIDQuNTQwNjcgMTAuOTA1NiA0LjkzNDU3IDEyLjEwMDZDNC42Mzg5NSAxMi4xMTIzIDMuMzAyMjEgMTEuNTI4NSAyLjk2ODc1IDEwLjM3MTFaTTE3LjIwNyAxMC4zNzExQzE2Ljg3MzYgMTEuNTI4NSAxNS41MzY3IDEyLjExMjQgMTUuMjQxMiAxMi4xMDA2QzE1LjYzNTEgMTAuOTA1NiAxNi41Mzc3IDEwLjQ3NjMgMTcuMjA3IDEwLjM3MTFaTTMuMzMzMDEgOC43Mjc1NEMzLjkzNzYyIDkuMDMzMDYgNC42NjQ0NiA5LjcxODQyIDQuNjcxODggMTAuOTc2NkM0LjM4NzAzIDEwLjg5NzEgMy4yOTQ0OSA5LjkzMTM1IDMuMzMzMDEgOC43Mjc1NFpNMTYuODI0MiA4LjcyNzU0QzE2Ljg2MjcgOS45MzA3NiAxNS43NzE4IDEwLjg5NjIgMTUuNDg2MyAxMC45NzY2QzE1LjQ5MzcgOS43MTg1MyAxNi4yMTk2IDkuMDMzMSAxNi44MjQyIDguNzI3NTRaTTUuNTQ5OCA3Ljc2MzY3QzUuNjk1MzcgOC40MjQ3NiA1LjYyMzk0IDkuNDIwMTEgNC42NTMzMiAxMC4yMjE3QzQuNTM0OTQgOS45NTAzIDQuNTkyNTkgOC40OTUxNCA1LjU0OTggNy43NjM2N1pNMTQuNjA3NCA3Ljc2MzY3QzE1LjU2NDQgOC40OTUxIDE1LjYyMjIgOS45NTAxMyAxNS41MDM5IDEwLjIyMTdDMTQuNTMzMiA5LjQyMDEgMTQuNDYxOSA4LjQyNDc4IDE0LjYwNzQgNy43NjM2N1pNMy4zODM3OSA2LjkwOTE4QzMuOTE3MzYgNy4zMjYzNyA0LjU3NjU4IDguMDU0NSA0LjMzODg3IDkuMjkwMDRDNC4wNzQ2MSA5LjE1NjE2IDMuMTExOTMgOC4wODIwMSAzLjM4Mzc5IDYuOTA5MThaTTE2Ljc3NzMgNi45MDkxOEMxNy4wNDk0IDguMDgyNDUgMTYuMDg2MiA5LjE1NjcgMTUuODIyMyA5LjI5MDA0QzE1LjU4NDcgOC4wNTQ3OSAxNi4yNDM4IDcuMzI2NDEgMTYuNzc3MyA2LjkwOTE4Wk0xNS41NTc2IDYuMTg5NDVDMTYuMTQ5MyA2Ljk0MzE4IDE1LjgxNzEgOC4wNDE2NyAxNS42NzE5IDguMjI2NTZDMTUuMjI3NSA3LjQ0NjY5IDE1LjQxNzYgNi42NTA4OSAxNS41NTc2IDYuMTg5NDVaTTQuNjEyMyA2LjE3NDhDNC43NTI4MiA2LjYzODEgNC45NDIwMiA3LjQzNjEyIDQuNDk2MDkgOC4yMTg3NUM0LjM1MDE3IDguMDMxODEgNC4wMTg3NyA2LjkzMDgyIDQuNjEyMyA2LjE3NDhaTTYuODkyNTggNi4wNTU2NkM2LjYyNDk1IDYuNTk5ODMgNi4xMTU0NSA3LjQ5MzIxIDUuMDM3MTEgNy44MjkxQzUuMDYyOTQgNy41MzQwMSA1LjcwMTg4IDYuMjQxMTYgNi44OTI1OCA2LjA1NTY2Wk0xMy4yNzY0IDYuMDU1NjZDMTQuNDY2OCA2LjI0MTQyIDE1LjEwNSA3LjUzNCAxNS4xMzA5IDcuODI5MUMxNC4wNTI2IDcuNDkzMjEgMTMuNTQ0IDYuNTk5ODQgMTMuMjc2NCA2LjA1NTY2Wk01LjU0Njg4IDQuMzM4ODdDNS44NTg5OCA0Ljg2MTgyIDUuODU5MzIgNi4wNTIxNyA1LjE0NDUzIDYuOTU3MDNDNC45NzQwNyA2LjcxNTQ2IDQuNzU1NzkgNS4yNDc0OCA1LjU0Njg4IDQuMzM4ODdaTTE0LjYxMTMgNC4zMzg4N0MxNS40MDI0IDUuMjQ3NDYgMTUuMTg0MSA2LjcxNTM3IDE1LjAxMzcgNi45NTcwM0MxNC4yOTg5IDYuMDUyMTYgMTQuMjk5MiA0Ljg2MTgyIDE0LjYxMTMgNC4zMzg4N1pNNy4yNDQxNCA0LjEzOTY1QzcuMjg0MDcgNC43NDcyOSA2Ljc0MjAzIDUuODA3OSA1LjY5MzM2IDYuMjg5MDZDNS42NTE0IDUuOTk2NTggNi4xMjU4MiA0LjU4OTU1IDcuMjQ0MTQgNC4xMzk2NVpNMTIuOTIxOSA0LjEzOTY1QzE0LjA0IDQuNTg5NjcgMTQuNTE0NiA1Ljk5NjYgMTQuNDcyNyA2LjI4OTA2QzEzLjQyNCA1LjgwNzg5IDEyLjg4MTkgNC43NDcyOSAxMi45MjE5IDQuMTM5NjVaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNOC42NjM5MSA2LjQ5MDUyTDguNTI3MjkgNi45Mzg2N0w5LjIxMjEyIDYuOTEwNjRMOS4yNzQzIDYuNjk3OUM5LjI3MTU2IDYuNTgzMzYgOS4xMjMzMSA2LjAyNTEyIDkuMDk4OTEgNS45MzM5NkM5LjA5ODU4IDUuOTMwNTYgOS4wOTc1NSA1LjkyNjE0IDkuMDk1NTMgNS45MjA1MkM4Ljk3NDg3IDYuMDA5NjcgOC42NjM5MSA2LjQ5MDUyIDguNjYzOTEgNi40OTA1MloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik04LjQ2MDY1IDcuMzY2MDdMOC4xNTQ0MiA4LjM1NTk4TDguNjg1MzIgOS4zOTQ4N0w5LjQ3ODE3IDkuNDYwMTVMOS44NDc0NCA4Ljk2MTk5TDkuODQwMTMgOC4zODg5NUw5LjU0MTEzIDcuNTQwNTlMOC40NjA2NSA3LjM2NjA3WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTcuMDg0OTUgOC4yMTYxN0w3LjIwNzUxIDguMDc4MjhMNy4zMDg0NCA4LjQyNDUxTDcuNDQyNTEgOC43OTk2M0w3LjM4MDUxIDguODk1MTNMNi45NTIyNiA5LjAzODUzTDYuODIzNTggOC44NTUwM0w3LjA4NDk1IDguMjE2MTdaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNi45NzA1NyAxMC4zMTUzTDYuNzg4MDkgOS40NzM4Nkw3Ljg5NzAzIDkuMTcxOTNMOC42OTM1OCAxMC4zMDc5TDcuODk3MDMgMTEuMTc5Mkw2Ljk3MDU3IDEwLjMxNTNaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTAuNjQwNiA2LjA4MzQzTDEwLjc1MTIgNS44MzQ5NkwxMS4zMjEyIDYuNjQ3ODJMMTEuMjY4OCA2LjcwMjYxTDEwLjc4MjIgNi44NTM5N0wxMC42NjIzIDYuNTgxNDdMMTAuNjQwNiA2LjA4MzQzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTEwLjMxMDkgOC4zOTU1NUwxMC41Njg1IDcuMjYwMDlMMTEuNDI5OCA3LjEyNzc0TDEyLjAwMzkgOC4xMDg4NEwxMS43NDE0IDkuMTc2NDJMMTEuMzQwMiA5LjQ1NzIyTDEwLjcwNzkgOS4yODY2OEwxMC4zMTA5IDguMzk1NTVaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNy45MjkxIDExLjc3N0w4Ljg5NDIgMTAuOTQ1Nkw5Ljg1OTI2IDkuODMwNTZMMTEuMDIyNyAxMC4xOTM0TDExLjc2OTggMTEuMjU4OUwxMi41NDg3IDEyLjQ1ODZMMTEuOTU2NyAxMi45NDMzTDEwLjIwMTcgMTMuMzExM0w3Ljk3MDIgMTIuODY4Nkw3LjcyOTA3IDEyLjIwMDdMNy45MjkxIDExLjc3N1oiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMi45MjYzIDcuODA1NjRMMTIuODcxMyA4LjEyOTMyTDEyLjgzMzIgOC40MDA0NkwxMy4zMzk5IDguNjIxNDJMMTMuNDAyNSA4LjE5NTA4TDEzLjEwMzIgNy44ODU1NEwxMi45MjYzIDcuODA1NjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIuNDg5MyA4LjkzMTMyTDExLjYxNTYgMTAuMTkzM0wxMi4zMzQ3IDExLjE3OTJMMTIuNzI2NiAxMS4yMDVMMTMuNDAyNCA5Ljg3ODA5TDEzLjE4ODIgOS4yNjA2MkwxMi40ODkzIDguOTMxMzJaIiBmaWxsPSJ3aGl0ZSIvPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzIxNDcyXzc0MjIiPgo8cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==';
  const ICON_STNEAR_DATA =
    "data:image/svg+xml;utf8,%3csvg width='96' height='96' viewBox='0 0 96 96' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='96' height='96' rx='48' fill='white'/%3e%3cpath fill-rule='evenodd' clip-rule='evenodd' d='M48.0006 20L41.2575 26.7431L48.0006 33.4862L54.7437 26.7431L48.0006 20ZM37.281 30.7188L30.7144 37.2853L47.9998 54.5707L65.2851 37.2853L58.7186 30.7188L47.9998 41.4376L37.281 30.7188ZM26.7384 41.261L19.9953 48.0041L47.9995 76.0083L76.0037 48.0041L69.2606 41.2611L47.9995 62.5221L26.7384 41.261Z' fill='%23231B51'/%3e%3c/svg%3e";
  const ICON_LINEAR_DATA =
    "data:image/svg+xml;utf8,%3Csvg width='40' height='40' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M30.74 28.78c.21-.36.32-.78.32-1.21v-6.33c0-.24-.06-.46-.17-.66-.12-.21-.28-.38-.48-.49l-16.86-9.77c-.35-.2-.73-.31-1.13-.32-.64 0-1.24.26-1.69.72-.45.45-.7 1.07-.71 1.71v6.39c0 .24.06.47.18.67.11.21.28.37.48.48l16.82 9.71c.36.22.77.32 1.19.32.41 0 .82-.12 1.19-.33.36-.21.66-.52.86-.89zm.32-16.27c0-.42-.1-.84-.29-1.21-.2-.38-.49-.7-.85-.93-.36-.22-.78-.34-1.21-.34-.42 0-.84.12-1.21.34l-4.97 2.81c-.04.02-.08.07-.1.12-.03.04-.04.1-.04.14 0 .06.01.11.04.16.02.04.06.08.1.1l8.05 4.62c.05.02.1.04.15.04.05 0 .1-.02.15-.05.04-.02.08-.06.11-.11.02-.04.04-.1.03-.15l.04-5.54zM10.05 27.5c-.01.43.08.86.28 1.23.2.38.49.7.85.93.36.22.78.34 1.2.34.42 0 .83-.12 1.2-.34l4.92-2.85c.04-.02.08-.06.1-.11.03-.04.05-.1.05-.15 0-.05-.02-.11-.05-.15-.02-.05-.06-.09-.1-.12l-8.05-4.6c-.05-.03-.09-.04-.15-.04-.05 0-.1.01-.15.04-.05.02-.08.07-.11.12-.02.04-.04.09-.04.14l.05 5.56z' fill='url(%23paint0_linear_186_370)'/%3E%3Cdefs%3E%3ClinearGradient id='paint0_linear_186_370' x1='11.135' y1='11.152' x2='30.145' y2='30.457' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%231BB3CC'/%3E%3Cstop offset='1' stop-color='%23824ACC'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E";
  const ICON_NEARX_DATA =
    "data:image/svg+xml;utf8,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12ZM17.1421 21.3847L21.3848 17.1421L19.3669 15.1243C18.5576 17.0302 17.0303 18.5576 15.1243 19.3669L17.1421 21.3847ZM9.4329 19.5792C7.45318 18.9089 5.82112 17.4847 4.87847 15.6484L3.24263 17.2842L7.48527 21.5269L9.4329 19.5792ZM4.63307 8.87568C5.4424 6.96973 6.96977 5.44237 8.87573 4.63305L7.24263 2.99995L2.99999 7.24259L4.63307 8.87568ZM15.6484 4.87847L17.3848 3.14209L21.6274 7.38473L19.5792 9.4329C18.9089 7.45318 17.4847 5.82112 15.6484 4.87847Z' fill='%232FA8AF'/%3E%3Cpath d='M8.00119 11.9921C8.00119 11.0268 8.00119 10.0615 8.00119 9.09612C8.00119 8.50505 8.16497 8.1743 8.56285 8.05781C8.97778 7.93628 9.40619 7.97917 9.79565 8.45228C11.3533 10.3447 12.9343 12.218 14.5092 14.0959C14.5692 14.1676 14.6117 14.3122 14.734 14.2626C14.8496 14.2157 14.7858 14.0805 14.786 13.9878C14.7904 12.6326 14.7898 11.2774 14.7868 9.92226C14.7868 9.83668 14.838 9.7162 14.7271 9.67372C14.6401 9.64029 14.5824 9.74185 14.522 9.79358C14.0492 10.1981 13.5804 10.6073 13.1088 11.0133C13.0208 11.089 12.9332 11.2118 12.8002 11.1012C12.6657 10.9894 12.7696 10.8872 12.8364 10.7881C13.3547 10.0186 13.8728 9.24898 14.3909 8.47919C14.6656 8.07085 15.0079 7.92282 15.4056 8.04141C15.786 8.15475 15.9986 8.48592 15.9992 8.97668C16.0007 10.0905 15.9996 11.2045 15.9996 12.3183C15.9996 13.2094 16.0003 14.1005 15.9994 14.9916C15.999 15.4826 15.8137 15.798 15.4512 15.9324C15.0256 16.0901 14.5767 15.9683 14.2734 15.6058C12.6823 13.705 11.0924 11.8029 9.50198 9.90144C9.46029 9.85161 9.42303 9.7961 9.37377 9.75489C9.28998 9.68487 9.21967 9.68108 9.21314 9.81797C9.20999 9.88273 9.21188 9.94791 9.21188 10.0129C9.21188 11.3496 9.21062 12.6862 9.2142 14.0227C9.21441 14.1186 9.15609 14.2557 9.26114 14.3038C9.38093 14.3587 9.45061 14.2178 9.52998 14.1503C9.98259 13.7651 10.4291 13.3728 10.8805 12.9859C10.9729 12.9066 11.0626 12.7651 11.208 12.8973C11.3402 13.0176 11.2213 13.1196 11.159 13.2127C10.6323 13.9989 10.1032 14.7837 9.57145 15.5663C9.32788 15.9248 8.9881 16.056 8.61085 15.9488C8.23739 15.8428 8.00498 15.5246 8.00287 15.0827C7.99761 14.0523 8.00119 13.022 8.00119 11.9917V11.9921Z' fill='white'/%3E%3C/svg%3E";

  // ======================== Authoritative Multi-CDN Token Logo Map ========================

  const TOKEN_ICON_MAP = {
    NEAR: ICON_NEAR_DATA,
    WNEAR: ICON_NEAR_DATA,
    BNEAR: ICON_NEAR_DATA,
    RNEAR: ICON_RNEAR_DATA,
    XRHEA: ICON_XRHEA_DATA,
    ORHEA: ICON_ORHEA_DATA,
    STNEAR: ICON_STNEAR_DATA,
    LINEAR: ICON_LINEAR_DATA,
    NEARX: ICON_NEARX_DATA,
    ETH: ICON_ETH_DATA,
    WETH: ICON_ETH_DATA,
    AETHWETH: ICON_ETH_DATA,
    STETH: ICON_STETH_DATA,
    WSTETH: 'https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png?1696518295',
    BTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
    WBTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
    CBBTC: 'https://assets.coingecko.com/coins/images/40143/standard/cbbtc.webp',
    SOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    WSOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    JITOSOL: 'https://static.datapi.jup.ag/token-icons/86932ec91f48cf380c8b694112b68ec9c18528deecfb82b11a88dadd927c2c6e.webp',
    JUP: ICON_JUP_DATA,
    'STAKED JUP': ICON_JUP_DATA,
    BONK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
    WIF: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm/logo.png',
    USDT: ICON_USDT_DATA,
    BUSDT: ICON_USDT_DATA,
    USDC: ICON_USDC_DATA,
    BUSDC: ICON_USDC_DATA,
    USDG: 'https://assets.coingecko.com/coins/images/51281/standard/GDN_USDG_Token_200x200.png',
    USDE: ICON_SUSDE_DATA,
    DAI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    BNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    WBNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    CAKE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/logo.png',
    ARB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x912CE59144191C1204E64559FE8253a0e49E6548/logo.png',
    OP: 'https://coin-images.coingecko.com/coins/images/25244/large/Token.png?1774456081',
    BASE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
    ARC: 'https://raw.githubusercontent.com/ulyanas/frontend-configs/add-usdc-eurc-latest-token-icons/configs/network-icons/arc-dark.svg',
    UNI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
    AERO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x940181a94A35A4569E4529A3CDfB74e38FD98631/logo.png',
    HYPE: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
    WHYPE: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
    PONS: 'https://storage.googleapis.com/ks-setting-1d682dca/99cb6fd9-ad94-4b7c-a722-d445a9b9ceef1784090007449.jpg',
    TRX: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
    XRP: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png',
    DOGE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/doge/info/logo.png',
    SUI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png',
    TON: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
    APT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/aptos/info/logo.png',
    CASHCAT: 'https://coin-images.coingecko.com/coins/images/102174280/large/cashcat-logo.jpg?1782922765',
    QTC: QTC_OFFICIAL_ICON_URL,
    XAUT: 'https://coin-images.coingecko.com/coins/images/10481/large/logo.png?1774627372',
    BOME: 'https://image.mitte.gg/token-images/jWnhrsw1ncGBEAMBoBptZE',
    GNO: 'https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png?1696501854',
    COW: 'https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png?1719524382',
    SAFE: 'https://coin-images.coingecko.com/coins/images/27032/large/Artboard_1_copy_8circle-1.png?1696526084',
    AAVE: 'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
    LINK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
    STRK: 'https://coin-images.coingecko.com/coins/images/26433/large/starknet.png?1696525507',
    BERA: 'https://coin-images.coingecko.com/coins/images/25235/large/BERA.png?1738822008',
    OKB: 'https://coin-images.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png?1696505053',
    POL: 'https://coin-images.coingecko.com/coins/images/32440/large/pol.png?1759114181',
    KAITO: 'https://coin-images.coingecko.com/coins/images/54411/large/Qm4DW488_400x400.jpg?1739552780',
    GRAM: 'https://coin-images.coingecko.com/coins/images/17980/large/Gram_Circular_Badge.png?1781524778',
    AVAX: 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369',
    XLM: 'https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350',
    ADA: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
    LTC: 'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400',
    SPX: 'https://coin-images.coingecko.com/coins/images/31401/large/centeredcoin_%281%29.png?1737048493',
    BCH: 'https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932',
    SHIB: 'https://image.mitte.gg/token-images/szPtDFsUVMihEtLwGKtwae',
    PEPE: 'https://image.mitte.gg/token-images/pjzfcHhthXNngpR5XpKvNa',
    PENGU: 'https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png?1733809110',
    ALEO: 'https://coin-images.coingecko.com/coins/images/27916/large/secondary-icon-dark.png?1726770428',
    DASH: 'https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png?1696501423',
    BRETT: 'https://image.mitte.gg/token-images/cjZccuMVzVvWfZ3GKw58yx',
    GMX: 'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png?1696517814',
    MOG: 'https://coin-images.coingecko.com/coins/images/31059/large/MOG_LOGO_200x200.png?1696529893',
    MOVE: 'https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png?1721878759',
    EURC: 'https://storage.googleapis.com/ks-setting-1d682dca/3cb13e14-b165-4305-a272-d4fa03ca58051789468881141.png',
    WUSDC: ICON_USDC_DATA,
    XYUSDC: ICON_USDC_DATA,
    USYC: 'https://assets.coingecko.com/coins/images/31057/standard/usyc.png',
    CIRBTC: 'https://storage.googleapis.com/ks-setting-1d682dca/0ec4d0f8-8eee-4c73-a496-9582ee163b4f1789469942218.png',
    RAY: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
    ORCA: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png',
    PYTH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3/logo.png',
    JTO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL/logo.png',
    TRUMP: 'https://assets.coingecko.com/coins/images/53746/standard/trump.png',
    FARTCOIN: 'https://assets.coingecko.com/coins/images/50891/standard/fart.jpg',
    POPCAT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr/logo.png',
    MEW: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5/logo.png',
    RENDER: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/logo.png',
    HNT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux/logo.png',
    MSOL: ICON_MSOL_DATA,
    KMNO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS/logo.png',
    DRIFT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7/logo.png',
    GRASS: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs/logo.png',
    W: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ/logo.png',
    VIRTUAL: 'https://assets.coingecko.com/coins/images/34057/standard/LOGOMARK.png',
    DEGEN: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed/logo.png',
    PENDLE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x808507121B80c02388fAd14726482e061B8da827/logo.png',
    FDUSD: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409/logo.png',
    BTCB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c/logo.png',
    LDO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32/logo.png',
    CRV: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png',
    MKR: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2/logo.png',
    ENS: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72/logo.png',
    MORPHO: 'https://assets.coingecko.com/coins/images/29837/standard/Morpho-token-icon.png',
    NVDAX: 'https://static.datapi.jup.ag/token-icons/5550a81a36c9cce2af5d8b738bcf665c7b4da250a4652dd025107a5d6f0b9458.webp',
    TSLAX: 'https://static.datapi.jup.ag/token-icons/e1d90902b191d70826c331e81dee1c19bf7d8884e436626153ff09397c36d278.webp',
    AAPLX: 'https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png',
    MSFTX: 'https://static.datapi.jup.ag/token-icons/01cc89d2a92ce9845c11e410e1b21614cc211f65239934b3c54d95cf06a84910.webp',
    GOOGLX: 'https://static.datapi.jup.ag/token-icons/12d3b57880ed15dda32a5f89564aa9adf6e30f5dd8a44d1a645b3dc00f7e45be.webp',
    AMZNX: 'https://xstocks-metadata.backed.fi/logos/tokens/AMZNx.png',
    METAX: 'https://static.datapi.jup.ag/token-icons/a636a567e1cfdaa487635e36e24467d111a7bdd6f072b41eb41bea784088e9ab.webp',
    SPYX: 'https://static.datapi.jup.ag/token-icons/4d04cfdd8396f0c9274d49f135a458b7d4726cc098e3fc69bb3b4124eb24a2f2.webp',
    QQQX: 'https://xstocks-metadata.backed.fi/logos/tokens/QQQx.png',
    MSTRX: 'https://static.datapi.jup.ag/token-icons/80e0f9b2b1a97b8aee2ce90f161e9c9557f9afdb81abc86e2d543197e996d470.webp',
    COINX: 'https://xstocks-metadata.backed.fi/logos/tokens/COINx.png',
    PLTRX: 'https://xstocks-metadata.backed.fi/logos/tokens/PLTRx.png',
    HOODX: 'https://static.datapi.jup.ag/token-icons/35dabd90c89a9488aa7ba2f75c9d674e30c54f6c3934e4ac1c593070c3bcda1b.webp',
    CRCLX: 'https://static.datapi.jup.ag/token-icons/9dd17a6ce597b2622a41682672f1db6b9bd78c462405d5d19f2ecf7ca821e9cc.webp',
    GLDX: 'https://static.datapi.jup.ag/token-icons/4b57f2ddf52a0b96ed41fa9678f5540a6f08ca0aa81e735a884c8106e7ea8add.webp',
    SPCXX: 'https://static.datapi.jup.ag/token-icons/408050c7fcb89ee19487cf7b549476b645151a6bb777dc925bba09fb49eb69e1.webp',
    JUPSOL: 'https://static.datapi.jup.ag/token-icons/f65f73e25b3eadcdd65ac25be847bf9d2766822164fb118b37bb3824ee3cb69b.webp',
    INF: ICON_INF_DATA,
    SUSDE: ICON_SUSDE_DATA,
    KHYPE: ICON_KHYPE_DATA,
    STEAKUSDC: ICON_USDC_DATA,
    ABASUSDC: ICON_USDC_DATA,
    AETHUSDC: ICON_USDC_DATA,
    AARBUSDCN: ICON_USDC_DATA
  };

  const DYNAMIC_ICON_BY_SYMBOL = Object.create(null);
  const DYNAMIC_ICON_BY_CONTRACT = Object.create(null);

  function registerDynamicTokenIcons(symbolMap = {}, contractMap = {}) {
    if (symbolMap && typeof symbolMap === 'object') {
      for (const [sym, url] of Object.entries(symbolMap)) {
        const cleanSym = String(sym || '').trim().replace(/^\$/, '').toUpperCase();
        const safe = sanitizeImageUrl(url);
        if (cleanSym && safe && !DYNAMIC_ICON_BY_SYMBOL[cleanSym]) {
          DYNAMIC_ICON_BY_SYMBOL[cleanSym] = safe;
        }
      }
    }
    if (contractMap && typeof contractMap === 'object') {
      for (const [cid, url] of Object.entries(contractMap)) {
        const cleanCid = String(cid || '').trim().toLowerCase();
        const safe = sanitizeImageUrl(url);
        if (cleanCid && safe && !DYNAMIC_ICON_BY_CONTRACT[cleanCid]) {
          DYNAMIC_ICON_BY_CONTRACT[cleanCid] = safe;
        }
      }
    }
  }

  const TRUSTWALLET_CHAIN_SLUGS = {
    eth: 'ethereum',
    ethereum: 'ethereum',
    bsc: 'smartchain',
    smartchain: 'smartchain',
    base: 'base',
    arb: 'arbitrum',
    arbitrum: 'arbitrum',
    sol: 'solana',
    solana: 'solana',
    op: 'optimism',
    optimism: 'optimism',
    pol: 'polygon',
    polygon: 'polygon'
  };

  // ======================== Chain Badge & Network Metadata System ========================

  const CHAIN_ALIAS_MAP = {
    near: 'near',
    eth: 'eth',
    ethereum: 'eth',
    sol: 'sol',
    solana: 'sol',
    base: 'base',
    arb: 'arb',
    arbitrum: 'arb',
    bsc: 'bsc',
    bnb: 'bsc',
    smartchain: 'bsc',
    btc: 'btc',
    bitcoin: 'btc',
    tron: 'tron',
    trx: 'tron',
    hype: 'hype',
    hyperevm: 'hype',
    hypercore: 'hype',
    hood: 'hood',
    robinhood: 'hood',
    arc: 'arc',
    arcnetwork: 'arc',
    'arc network': 'arc',
    prl: 'prl',
    pearl: 'prl',
    qtc: 'qtc',
    quantus: 'qtc',
    op: 'op',
    optimism: 'op',
    pol: 'pol',
    polygon: 'pol',
    matic: 'pol',
    sui: 'sui',
    ton: 'ton',
    aptos: 'apt',
    apt: 'apt',
    doge: 'doge',
    xrp: 'xrp',
    avax: 'avax',
    gnosis: 'gnosis'
  };

  function encodeUtf8Base64(str) {
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        return Buffer.from(str, 'utf8').toString('base64');
      }
    } catch (_) {}
    try {
      if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }
    } catch (_) {}
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(str)));
    }
    return '';
  }

  function makeCircleIconDataUri(bg, contentHtml, ringColor) {
    const ring = ringColor ? `<circle cx="16" cy="16" r="15" stroke="${ringColor}" stroke-width="1.5" fill="none"/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="${bg}"/>${ring}${contentHtml}</svg>`;
    const b64 = encodeUtf8Base64(svg);
    return b64 ? `data:image/svg+xml;base64,${b64}` : '';
  }

  const LOCAL_ICON_SPECS = {
    near: ['#00EC97', '<path d="M21.4 9.2l-3.8 5.6c-.3.4.3.9.7.6l3.6-3v7.2c0 .2-.3.3-.4.1L12 8.2a2 2 0 00-1.6-.6H10a2 2 0 00-2 2v12.8a2 2 0 002 2c.7 0 1.4-.4 1.8-1l3.8-5.6c.3-.4-.3-.9-.7-.6l-3.6 3V13c0-.2.3-.3.4-.1l9.5 11.5c.4.5 1 .8 1.6.8h.4a2 2 0 002-2V10.4a2 2 0 00-2-2c-.7 0-1.4.4-1.8.8z" fill="#000"/>'],
    eth: ['#627EEA', '<path d="M16 5.5L9.5 16l6.5 3.9 6.5-3.9L16 5.5zm0 16.4l-6.5-3.9L16 26.5l6.5-8.5-6.5 3.9z" fill="#FFF"/>'],
    weth: ['#1E293B', '<path d="M16 5.5L9.5 16l6.5 3.9 6.5-3.9L16 5.5zm0 16.4l-6.5-3.9L16 26.5l6.5-8.5-6.5 3.9z" fill="#A5B4FC"/>', '#627EEA'],
    btc: ['#F7931A', '<text x="16" y="22.5" text-anchor="middle" fill="#FFF" font-size="18" font-weight="800" font-family="system-ui,sans-serif">₿</text>'],
    wbtc: ['#282828', '<text x="16" y="22.5" text-anchor="middle" fill="#F09242" font-size="18" font-weight="800" font-family="system-ui,sans-serif">₿</text>', '#F09242'],
    sol: ['#141726', '<path d="M9.5 20.5h13l-2 2h-13l2-2zm0-11h13l-2 2h-13l2-2zm11 5.5h-13l2 2h13l-2-2z" fill="#14F195"/>'],
    bnb: ['#F3BA2F', '<path d="M16 7.5l3.5 3.5-3.5 3.5-3.5-3.5L16 7.5zm-6.4 8.5L12 13.6l2.4 2.4L12 18.4 9.6 16zm12.8 0L20 13.6 17.6 16l2.4 2.4L22.4 16zM16 17.5l3.5 3.5-3.5 3.5-3.5-3.5 3.5-3.5z" fill="#FFF"/>'],
    base: ['#0052FF', '<circle cx="16" cy="16" r="8.5" fill="#FFF"/><rect x="7" y="14.5" width="9.5" height="3" fill="#0052FF"/>'],
    arb: ['#213147', '<path d="M16 6l8.4 5v10L16 26l-8.4-5V11L16 6z" stroke="#12AAFF" stroke-width="2.2"/><path d="M12.6 20.8L16 11.2l3.4 9.6" stroke="#FFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'],
    op: ['#FF0420', '<text x="16" y="20.5" text-anchor="middle" fill="#FFF" font-size="12.5" font-weight="900" font-family="system-ui,sans-serif">OP</text>'],
    pol: ['#8247E5', '<path d="M20.4 12.4L16 10l-4.4 2.4v4.8L16 19.6l4.4-2.4v-4.8z" stroke="#FFF" stroke-width="2.4" stroke-linejoin="round"/>'],
    trx: ['#EB0029', '<path d="M9 9.5l14.4 2.5-6.6 11.6L9 9.5z" stroke="#FFF" stroke-width="2" stroke-linejoin="round"/>'],
    sui: ['#4DA2FF', '<path d="M16 6.8c-3.4 4.8-5.4 8-5.4 11.4a5.4 5.4 0 0010.8 0c0-3.4-2-6.6-5.4-11.4z" fill="#FFF"/>'],
    ton: ['#0098EA', '<path d="M9 10.5h14l-7 12.2-7-12.2z" stroke="#FFF" stroke-width="2.2" stroke-linejoin="round"/>'],
    apt: ['#111827', '<path d="M8 12h16M10 16h12M12 20h8" stroke="#FFF" stroke-width="2.2" stroke-linecap="round"/>'],
    doge: ['#C2A633', '<text x="16" y="21.5" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">Ð</text>'],
    xrp: ['#23292F', '<path d="M9 9.5l7 6.8 7-6.8M9 22.5l7-6.8 7 6.8" stroke="#FFF" stroke-width="2.4" stroke-linecap="round"/>'],
    avax: ['#E84142', '<path d="M16 8l7.6 14.4H8.4L16 8z" fill="#FFF"/>'],
    hype: ['#072723', '<path d="M11.4 10.6c-3 0-5.2 2.4-5.2 5.4s2.2 5.4 5.2 5.4c2.2 0 3.6-1.4 4.6-2.8.8 1.2 1.8 2.2 3.6 2.2 2.4 0 4.2-2 4.2-4.8s-1.8-4.8-4.2-4.8c-1.8 0-2.8 1-3.6 2.2-1-1.4-2.4-2.8-4.6-2.8z" fill="#97FCE4"/>', '#97FCE4'],
    whype: ['#0E1F1D', '<path d="M11.4 10.6c-3 0-5.2 2.4-5.2 5.4s2.2 5.4 5.2 5.4c2.2 0 3.6-1.4 4.6-2.8.8 1.2 1.8 2.2 3.6 2.2 2.4 0 4.2-2 4.2-4.8s-1.8-4.8-4.2-4.8c-1.8 0-2.8 1-3.6 2.2-1-1.4-2.4-2.8-4.6-2.8z" fill="#5EEAD4"/>', '#14B8A6'],
    arc: ['#F8FAFC', '<g transform="translate(6, 5) scale(0.68)"><path fill="#0F172A" d="M1 30c.243-7.345 1.489-14.199 3.57-19.53C7.206 3.72 11.023 0 15.314 0c4.292 0 8.109 3.719 10.745 10.472 1.371 3.512 2.38 7.685 2.978 12.225.054.405.1.817.146 1.229.015.025.024.049.02.068 0 0 .352 2.194.427 6.007h-.04c-.52-.428-6.666-5.256-16.854-3.858a63.94 63.94 0 0 1 .639-5.009l.044-.243c3.995-.12 7.493.343 10.175.952-.01-.064-.018-.13-.03-.193-.55-3.432-1.364-6.575-2.413-9.26-1.714-4.392-3.952-7.12-5.838-7.12-1.885 0-4.123 2.728-5.837 7.12a37.113 37.113 0 0 0-1.132 3.389 50.654 50.654 0 0 0-1.196 5.355c-.474 2.786-.769 5.773-.877 8.868H1V30Z"/></g>', '#CBD5E1'],
    hood: ['#00C805', '<path d="M10 22.4c5.6-2 9.2-6.6 11.4-13.2-4.8 1.8-8.8 5-11.4 10.4v2.8z" fill="#041304"/>'],
    pons: ['#10B981', '<text x="16" y="20.5" text-anchor="middle" fill="#FFF" font-size="10.5" font-weight="800" font-family="system-ui,sans-serif">PONS</text>'],
    gnosis: ['#04795B', '<circle cx="16" cy="16" r="7.5" stroke="#FFF" stroke-width="2"/><circle cx="13" cy="15" r="1.4" fill="#FFF"/><circle cx="19" cy="15" r="1.4" fill="#FFF"/>'],
    qtc: ['#0A0A0A', '<circle cx="15" cy="15" r="7.5" stroke="#F97316" stroke-width="2.6"/><path d="M20.2 20l4.2 4.2" stroke="#F97316" stroke-width="2.6" stroke-linecap="round"/>', '#F97316'],
    usdc: ['#2775CA', '<text x="16" y="22" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">$</text>'],
    usdt: ['#26A17B', '<text x="16" y="22" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">₮</text>'],
    usdbc: ['#2775CA', '<text x="16" y="21.5" text-anchor="middle" fill="#FFF" font-size="15" font-weight="800" font-family="system-ui,sans-serif">$</text>', '#93C5FD'],
    eurc: ['#1D6FD8', '<text x="16" y="22" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">€</text>'],
    dai: ['#F5AC37', '<path d="M11 10.5h5.5a5.5 5.5 0 010 11H11v-11zm-2 4h14M9 17.5h14" stroke="#FFF" stroke-width="2" stroke-linecap="round"/>'],
    link: ['#2A5ADA', '<path d="M16 7.5L23.5 11.8v8.4L16 24.5l-7.5-4.3v-8.4L16 7.5z" stroke="#FFF" stroke-width="2.4" stroke-linejoin="round"/>'],
    jup: ['#131B2E', '<circle cx="16" cy="16" r="6" fill="#22C55E"/><path d="M8.5 19.5c4.5-2 10.5-4 15-7" stroke="#A7F3D0" stroke-width="2" stroke-linecap="round"/>'],
    rhea: ['#0B1F1A', '<path d="M11 22V10h5.5a3.8 3.8 0 010 7.6H11m5.5 0L21 22" stroke="#10B981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>', '#10B981'],
    purr: ['#0F172A', '<text x="16" y="20" text-anchor="middle" fill="#97FCE4" font-size="9.5" font-weight="800" font-family="system-ui,sans-serif">PURR</text>', '#97FCE4']
  };

  const LOCAL_ICON_ALIASES = {
    wnear: 'near',
    wsol: 'sol',
    wbnb: 'bnb',
    cirbtc: 'btc',
    wusdc: 'usdc',
    xyusdc: 'usdc',
    gno: 'gnosis'
  };

  var _localIconCache;
  function makeLocalIcon(key) {
    _localIconCache = _localIconCache || {};
    const k = String(key || '').toLowerCase();
    if (_localIconCache[k]) return _localIconCache[k];
    const s = LOCAL_ICON_SPECS[k] || ['#334155', `<text x="16" y="20" text-anchor="middle" fill="#FFF" font-size="11" font-weight="800" font-family="system-ui,sans-serif">${k.slice(0, 4).toUpperCase()}</text>`];
    const uri = makeCircleIconDataUri(s[0], s[1], s[2]);
    _localIconCache[k] = uri;
    return uri;
  }

  function getLocalFallbackIconUrl(symOrKey) {
    const raw = String(symOrKey || '').trim().toLowerCase();
    if (!raw) return '';
    const canonical = LOCAL_ICON_ALIASES[raw] || raw;
    return LOCAL_ICON_SPECS[canonical] ? makeLocalIcon(canonical) : '';
  }

  function makeChainBadgeSvg(bg, fg, glyphHtml) {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="${bg}"/>${glyphHtml}</svg>`;
  }

  const CHAIN_META = {
    near: {
      key: 'near',
      name: 'NEAR Protocol',
      shortName: 'NEAR',
      color: '#00EC97',
      textColor: '#000000',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('near'),
      badgeSvg: makeChainBadgeSvg(
        '#00EC97',
        '#000',
        '<path d="M10.7 4.6L8.8 7.4c-.15.2.15.45.35.3l1.8-1.5v3.6c0 .1-.15.15-.2.05L6 4.1A1 1 0 005.2 3.8H5a1 1 0 00-1 1v6.4a1 1 0 001 1c.35 0 .7-.2.9-.5l1.9-2.8c.15-.2-.15-.45-.35-.3l-1.8 1.5V6.5c0-.1.15-.15.2-.05L10.6 12.2c.2.25.5.4.8.4h.2a1 1 0 001-1V5.2a1 1 0 00-1-1c-.35 0-.7.2-.9.4z" fill="#000"/>'
      )
    },
    eth: {
      key: 'eth',
      name: 'Ethereum',
      shortName: 'ETH',
      color: '#627EEA',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('eth'),
      badgeSvg: makeChainBadgeSvg(
        '#627EEA',
        '#FFF',
        '<path d="M8 2.4L4.7 8l3.3 2 3.3-2L8 2.4zm0 8.5L4.7 8.9 8 13.6l3.3-4.7-3.3 2z" fill="#FFF"/>'
      )
    },
    sol: {
      key: 'sol',
      name: 'Solana',
      shortName: 'SOL',
      color: '#9945FF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('sol'),
      badgeSvg: makeChainBadgeSvg(
        '#141726',
        '#FFF',
        '<path d="M4.6 10.2h6.6l-.9 1H3.7l.9-1zm0-5.4h6.6l-.9 1H3.7l.9-1zm5.7 2.7H3.7l.9 1h6.6l-.9-1z" fill="#14F195"/>'
      )
    },
    base: {
      key: 'base',
      name: 'Base',
      shortName: 'BASE',
      color: '#0052FF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('base'),
      badgeSvg: makeChainBadgeSvg(
        '#0052FF',
        '#FFF',
        '<circle cx="8" cy="8" r="4.3" fill="#FFF"/><rect x="3.5" y="7.2" width="4.8" height="1.6" fill="#0052FF"/>'
      )
    },
    arb: {
      key: 'arb',
      name: 'Arbitrum',
      shortName: 'ARB',
      color: '#12AAFF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('arb'),
      badgeSvg: makeChainBadgeSvg(
        '#213147',
        '#FFF',
        '<path d="M8 3l4.2 2.5v5L8 13l-4.2-2.5v-5L8 3z" stroke="#12AAFF" stroke-width="1.3"/><path d="M6.4 10.4L8 5.6l1.6 4.8" stroke="#FFF" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
      )
    },
    bsc: {
      key: 'bsc',
      name: 'BNB Smart Chain',
      shortName: 'BSC',
      color: '#F3BA2F',
      textColor: '#000000',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('bnb'),
      badgeSvg: makeChainBadgeSvg(
        '#F3BA2F',
        '#FFF',
        '<path d="M8 3.6l1.8 1.8L8 7.2 6.2 5.4 8 3.6zm-3.2 4.4l1.2-1.2L7.2 8 6 9.2 4.8 8zm6.4 0L10 6.8 8.8 8 10 9.2 11.2 8zM8 8.8l1.8 1.8L8 12.4l-1.8-1.8L8 8.8z" fill="#FFF"/>'
      )
    },
    btc: {
      key: 'btc',
      name: 'Bitcoin',
      shortName: 'BTC',
      color: '#F7931A',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('btc'),
      badgeSvg: makeChainBadgeSvg(
        '#F7931A',
        '#FFF',
        '<text x="8" y="11.2" text-anchor="middle" fill="#FFF" font-size="9.5" font-weight="800" font-family="system-ui,sans-serif">₿</text>'
      )
    },
    tron: {
      key: 'tron',
      name: 'TRON',
      shortName: 'TRX',
      color: '#EB0029',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('trx'),
      badgeSvg: makeChainBadgeSvg(
        '#EB0029',
        '#FFF',
        '<path d="M4.5 4.6l7.2 1.3-3.3 5.9-3.9-7.2z" stroke="#FFF" stroke-width="1.2" stroke-linejoin="round"/>'
      )
    },
    hype: {
      key: 'hype',
      name: 'HyperEVM',
      shortName: 'HYPE',
      color: '#97FCE4',
      textColor: '#072723',
      logoUrl: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
      fallbackLogoUrl: makeLocalIcon('hype'),
      badgeSvg: makeChainBadgeSvg(
        '#072723',
        '#97FCE4',
        '<path d="M5.7 5.3c-1.5 0-2.6 1.2-2.6 2.7s1.1 2.7 2.6 2.7c1.1 0 1.8-.7 2.3-1.4.4.6.9 1.1 1.8 1.1 1.2 0 2.1-1 2.1-2.4s-.9-2.4-2.1-2.4c-.9 0-1.4.5-1.8 1.1-.5-.7-1.2-1.4-2.3-1.4z" fill="#97FCE4"/>'
      )
    },
    hood: {
      key: 'hood',
      name: 'Robinhood Chain',
      shortName: 'HOOD',
      color: '#00C805',
      textColor: '#000000',
      logoUrl: makeLocalIcon('hood'),
      fallbackLogoUrl: makeLocalIcon('hood'),
      badgeSvg: makeChainBadgeSvg(
        '#00C805',
        '#041304',
        '<path d="M5 11.2c2.8-1 4.6-3.3 5.7-6.6-2.4.9-4.4 2.5-5.7 5.2v1.4z" fill="#041304"/>'
      )
    },
    arc: {
      key: 'arc',
      name: 'Arc Network',
      shortName: 'ARC',
      color: '#F8FAFC',
      textColor: '#0F172A',
      logoUrl: 'https://raw.githubusercontent.com/ulyanas/frontend-configs/add-usdc-eurc-latest-token-icons/configs/network-icons/arc-dark.svg',
      fallbackLogoUrl: makeLocalIcon('arc'),
      badgeSvg: makeChainBadgeSvg(
        '#F8FAFC',
        '#0F172A',
        '<g transform="translate(2.5, 2) scale(0.38)"><path fill="#0F172A" d="M1 30c.243-7.345 1.489-14.199 3.57-19.53C7.206 3.72 11.023 0 15.314 0c4.292 0 8.109 3.719 10.745 10.472 1.371 3.512 2.38 7.685 2.978 12.225.054.405.1.817.146 1.229.015.025.024.049.02.068 0 0 .352 2.194.427 6.007h-.04c-.52-.428-6.666-5.256-16.854-3.858a63.94 63.94 0 0 1 .639-5.009l.044-.243c3.995-.12 7.493.343 10.175.952-.01-.064-.018-.13-.03-.193-.55-3.432-1.364-6.575-2.413-9.26-1.714-4.392-3.952-7.12-5.838-7.12-1.885 0-4.123 2.728-5.837 7.12a37.113 37.113 0 0 0-1.132 3.389 50.654 50.654 0 0 0-1.196 5.355c-.474 2.786-.769 5.773-.877 8.868H1V30Z"/></g>'
      )
    },
    prl: {
      key: 'prl',
      name: 'Pearl Network',
      shortName: 'PRL',
      color: '#38BDF8',
      textColor: '#0B0F19',
      logoUrl: '',
      badgeSvg: makeChainBadgeSvg(
        '#0F172A',
        '#E0F2FE',
        '<circle cx="8" cy="8" r="4.5" fill="#E0F2FE"/><circle cx="6.6" cy="6.6" r="1.4" fill="#FFFFFF"/>'
      )
    },
    op: {
      key: 'op',
      name: 'Optimism',
      shortName: 'OP',
      color: '#FF0420',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('op'),
      badgeSvg: makeChainBadgeSvg(
        '#FF0420',
        '#FFF',
        '<text x="8" y="10.4" text-anchor="middle" fill="#FFF" font-size="6.5" font-weight="900" font-family="system-ui,sans-serif">OP</text>'
      )
    },
    pol: {
      key: 'pol',
      name: 'Polygon',
      shortName: 'POL',
      color: '#8247E5',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('pol'),
      badgeSvg: makeChainBadgeSvg(
        '#8247E5',
        '#FFF',
        '<path d="M10.2 6.2L8 5 5.8 6.2v2.4L8 9.8l2.2-1.2V6.2z" stroke="#FFF" stroke-width="1.3"/>'
      )
    },
    sui: {
      key: 'sui',
      name: 'Sui',
      shortName: 'SUI',
      color: '#4DA2FF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('sui'),
      badgeSvg: makeChainBadgeSvg(
        '#4DA2FF',
        '#FFF',
        '<path d="M8 3.4C6.3 5.8 5.3 7.4 5.3 9.1a2.7 2.7 0 005.4 0c0-1.7-1-3.3-2.7-5.7z" fill="#FFF"/>'
      )
    },
    ton: {
      key: 'ton',
      name: 'TON',
      shortName: 'TON',
      color: '#0098EA',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('ton'),
      badgeSvg: makeChainBadgeSvg(
        '#0098EA',
        '#FFF',
        '<path d="M4.5 5.2h7L8 11.4 4.5 5.2z" stroke="#FFF" stroke-width="1.2" stroke-linejoin="round"/>'
      )
    },
    apt: {
      key: 'apt',
      name: 'Aptos',
      shortName: 'APT',
      color: '#111827',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/aptos/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('apt'),
      badgeSvg: makeChainBadgeSvg(
        '#111827',
        '#FFF',
        '<path d="M4 6h8M5 8h6M6 10h4" stroke="#FFF" stroke-width="1.2" stroke-linecap="round"/>'
      )
    },
    doge: {
      key: 'doge',
      name: 'Dogecoin',
      shortName: 'DOGE',
      color: '#C2A633',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/doge/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('doge'),
      badgeSvg: makeChainBadgeSvg(
        '#C2A633',
        '#FFF',
        '<text x="8" y="10.8" text-anchor="middle" fill="#FFF" font-size="8.5" font-weight="800" font-family="system-ui,sans-serif">Ð</text>'
      )
    },
    xrp: {
      key: 'xrp',
      name: 'XRP Ledger',
      shortName: 'XRP',
      color: '#23292F',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('xrp'),
      badgeSvg: makeChainBadgeSvg(
        '#23292F',
        '#FFF',
        '<path d="M4.5 4.8L8 8.2l3.5-3.4M4.5 11.2L8 7.8l3.5 3.4" stroke="#FFF" stroke-width="1.3" stroke-linecap="round"/>'
      )
    },
    avax: {
      key: 'avax',
      name: 'Avalanche',
      shortName: 'AVAX',
      color: '#E84142',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('avax'),
      badgeSvg: makeChainBadgeSvg(
        '#E84142',
        '#FFF',
        '<path d="M8 4l3.8 7.2H4.2L8 4z" fill="#FFF"/>'
      )
    },
    gnosis: {
      key: 'gnosis',
      name: 'Gnosis Chain',
      shortName: 'GNO',
      color: '#04795B',
      textColor: '#FFFFFF',
      logoUrl: 'https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png?1696501854',
      fallbackLogoUrl: makeLocalIcon('gnosis'),
      badgeSvg: makeChainBadgeSvg(
        '#04795B',
        '#FFF',
        '<circle cx="8" cy="8" r="4" stroke="#FFF" stroke-width="1.3"/><circle cx="6.5" cy="7.5" r="0.8" fill="#FFF"/><circle cx="9.5" cy="7.5" r="0.8" fill="#FFF"/>'
      )
    },
    qtc: {
      key: 'qtc',
      name: 'Quantus Network',
      shortName: 'QTC',
      color: '#F97316',
      textColor: '#FFFFFF',
      logoUrl: QTC_OFFICIAL_ICON_URL,
      fallbackLogoUrl: makeLocalIcon('qtc'),
      badgeSvg: makeChainBadgeSvg(
        '#0A0A0A',
        '#F97316',
        '<circle cx="8" cy="7.8" r="4.2" stroke="#F97316" stroke-width="1.8"/><path d="M10.2 10l2.2 2.2" stroke="#F97316" stroke-width="1.8" stroke-linecap="round"/>'
      )
    }
  };

  function getChainMeta(chainKey) {
    const raw = String(chainKey || '').trim().toLowerCase();
    const canonical = CHAIN_ALIAS_MAP[raw] || raw;
    if (CHAIN_META[canonical]) {
      return CHAIN_META[canonical];
    }
    const label = (canonical || 'NET').toUpperCase().slice(0, 4);
    return {
      key: canonical || 'unknown',
      name: label,
      shortName: label,
      color: '#334155',
      textColor: '#FFFFFF',
      logoUrl: '',
      badgeSvg: makeChainBadgeSvg(
        '#334155',
        '#FFF',
        `<text x="8" y="10.2" text-anchor="middle" fill="#FFF" font-size="5.5" font-weight="800" font-family="system-ui,sans-serif">${escapeHtml(label.slice(0, 3))}</text>`
      )
    };
  }

  // ======================== Iridescent Pearl SVG & Token SVG Fallbacks ========================

  let _svgUid = 0;

  function getPearlIconSvg(size = 36) {
    const uid = ++_svgUid;
    const s = Number(size) || 36;
    return `<svg width="${s}" height="${s}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="rounded-full flex-shrink-0">
      <defs>
        <radialGradient id="prlShell_${uid}" cx="35%" cy="28%" r="72%" fx="30%" fy="24%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="32%" stop-color="#E0F7FA"/>
          <stop offset="65%" stop-color="#C7D2FE"/>
          <stop offset="88%" stop-color="#67E8F9"/>
          <stop offset="100%" stop-color="#0E7490"/>
        </radialGradient>
        <linearGradient id="prlRim_${uid}" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#A5F3FC" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="#E9D5FF" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#22D3EE" stop-opacity="0.9"/>
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="17.2" fill="url(#prlShell_${uid})" stroke="url(#prlRim_${uid})" stroke-width="1.5"/>
      <ellipse cx="12.5" cy="10.8" rx="5.2" ry="2.7" transform="rotate(-24 12.5 10.8)" fill="#FFFFFF" fill-opacity="0.72"/>
      <circle cx="9.2" cy="14.5" r="1.3" fill="#FFFFFF" fill-opacity="0.65"/>
      <path d="M13.6 10.8C10.5 10.8 8.4 13.1 8.4 16C8.4 18.9 10.5 21.2 13.6 21.2V10.8Z" fill="#0F172A" fill-opacity="0.88"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M15.4 10.8H20.6C24 10.8 26.2 12.9 26.2 16C26.2 19.1 24 21.2 20.6 21.2H18.4V24.6H20.6V26.2H13.6V24.6H15.4V10.8ZM18.4 12.8V19.2H20.4C22.3 19.2 23.4 18 23.4 16C23.4 14 22.3 12.8 20.4 12.8H18.4Z" fill="#0F172A" fill-opacity="0.88"/>
    </svg>`;
  }

  function getFallbackTokenIconSvg(symbol, blockchain = '', size = 36) {
    const sym = String(symbol || '?').toUpperCase();
    const s = Number(size) || 36;
    if (sym === 'PRL') return getPearlIconSvg(s);
    const meta = getChainMeta(blockchain);
    const bgMap = {
      USDT: '#26A17B',
      USDC: '#2775CA',
      BTC: '#F7931A',
      CBBTC: '#0052FF',
      ETH: '#627EEA',
      WETH: '#627EEA',
      SOL: '#141726',
      NEAR: '#00EC97',
      WNEAR: '#00EC97',
      BNB: '#F3BA2F',
      DAI: '#F5AC37',
      TRX: '#EB0029',
      ARB: '#12AAFF',
      HYPE: '#072723',
      PONS: '#10B981',
      USDG: '#16A34A',
      USDE: '#1E293B'
    };
    const bg = bgMap[sym] || meta.color || '#334155';
    const textColor = (sym === 'NEAR' || sym === 'WNEAR' || sym === 'BNB')
      ? '#000000'
      : (sym === 'HYPE' ? '#97FCE4' : '#FFFFFF');
    const label = escapeHtml(sym.slice(0, 4));
    const fontSize = label.length >= 4 ? 8.5 : (label.length === 3 ? 10 : 12);
    return `<svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="rounded-full flex-shrink-0"><circle cx="16" cy="16" r="16" fill="${bg}"/><text x="16" y="19.5" text-anchor="middle" fill="${textColor}" font-size="${fontSize}" font-weight="800" font-family="system-ui,-apple-system,sans-serif">${label}</text></svg>`;
  }

  function formatContractForTrustWallet(twChain, contractAddress) {
    const addr = String(contractAddress || '').trim();
    if (!addr) return '';
    if (twChain === 'solana') return addr;
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      const cryptoMod = (typeof globalThis !== 'undefined' && globalThis.NearCACrypto)
        ? globalThis.NearCACrypto
        : (typeof root !== 'undefined' && root.NearCACrypto ? root.NearCACrypto : null);
      if (cryptoMod && typeof cryptoMod.eip55ChecksumAddress === 'function') {
        try {
          return cryptoMod.eip55ChecksumAddress(addr);
        } catch (_) {}
      }
      return addr;
    }
    return '';
  }

  function resolveTokenIcon({ symbol, blockchain, logoURI, contractAddress } = {}) {
    const symUpper = String(symbol || '').trim().toUpperCase();
    const symClean = symUpper.replace(/^\$/, '');
    const symLower = symClean.toLowerCase();
    const contractLower = String(contractAddress || '').trim().toLowerCase();
    const chainKey = getChainMeta(blockchain).key;

    if (symClean === 'PRL') {
      return { primaryUrl: '', fallbackUrl: '', isPearlSvg: true };
    }

    const explicitUrl = sanitizeImageUrl(logoURI);
    const mappedUrl = TOKEN_ICON_MAP[symUpper]
      || TOKEN_ICON_MAP[symClean]
      || (contractLower ? DYNAMIC_ICON_BY_CONTRACT[contractLower] : '')
      || DYNAMIC_ICON_BY_SYMBOL[symUpper]
      || DYNAMIC_ICON_BY_SYMBOL[symClean]
      || '';

    const localFallback = getLocalFallbackIconUrl(symClean) || getLocalFallbackIconUrl(symUpper);
    const isStaleGeneratedSvg = Boolean(
      explicitUrl &&
      explicitUrl.startsWith('data:image/svg+xml') &&
      mappedUrl &&
      /^https?:\/\//i.test(mappedUrl) &&
      (explicitUrl === localFallback || explicitUrl.includes('dmlld0JveD0iMCAwIDMyIDMyIg') || explicitUrl.includes('viewBox="0 0 32 32"'))
    );
    const preferredOrder = isStaleGeneratedSvg
      ? [mappedUrl, explicitUrl]
      : [explicitUrl, mappedUrl];

    const unique = [];
    for (const u of preferredOrder) {
      if (u && !unique.includes(u)) unique.push(u);
    }

    if (unique.length < 2) {
      let contractTwUrl = '';
      const twChain = TRUSTWALLET_CHAIN_SLUGS[chainKey] || TRUSTWALLET_CHAIN_SLUGS[String(blockchain || '').toLowerCase()];
      if (twChain && contractAddress) {
        const formattedAddr = formatContractForTrustWallet(twChain, contractAddress);
        if (formattedAddr) {
          contractTwUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${twChain}/assets/${formattedAddr}/logo.png`;
        }
      }
      const ccIconsUrl = symLower && /^[a-z0-9]+$/.test(symLower)
        ? `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${symLower}.png`
        : '';
      for (const u of [contractTwUrl, ccIconsUrl, localFallback]) {
        if (u && !unique.includes(u)) unique.push(u);
      }
    }

    const primaryUrl = unique[0] || '';
    let fallbackUrl = unique[1] || '';
    if (primaryUrl && !primaryUrl.startsWith('data:image/') && localFallback && (!fallbackUrl || !fallbackUrl.startsWith('data:image/'))) {
      fallbackUrl = localFallback;
    }

    return {
      primaryUrl,
      fallbackUrl,
      isPearlSvg: false
    };
  }

  function renderTokenIconWithBadge(token = {}, size = 36, showChainBadge = true) {
    const opts = typeof token === 'string' ? { symbol: token } : (token || {});
    const symbol = opts.symbol || '?';
    const blockchain = opts.blockchain || opts.chain || '';
    const s = Number(size) || 36;
    const { primaryUrl, fallbackUrl, isPearlSvg } = resolveTokenIcon({
      symbol,
      blockchain,
      logoURI: opts.logoURI || opts.iconUrl || '',
      contractAddress: opts.contractAddress || ''
    });

    const fallbackSvg = getFallbackTokenIconSvg(symbol, blockchain, s);
    let iconInner;
    if (isPearlSvg) {
      iconInner = getPearlIconSvg(s);
    } else if (primaryUrl) {
      const safeAlt = escapeHtml(String(symbol).toUpperCase());
      const safeFb = escapeHtml(fallbackUrl);
      const hiddenFallbackSvg = fallbackSvg.replace('<svg ', '<svg style="display:none" ');
      iconInner = `<img src="${escapeHtml(primaryUrl)}" alt="${safeAlt}" data-fb="${safeFb}" width="${s}" height="${s}" style="width:${s}px;height:${s}px" class="rounded-full object-cover flex-shrink-0 bg-white/[0.06] token-img-fb" />${hiddenFallbackSvg}`;
    } else {
      iconInner = fallbackSvg;
    }

    const meta = blockchain ? getChainMeta(blockchain) : null;
    const badgeHtml = (showChainBadge && meta && meta.key !== 'unknown')
      ? `<span title="${escapeHtml(meta.name)}" class="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full overflow-hidden ring-2 ring-[#0B0F19] bg-[#0B0F19] flex items-center justify-center shadow-sm">${meta.badgeSvg}</span>`
      : '';

    return `<span class="relative inline-flex items-center justify-center flex-shrink-0" style="width:${s}px;height:${s}px"><span class="w-full h-full rounded-full overflow-hidden inline-flex items-center justify-center">${iconInner}</span>${badgeHtml}</span>`;
  }

  // ======================== Unified Token Catalog (Zero Fake Prices: price: null) ========================

  const UNIFIED_CORE_TOKENS = [
    {
      symbol: 'NEAR',
      name: 'NEAR Protocol',
      blockchain: 'near',
      assetId: 'nep141:wrap.near',
      contractAddress: 'wrap.near',
      decimals: 24,
      networkName: 'NEAR Protocol',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'near',
      assetId: 'nep141:usdt.tether-token.near',
      contractAddress: 'usdt.tether-token.near',
      decimals: 6,
      networkName: 'NEAR Protocol',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'near',
      assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      decimals: 6,
      networkName: 'NEAR Protocol',
      price: null
    },
    {
      symbol: 'PRL',
      name: 'Pearl Network',
      blockchain: 'prl',
      assetId: 'nep141:prl.omft.near',
      contractAddress: 'prl.omft.near',
      decimals: 8,
      networkName: 'Pearl Network',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'eth',
      assetId: 'nep141:eth.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.omft.near',
      contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      blockchain: 'eth',
      assetId: 'nep141:eth-0x6b175474e89094c44da98b954eedeac495271d0f.omft.near',
      contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'cbBTC',
      name: 'Coinbase Wrapped BTC',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near',
      contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      decimals: 8,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      blockchain: 'sol',
      assetId: 'nep141:sol.omft.near',
      contractAddress: 'So11111111111111111111111111111111111111112',
      decimals: 9,
      networkName: 'Solana',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'sol',
      assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
      contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      networkName: 'Solana',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'sol',
      assetId: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near',
      contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      decimals: 6,
      networkName: 'Solana',
      price: null
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      blockchain: 'btc',
      assetId: 'nep141:btc.omft.near',
      contractAddress: '',
      decimals: 8,
      networkName: 'Bitcoin',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'base',
      assetId: 'nep141:base.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Base',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'base',
      assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
      contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      networkName: 'Base',
      price: null
    },
    {
      symbol: 'cbBTC',
      name: 'Coinbase Wrapped BTC',
      blockchain: 'base',
      assetId: 'nep141:base-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near',
      contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      decimals: 8,
      networkName: 'Base',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'arb',
      assetId: 'nep141:arb.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Arbitrum',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'arb',
      assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
      contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
      networkName: 'Arbitrum',
      price: null
    },
    {
      symbol: 'ARB',
      name: 'Arbitrum',
      blockchain: 'arb',
      assetId: 'nep141:arb-0x912ce59144191c1204e64559fe8253a0e49e6548.omft.near',
      contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      decimals: 18,
      networkName: 'Arbitrum',
      price: null
    },
    {
      symbol: 'BNB',
      name: 'BNB',
      blockchain: 'bsc',
      assetId: 'nep141:bnb.omdep.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'BNB Smart Chain',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'bsc',
      assetId: 'nep141:bnb-0x55d398326f99059ff775485246999027b3197955.omdep.near',
      contractAddress: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
      networkName: 'BNB Smart Chain',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'bsc',
      assetId: 'nep141:bnb-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omdep.near',
      contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
      networkName: 'BNB Smart Chain',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'tron',
      assetId: 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near',
      contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      decimals: 6,
      networkName: 'TRON (TRC20)',
      price: null
    },
    {
      symbol: 'TRX',
      name: 'TRON',
      blockchain: 'tron',
      assetId: 'nep141:tron.omft.near',
      contractAddress: '',
      decimals: 6,
      networkName: 'TRON',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'hood',
      assetId: 'nep141:hood.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'PONS',
      name: 'Pons',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x39dbed3a2bd333467115de45665cc57f813c4571.omft.near',
      contractAddress: '0x39dBED3a2bd333467115dE45665cC57F813C4571',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'USDG',
      name: 'Global Dollar',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x5fc5360d0400a0fd4f2af552add042d716f1d168.omft.near',
      contractAddress: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      decimals: 6,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'CASHCAT',
      name: 'Cash Cat',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x020bfc650a365f8bb26819deaabf3e21291018b4.omft.near',
      contractAddress: '0x020bfc650a365f8bb26819deaabf3e21291018b4',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'USDe',
      name: 'Ethena USDe',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34.omft.near',
      contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'XRP',
      name: 'XRP',
      blockchain: 'xrp',
      assetId: 'nep141:xrp.omft.near',
      contractAddress: '',
      decimals: 6,
      networkName: 'XRP Ledger',
      price: null
    },
    {
      symbol: 'DOGE',
      name: 'Dogecoin',
      blockchain: 'doge',
      assetId: 'nep141:doge.omft.near',
      contractAddress: '',
      decimals: 8,
      networkName: 'Dogecoin',
      price: null
    },
    {
      symbol: 'SUI',
      name: 'Sui',
      blockchain: 'sui',
      assetId: 'nep141:sui.omft.near',
      contractAddress: '',
      decimals: 9,
      networkName: 'Sui',
      price: null
    },
    {
      symbol: 'APT',
      name: 'Aptos',
      blockchain: 'aptos',
      assetId: 'nep141:aptos.omft.near',
      contractAddress: '',
      decimals: 8,
      networkName: 'Aptos',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'ton',
      assetId: 'nep245:v2_1.omni.hot.tg:1117_3tsdfyziyc7EJbP2aULWSKU4toBaAcN4FdTgfm5W1mC4ouR',
      contractAddress: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
      decimals: 6,
      networkName: 'TON',
      price: null
    }
  ];

  const DEX_CHAIN_TOKENS = {
    near: [
      { symbol: 'PRL', name: 'Pearl Network (NEAR)', blockchain: 'near', assetId: '1cs_v1:near:nep141:prl.omft.near', contractAddress: 'prl.omft.near', decimals: 8, networkName: 'NEAR Protocol', price: null },
      { symbol: 'QTC', name: 'Quantus (NEAR)', blockchain: 'near', assetId: '1cs_v1:near:nep141:qtc.omft.near', contractAddress: 'qtc.omft.near', decimals: 12, networkName: 'NEAR Protocol', price: null },
      { symbol: 'NEAR', name: 'NEAR Protocol', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'near', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, networkName: 'NEAR Protocol', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'near', assetId: 'nep141:usdt.tether-token.near', contractAddress: 'usdt.tether-token.near', decimals: 6, networkName: 'NEAR Protocol', price: null },
      { symbol: 'RHEA', name: 'Rhea Finance', blockchain: 'near', assetId: '1cs_v1:near:nep141:token.rhealab.near', contractAddress: 'token.rhealab.near', decimals: 18, networkName: 'NEAR Protocol', price: null },
      { symbol: 'rNEAR', name: 'Rhea Staked NEAR', blockchain: 'near', assetId: '1cs_v1:near:nep141:lst.rhealab.near', contractAddress: 'lst.rhealab.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'xRHEA', name: 'Staked RHEA (xRHEA)', blockchain: 'near', assetId: '1cs_v1:near:nep141:xtoken.rhealab.near', contractAddress: 'xtoken.rhealab.near', decimals: 18, networkName: 'NEAR Protocol', price: null },
      { symbol: 'oRHEA', name: 'Option RHEA (oRHEA)', blockchain: 'near', assetId: '1cs_v1:near:nep141:otoken.rhealab.near', contractAddress: 'otoken.rhealab.near', decimals: 18, networkName: 'NEAR Protocol', price: null },
      { symbol: 'stNEAR', name: 'Meta Pool Staked NEAR', blockchain: 'near', assetId: 'nep141:meta-pool.near', contractAddress: 'meta-pool.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'LiNEAR', name: 'LiNEAR Staked NEAR', blockchain: 'near', assetId: 'nep141:linear-protocol.near', contractAddress: 'linear-protocol.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'NearX', name: 'Stader NearX', blockchain: 'near', assetId: 'nep141:v2-nearx.stader-labs.near', contractAddress: 'v2-nearx.stader-labs.near', decimals: 24, networkName: 'NEAR Protocol', price: null }
    ],
    sol: [
      { symbol: 'SOL', name: 'Solana', blockchain: 'sol', assetId: 'So11111111111111111111111111111111111111112', contractAddress: 'So11111111111111111111111111111111111111112', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'sol', assetId: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'sol', assetId: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'JUP', name: 'Jupiter', blockchain: 'sol', assetId: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', contractAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'JitoSOL', name: 'Jito Staked SOL', blockchain: 'sol', assetId: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', contractAddress: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'jupSOL', name: 'Jupiter Staked SOL', blockchain: 'sol', assetId: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', contractAddress: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'INF', name: 'Sanctum Infinity', blockchain: 'sol', assetId: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', contractAddress: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'mSOL', name: 'Marinade Staked SOL', blockchain: 'sol', assetId: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', contractAddress: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'RAY', name: 'Raydium', blockchain: 'sol', assetId: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', contractAddress: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'ORCA', name: 'Orca', blockchain: 'sol', assetId: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', contractAddress: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'PYTH', name: 'Pyth Network', blockchain: 'sol', assetId: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', contractAddress: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'JTO', name: 'Jito', blockchain: 'sol', assetId: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', contractAddress: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'BONK', name: 'Bonk', blockchain: 'sol', assetId: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, networkName: 'Solana', price: null },
      { symbol: 'WIF', name: 'dogwifhat', blockchain: 'sol', assetId: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', contractAddress: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'POPCAT', name: 'Popcat', blockchain: 'sol', assetId: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', contractAddress: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'MEW', name: 'cat in a dogs world', blockchain: 'sol', assetId: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', contractAddress: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', decimals: 5, networkName: 'Solana', price: null },
      { symbol: 'FARTCOIN', name: 'Fartcoin', blockchain: 'sol', assetId: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', contractAddress: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'TRUMP', name: 'OFFICIAL TRUMP', blockchain: 'sol', assetId: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', contractAddress: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'RENDER', name: 'Render Token', blockchain: 'sol', assetId: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', contractAddress: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', decimals: 8, networkName: 'Solana', price: null },
      { symbol: 'HNT', name: 'Helium', blockchain: 'sol', assetId: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', contractAddress: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', decimals: 8, networkName: 'Solana', price: null },
      { symbol: 'KMNO', name: 'Kamino', blockchain: 'sol', assetId: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS', contractAddress: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'DRIFT', name: 'Drift', blockchain: 'sol', assetId: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7', contractAddress: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'GRASS', name: 'Grass', blockchain: 'sol', assetId: 'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs', contractAddress: 'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'W', name: 'Wormhole', blockchain: 'sol', assetId: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', contractAddress: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'NVDAx', name: 'NVIDIA xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', contractAddress: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.NVDAX, price: null },
      { symbol: 'TSLAx', name: 'Tesla xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', contractAddress: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.TSLAX, price: null },
      { symbol: 'AAPLx', name: 'Apple xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', contractAddress: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.AAPLX, price: null },
      { symbol: 'MSFTx', name: 'Microsoft xStock', blockchain: 'sol', category: 'xstock', assetId: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', contractAddress: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.MSFTX, price: null },
      { symbol: 'GOOGLx', name: 'Alphabet xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', contractAddress: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.GOOGLX, price: null },
      { symbol: 'AMZNx', name: 'Amazon xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', contractAddress: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.AMZNX, price: null },
      { symbol: 'METAx', name: 'Meta xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', contractAddress: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.METAX, price: null },
      { symbol: 'SPYx', name: 'S&P 500 xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', contractAddress: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.SPYX, price: null },
      { symbol: 'QQQx', name: 'Nasdaq xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', contractAddress: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.QQQX, price: null },
      { symbol: 'MSTRx', name: 'MicroStrategy xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', contractAddress: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.MSTRX, price: null },
      { symbol: 'COINx', name: 'Coinbase xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', contractAddress: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.COINX, price: null },
      { symbol: 'PLTRx', name: 'Palantir xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4', contractAddress: 'XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.PLTRX, price: null },
      { symbol: 'HOODx', name: 'Robinhood xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg', contractAddress: 'XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.HOODX, price: null },
      { symbol: 'CRCLx', name: 'Circle xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1', contractAddress: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.CRCLX, price: null },
      { symbol: 'GLDx', name: 'Gold xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', contractAddress: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.GLDX, price: null },
      { symbol: 'SPCXx', name: 'SpaceX xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8', contractAddress: 'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.SPCXX, price: null }
    ],
    eth: [
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'eth', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'eth', assetId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, networkName: 'Ethereum', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'eth', assetId: '0xdAC17F958D2ee523a2206206994597C13D831ec7', contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, networkName: 'Ethereum', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'eth', assetId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'WBTC', name: 'Wrapped BTC', blockchain: 'eth', assetId: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, networkName: 'Ethereum', price: null },
      { symbol: 'stETH', name: 'Lido Staked ETH', blockchain: 'eth', assetId: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', contractAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'UNI', name: 'Uniswap', blockchain: 'eth', assetId: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', contractAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'LINK', name: 'Chainlink', blockchain: 'eth', assetId: '0x514910771AF9Ca656af840dff83E8264EcF986CA', contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'AAVE', name: 'Aave', blockchain: 'eth', assetId: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', contractAddress: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'PEPE', name: 'Pepe', blockchain: 'eth', assetId: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', contractAddress: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'LDO', name: 'Lido DAO', blockchain: 'eth', assetId: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', contractAddress: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'PENDLE', name: 'Pendle', blockchain: 'eth', assetId: '0x808507121B80c02388fAd14726482e061B8da827', contractAddress: '0x808507121B80c02388fAd14726482e061B8da827', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'CRV', name: 'Curve DAO', blockchain: 'eth', assetId: '0xD533a949740bb3306d119CC777fa900bA034cd52', contractAddress: '0xD533a949740bb3306d119CC777fa900bA034cd52', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'MKR', name: 'Maker', blockchain: 'eth', assetId: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', contractAddress: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'ENS', name: 'Ethereum Name Service', blockchain: 'eth', assetId: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', contractAddress: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'DAI', name: 'Dai Stablecoin', blockchain: 'eth', assetId: '0x6B175474E89094C44Da98b954EedeAC495271d0F', contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', blockchain: 'eth', assetId: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, networkName: 'Ethereum', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'eth', assetId: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', contractAddress: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'sUSDe', name: 'Staked USDe', blockchain: 'eth', assetId: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', contractAddress: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', decimals: 18, networkName: 'Ethereum', price: null }
    ],
    base: [
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'base', assetId: 'base:native:eth', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'base', assetId: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'EURC', name: 'Euro Coin', blockchain: 'base', assetId: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', contractAddress: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'base', assetId: '0x4200000000000000000000000000000000000006', contractAddress: '0x4200000000000000000000000000000000000006', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', blockchain: 'base', assetId: 'base:cbBTC', contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, networkName: 'Base', price: null },
      { symbol: 'AERO', name: 'Aerodrome', blockchain: 'base', assetId: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', contractAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'VIRTUAL', name: 'Virtuals Protocol', blockchain: 'base', assetId: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', contractAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'DEGEN', name: 'Degen', blockchain: 'base', assetId: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', contractAddress: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'BRETT', name: 'Brett', blockchain: 'base', assetId: '0x532f27101965dd16442E59d40670FaF5eBB142E4', contractAddress: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'MORPHO', name: 'Morpho', blockchain: 'base', assetId: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', contractAddress: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'USDbC', name: 'USD Base Coin', blockchain: 'base', assetId: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'DAI', name: 'Dai Stablecoin', blockchain: 'base', assetId: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, networkName: 'Base', price: null }
    ],
    arb: [
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'arb', assetId: 'arb:native:eth', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'arb', assetId: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, networkName: 'Arbitrum', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'arb', assetId: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, networkName: 'Arbitrum', price: null },
      { symbol: 'ARB', name: 'Arbitrum', blockchain: 'arb', assetId: '0x912CE59144191C1204E64559FE8253a0e49E6548', contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'arb', assetId: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'WBTC', name: 'Wrapped BTC', blockchain: 'arb', assetId: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', contractAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8, networkName: 'Arbitrum', price: null },
      { symbol: 'GMX', name: 'GMX', blockchain: 'arb', assetId: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', contractAddress: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'PENDLE', name: 'Pendle', blockchain: 'arb', assetId: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', contractAddress: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'LINK', name: 'Chainlink', blockchain: 'arb', assetId: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', contractAddress: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'UNI', name: 'Uniswap', blockchain: 'arb', assetId: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', contractAddress: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'DAI', name: 'Dai Stablecoin', blockchain: 'arb', assetId: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'wstETH', name: 'Wrapped stETH', blockchain: 'arb', assetId: '0x5979D7b546E38E414F7E9822514be443A4800529', contractAddress: '0x5979D7b546E38E414F7E9822514be443A4800529', decimals: 18, networkName: 'Arbitrum', price: null }
    ],
    bsc: [
      { symbol: 'BNB', name: 'BNB', blockchain: 'bsc', assetId: 'bsc:native:bnb', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'bsc', assetId: '0x55d398326f99059fF775485246999027B3197955', contractAddress: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'bsc', assetId: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'FDUSD', name: 'First Digital USD', blockchain: 'bsc', assetId: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', contractAddress: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'CAKE', name: 'PancakeSwap', blockchain: 'bsc', assetId: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', contractAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'BTCB', name: 'Bitcoin BEP20', blockchain: 'bsc', assetId: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', contractAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'ETH', name: 'Ethereum Token', blockchain: 'bsc', assetId: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', contractAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'WBNB', name: 'Wrapped BNB', blockchain: 'bsc', assetId: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', contractAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'SOL', name: 'Wrapped SOL (BSC)', blockchain: 'bsc', assetId: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF', contractAddress: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'XRP', name: 'XRP Token (BSC)', blockchain: 'bsc', assetId: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', contractAddress: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'DOGE', name: 'Dogecoin (BSC)', blockchain: 'bsc', assetId: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', contractAddress: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', decimals: 8, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'LINK', name: 'Chainlink (BSC)', blockchain: 'bsc', assetId: '0xf8a0bf9Cf54bb92f17374D9e9a326e6a511a1D2B', contractAddress: '0xf8a0bf9Cf54bb92f17374D9e9a326e6a511a1D2B', decimals: 18, networkName: 'BNB Smart Chain', price: null }
    ],
    hype: [
      { symbol: 'HYPE', name: 'HYPE (HyperEVM)', blockchain: 'hype', assetId: 'hype:native:hype', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'WHYPE', name: 'Wrapped HYPE', blockchain: 'hype', assetId: '0x5555555555555555555555555555555555555555', contractAddress: '0x5555555555555555555555555555555555555555', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'hype', assetId: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', contractAddress: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6, networkName: 'HyperEVM', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'hype', assetId: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'kHYPE', name: 'Kinetiq Staked HYPE', blockchain: 'hype', assetId: '0xfD739d4e423301CE9385c1fb8850539D657C296D', contractAddress: '0xfD739d4e423301CE9385c1fb8850539D657C296D', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'PURR', name: 'Purr', blockchain: 'hype', assetId: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', contractAddress: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', decimals: 18, networkName: 'HyperEVM', price: null }
    ],
    hood: [
      { symbol: 'ETH', name: 'ETH (Robinhood)', blockchain: 'hood', assetId: 'hood:native:eth', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'PONS', name: 'Pons', blockchain: 'hood', assetId: '0x39dBED3a2bd333467115dE45665cC57F813C4571', contractAddress: '0x39dBED3a2bd333467115dE45665cC57F813C4571', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'USDG', name: 'Global Dollar', blockchain: 'hood', assetId: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', contractAddress: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6, networkName: 'Robinhood Chain', price: null },
      { symbol: 'CASHCAT', name: 'Cash Cat', blockchain: 'hood', assetId: '0x020bfc650a365f8bb26819deaabf3e21291018b4', contractAddress: '0x020bfc650a365f8bb26819deaabf3e21291018b4', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'hood', assetId: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', contractAddress: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'hood', assetId: 'hood:USDe', contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', contractAddressChecksum: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', blockchain: 'hood', assetId: '0xcec185eb182c47d1ba1efc84e6959e18cd620be4', contractAddress: '0xcec185eb182c47d1ba1efc84e6959e18cd620be4', decimals: 8, networkName: 'Robinhood Chain', price: null }
    ],
    arc: [
      { symbol: 'USDC', name: 'USD Coin (Arc Native Gas)', blockchain: 'arc', assetId: 'arc:0x3600000000000000000000000000000000000000', contractAddress: '0x3600000000000000000000000000000000000000', decimals: 6, networkName: 'Arc Network', price: null },
      { symbol: 'EURC', name: 'Euro Coin (Circle)', blockchain: 'arc', assetId: 'arc:0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1', contractAddress: '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1', decimals: 6, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/3cb13e14-b165-4305-a272-d4fa03ca58051789468881141.png', price: null },
      { symbol: 'cirBTC', name: 'Circle Wrapped Bitcoin', blockchain: 'arc', assetId: 'arc:0x171a4217b86a807a64eb94757db6849fb4bdbaa0', contractAddress: '0x171a4217b86a807a64eb94757db6849fb4bdbaa0', decimals: 8, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/0ec4d0f8-8eee-4c73-a496-9582ee163b4f1789469942218.png', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether (Arc)', blockchain: 'arc', assetId: 'arc:0x128cc466b61f542da60c70e3aa11c10e19b84edb', contractAddress: '0x128cC466B61f542da60c70e3aA11c10e19B84EDB', decimals: 18, networkName: 'Arc Network', price: null },
      { symbol: 'CRCL', name: 'Circle Internet Group • Arc', blockchain: 'arc', assetId: 'arc:0x2ba0f44bdfc17fba30eda9cdbecb908ca45b043b', contractAddress: '0x2ba0f44bdfc17fba30eda9cdbecb908ca45b043b', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/247b9047-7b4b-4d49-a76b-222cca81da221789554277062.jpg', price: null },
      { symbol: 'steakUSDC', name: 'Steakhouse Prime USDC', blockchain: 'arc', assetId: 'arc:0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', contractAddress: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', decimals: 18, networkName: 'Arc Network', price: null },
      { symbol: 'AF', name: 'Arcflow', blockchain: 'arc', assetId: 'arc:0x75d658f8101fbe6dc217fbba7e20a0312af5fa2e', contractAddress: '0x75d658f8101fbe6dc217fbba7e20a0312af5fa2e', decimals: 18, networkName: 'Arc Network', logoURI: 'https://coin-images.coingecko.com/coins/images/102178819/large/flow.jpg?1790407099', price: null },
      { symbol: 'ARCMAN', name: 'Arc-man', blockchain: 'arc', assetId: 'arc:0x5849fd68a097b3ee7d87ce88a0fcbb76857648ff', contractAddress: '0x5849fd68a097b3ee7d87ce88a0fcbb76857648ff', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/ac551882-4fce-4fbf-a029-a834f988175d1790237560158.jpg', price: null },
      { symbol: 'ARCOON', name: 'Arcoon', blockchain: 'arc', assetId: 'arc:0x4621a0baa0b5d97aae77704cf2a84dabe78a4fed', contractAddress: '0x4621a0baa0b5d97aae77704cf2a84dabe78a4fed', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/97b87e78-ba43-4a0b-b4af-f9becc43cb921793085332110.jpg', price: null },
      { symbol: 'ARGUS', name: 'Argus', blockchain: 'arc', assetId: 'arc:0xece5ca8bf9220718e5727754026757512212cb3c', contractAddress: '0xece5ca8bf9220718e5727754026757512212cb3c', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/40fa2d83-404f-41a0-bdaf-0d76a4929ff41789532423899.jpg', price: null },
      { symbol: 'ASTOCK', name: 'ArcStocks', blockchain: 'arc', assetId: 'arc:0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222', contractAddress: '0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/39fe8e2d-5219-4a95-828b-702f8bfe938a1790137134871.jpg', price: null },
      { symbol: 'TOLLY', name: 'Tolly', blockchain: 'arc', assetId: 'arc:0xbc43ce8dec648ea298c4275559b81d6261c90b67', contractAddress: '0xbc43ce8dec648ea298c4275559b81d6261c90b67', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/2c3fc4ac-ffc0-481d-8f22-6cbf03f3093a1789532377125.jpg', price: null },
      { symbol: 'FAZE', name: 'Faze', blockchain: 'arc', assetId: 'arc:0x394d38f807ee0027a182216f5e67a15ae441fa2e', contractAddress: '0x394d38f807ee0027a182216f5e67a15ae441fa2e', decimals: 18, networkName: 'Arc Network', logoURI: 'https://s2.coinmarketcap.com/static/img/coins/64x64/42345.png', price: null },
      { symbol: 'KAIRO', name: 'Kairo', blockchain: 'arc', assetId: 'arc:0x3ead4e80e9e5bc0e01682d7ee74c4881b040d3ea', contractAddress: '0x3ead4e80e9e5bc0e01682d7ee74c4881b040d3ea', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/68e325d5-cd4f-460e-ac86-e7b8d7f948741789554613087.jpg', price: null },
      { symbol: 'LONG', name: 'LONG', blockchain: 'arc', assetId: 'arc:0x2164bb17a2d38c1b5170e987b2c0416df1efc752', contractAddress: '0x2164bb17a2d38c1b5170e987b2c0416df1efc752', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/2b139c52-f887-4e96-b351-82062e3cbaac1789532445302.jpg', price: null },
      { symbol: 'oBrain', name: 'oBrain', blockchain: 'arc', assetId: 'arc:0x28f986a61e078795639f239675582a12b4cf7f01', contractAddress: '0x28f986a61e078795639f239675582a12b4cf7f01', decimals: 18, networkName: 'Arc Network', logoURI: 'https://coin-images.coingecko.com/coins/images/102178559/large/1000020833.jpg?1789978080', price: null },
      { symbol: 'MALA', name: 'Malachite', blockchain: 'arc', assetId: 'arc:0x4f7dc89dc44ad08c20d9680d2ee9cfad69bfda55', contractAddress: '0x4f7dc89dc44ad08c20d9680d2ee9cfad69bfda55', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/73e47fb4-0c87-45c7-a7d0-649d08e3c5131789704863682.jpg', price: null },
      { symbol: 'DUKE', name: 'The Duke of Arc', blockchain: 'arc', assetId: 'arc:0x41358defd0dedc90528b3f1835715e907b686e6a', contractAddress: '0x41358defd0dedc90528b3f1835715e907b686e6a', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/6d05fda0-71c8-46ee-b74f-f0c1256188d81789704701735.jpg', price: null },
      { symbol: 'ARCUS', name: 'Arcus Network', blockchain: 'arc', assetId: 'arc:0xb7c934ff18730c24e6113bb4bc5a68feef16fd29', contractAddress: '0xb7c934ff18730c24e6113bb4bc5a68feef16fd29', decimals: 18, networkName: 'Arc Network', logoURI: 'https://coin-images.coingecko.com/coins/images/102178538/large/8zcl45cyifee1l43r937gdp2gf1d.?1789888138', price: null }
    ]
  };

  let _liveDefuseTokens = [];
  const _byAssetId = new Map();
  const _byChainAssetId = new Map();
  const _byChainContract = new Map();
  const _bySymbol = new Map();

  function _indexToken(tok) {
    if (!tok || !tok.assetId) return;
    const chain = getChainMeta(tok.blockchain || '').key;
    const aid = String(tok.assetId).trim().toLowerCase();
    const contract = tok.contractAddress ? String(tok.contractAddress).trim().toLowerCase() : '';
    const sym = tok.symbol ? String(tok.symbol).trim().toLowerCase() : '';
    if (!_byAssetId.has(aid)) _byAssetId.set(aid, tok);
    if (chain) {
      const caKey = `${chain}|${aid}`;
      if (!_byChainAssetId.has(caKey)) _byChainAssetId.set(caKey, tok);
      if (contract) {
        const ccKey = `${chain}|${contract}`;
        if (!_byChainContract.has(ccKey)) _byChainContract.set(ccKey, tok);
      }
    }
    if (sym && !_bySymbol.has(sym)) _bySymbol.set(sym, tok);
  }

  function rebuildTokenIndexes() {
    _byAssetId.clear();
    _byChainAssetId.clear();
    _byChainContract.clear();
    _bySymbol.clear();
    for (const t of _liveDefuseTokens) _indexToken(t);
    for (const t of UNIFIED_CORE_TOKENS) _indexToken(t);
    for (const list of Object.values(DEX_CHAIN_TOKENS)) {
      if (Array.isArray(list)) {
        for (const t of list) _indexToken(t);
      }
    }
  }

  const _CANON_PRICE_SYM_MAP = {
    WNEAR: 'NEAR',
    WETH: 'ETH',
    WBTC: 'BTC',
    BTCB: 'BTC',
    CBBTC: 'BTC',
    CIRBTC: 'BTC',
    WSOL: 'SOL',
    WBNB: 'BNB',
    WHYPE: 'HYPE',
    USDBC: 'USDC',
    WUSDC: 'USDC',
    WMATIC: 'POL',
    MATIC: 'POL',
    WAVAX: 'AVAX'
  };

  function syncPricesToStaticCatalogs(liveList) {
    if (!Array.isArray(liveList) || liveList.length === 0) return;
    const byAsset = new Map();
    const byChainContract = new Map();
    const byExactSym = new Map();
    const byCanonSym = new Map();

    for (const item of liveList) {
      if (!item || typeof item !== 'object') continue;
      const aid = String(item.assetId || '').trim().toLowerCase();
      const chainKey = getChainMeta(item.blockchain || '').key;
      const contract = String(item.contractAddress || '').trim().toLowerCase();
      const sym = String(item.symbol || '').trim().toUpperCase().replace(/^\$/, '');
      const hasPrice = typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0;
      if (aid && !byAsset.has(aid)) byAsset.set(aid, item);
      if (chainKey && contract && !byChainContract.has(`${chainKey}|${contract}`)) {
        byChainContract.set(`${chainKey}|${contract}`, item);
      }
      if (hasPrice && sym) {
        if (!byExactSym.has(sym)) byExactSym.set(sym, item);
        const canon = _CANON_PRICE_SYM_MAP[sym] || sym;
        if (!byCanonSym.has(canon)) byCanonSym.set(canon, item);
      }
    }

    const applyToToken = (tok) => {
      if (!tok || typeof tok !== 'object') return;
      const aid = String(tok.assetId || '').trim().toLowerCase();
      const chainKey = getChainMeta(tok.blockchain || '').key;
      const contract = String(tok.contractAddress || '').trim().toLowerCase();
      const sym = String(tok.symbol || '').trim().toUpperCase().replace(/^\$/, '');
      const canon = _CANON_PRICE_SYM_MAP[sym] || sym;
      const exactMatch = (aid && byAsset.get(aid))
        || (chainKey && contract && byChainContract.get(`${chainKey}|${contract}`))
        || null;
      const symMatch = (sym && byExactSym.get(sym)) || (canon && byCanonSym.get(canon)) || null;
      const match = (exactMatch && typeof exactMatch.price === 'number' && exactMatch.price > 0)
        ? exactMatch
        : (symMatch || exactMatch);
      if (!match) return;
      if (typeof match.price === 'number' && Number.isFinite(match.price) && match.price > 0) {
        tok.price = match.price;
        if (match.priceUpdatedAt) tok.priceUpdatedAt = match.priceUpdatedAt;
      }
      if (!tok.logoURI && match.logoURI) {
        const safeLogo = sanitizeImageUrl(match.logoURI);
        const isMappedRemote = Boolean(sym && TOKEN_ICON_MAP[sym] && /^https?:\/\//i.test(TOKEN_ICON_MAP[sym]));
        const isGeneratedSvg = Boolean(
          safeLogo &&
          safeLogo.startsWith('data:image/svg+xml') &&
          (isMappedRemote || safeLogo.includes('dmlld0JveD0iMCAwIDMyIDMyIg') || safeLogo.includes('viewBox="0 0 32 32"'))
        );
        if (safeLogo && !isGeneratedSvg) tok.logoURI = safeLogo;
      }
    };

    for (const t of UNIFIED_CORE_TOKENS) applyToToken(t);
    for (const list of Object.values(DEX_CHAIN_TOKENS)) {
      if (Array.isArray(list)) {
        for (const t of list) applyToToken(t);
      }
    }
  }

  function setLiveDefuseTokens(list) {
    _liveDefuseTokens = Array.isArray(list) ? list.filter(t => t && t.assetId) : [];
    syncPricesToStaticCatalogs(_liveDefuseTokens);
    rebuildTokenIndexes();
  }

  function getAllCoreTokens() {
    return UNIFIED_CORE_TOKENS.map(t => ({ ...t }));
  }

  function getDexTokensForChain(chainKey = 'sol') {
    const meta = getChainMeta(chainKey);
    const list = DEX_CHAIN_TOKENS[meta.key] || DEX_CHAIN_TOKENS[String(chainKey || '').toLowerCase()] || [];
    return list.map(t => ({ ...t }));
  }

  function findTokenByAssetId(assetId, blockchainOrExtraTokens = [], maybeExtraTokens = []) {
    const id = String(assetId || '').trim();
    if (!id) return null;
    if (!_byAssetId.size) rebuildTokenIndexes();
    const blockchain = typeof blockchainOrExtraTokens === 'string'
      ? getChainMeta(blockchainOrExtraTokens).key
      : '';
    const extraTokens = Array.isArray(blockchainOrExtraTokens)
      ? blockchainOrExtraTokens
      : (Array.isArray(maybeExtraTokens) ? maybeExtraTokens : []);
    const lower = id.toLowerCase();
    if (extraTokens.length) {
      if (blockchain) {
        const exactExtra = extraTokens.find(
          t => t && String(t.assetId || '').toLowerCase() === lower && getChainMeta(t.blockchain || '').key === blockchain
        );
        if (exactExtra) return exactExtra;
      }
      const foundExtra = extraTokens.find(t => t && String(t.assetId || '').toLowerCase() === lower);
      if (foundExtra) return foundExtra;
    }
    if (blockchain) {
      const byChainAid = _byChainAssetId.get(`${blockchain}|${lower}`);
      if (byChainAid) return byChainAid;
      const byChainContract = _byChainContract.get(`${blockchain}|${lower}`);
      if (byChainContract) return byChainContract;
    }
    return _byAssetId.get(lower) || null;
  }

  function getSupportedChains() {
    return ['near', 'eth', 'sol', 'base', 'arb', 'bsc', 'btc', 'tron', 'hype', 'hood', 'arc', 'prl', 'qtc']
      .map(k => CHAIN_META[k]);
  }

  const NearCATokens = {
    TOKEN_ICON_MAP,
    CHAIN_META,
    UNIFIED_CORE_TOKENS,
    DEX_CHAIN_TOKENS,
    getChainMeta,
    getPearlIconSvg,
    getFallbackTokenIconSvg,
    sanitizeImageUrl,
    registerDynamicTokenIcons,
    setLiveDefuseTokens,
    resolveTokenIcon,
    renderTokenIconWithBadge,
    getAllCoreTokens,
    getDexTokensForChain,
    findTokenByAssetId,
    getSupportedChains
  };

  if (root) {
    root.NearCATokens = NearCATokens;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCATokens = NearCATokens;
  }
  if (typeof window !== 'undefined') {
    window.NearCATokens = NearCATokens;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NearCATokens;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
