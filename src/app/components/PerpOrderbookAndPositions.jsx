import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';

export function PerpOrderbookSidePanel({ rows = [], renderRowHtml }) {
  useWalletState(['perp']);
  return (
    <div className="flex flex-col">
      {rows.map((row, idx) => {
        const html = typeof renderRowHtml === 'function' ? renderRowHtml(row) : '';
        return <div key={`${row.px}_${idx}`} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

export function PerpBottomListPanel({ items = [], renderItemHtml, emptyText = '' }) {
  useWalletState(['perp', 'lang']);
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
        {emptyText || '--'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => {
        const key = item.oid || item.tid || item.coin || idx;
        const html = typeof renderItemHtml === 'function' ? renderItemHtml(item) : '';
        return <div key={key} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
