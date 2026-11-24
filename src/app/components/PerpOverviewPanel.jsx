import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';

export function PerpOverviewPanel({ rows = [], renderMarketRowHtml, emptyText = '' }) {
  useWalletState(['perp', 'lang']);
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '14px 0' }}>
        {emptyText || '--'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((m, idx) => {
        const html = typeof renderMarketRowHtml === 'function' ? renderMarketRowHtml(m) : '';
        return <div key={m.name || idx} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
