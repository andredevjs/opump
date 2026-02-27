import { Wallet, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWalletStore } from '@/stores/wallet-store';
import { shortenAddress, formatBtc } from '@/lib/format';

export function WalletButton() {
  const { connected, address, balanceSats, connect, disconnect } = useWalletStore();

  if (connected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-elevated border border-border text-sm">
          <span className="font-mono text-accent">{formatBtc(balanceSats)}</span>
          <span className="text-text-muted">|</span>
          <span className="font-mono text-text-secondary">{shortenAddress(address, 4)}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={disconnect}>
          <LogOut size={16} />
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={connect} size="sm">
      <Wallet size={16} className="mr-2" />
      Connect Wallet
    </Button>
  );
}
