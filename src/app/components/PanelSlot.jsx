import { h } from 'preact';
import { usePanelProps } from '../store/useWalletStore.js';

export function PanelSlot({ slotId, component: Comp, renderEmpty = null }) {
  const props = usePanelProps(slotId);
  if (props === null || props === undefined) {
    return renderEmpty;
  }
  return h(Comp, props);
}

export default PanelSlot;
