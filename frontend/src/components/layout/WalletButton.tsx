import { useState } from 'react';
import { Wallet } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { Button } from '@/components/ui/Button';
import { useWalletStore } from '@/stores/wallet-store';
import { shortenAddress, formatUsd } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';
import { WalletPopoverContent } from './WalletPopover';

export function WalletButton() {
  const { connected, address, balanceSats, connect } = useWalletStore();
  const { btcPrice } = useBtcPrice();
  const [open, setOpen] = useState(false);

  if (connected && address) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-elevated border border-border text-sm cursor-pointer hover:border-accent/50 transition-colors">
            <span className="font-mono text-accent">{formatUsd(balanceSats, btcPrice)}</span>
            <span className="text-text-muted">|</span>
            <span className="font-mono text-text-secondary">{shortenAddress(address, 4)}</span>
          </button>
        </Popover.Trigger>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="bg-card border border-border rounded-xl shadow-lg z-50"
        >
          <WalletPopoverContent onClose={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Root>
    );
  }

  return (
    <Button onClick={connect} size="sm">
      <Wallet size={16} className="mr-2" />
      Connect Wallet
    </Button>
  );
}
