import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';

export function TokenPickerPanel({ rows = [], renderRowHtml, emptyText = '' }) {
  useWalletState(['picker', 'lang']);
  if (!Array.isArray(rows) || rows.length === 0) {
    return emptyText ? (
      <div className="text-muted" style={{ textAlign: 'center', padding: '16px', fontSize: '12px' }}>
        {emptyText}
      </div>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, idx) => {
        const tok = row && row.tok ? row.tok : row;
        const key = (tok && (tok.assetId || tok.contractAddress || `${tok.blockchain}_${tok.symbol}`)) || idx;
        const html = typeof renderRowHtml === 'function' ? renderRowHtml(row) : '';
        return <div key={key} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
