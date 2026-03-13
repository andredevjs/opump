import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BigNumber from 'bignumber.js';
import { Copy, Check, ExternalLink, LogOut, Coins } from 'lucide-react';
import { useWalletStore } from '@/stores/wallet-store';
import { getKnownTokenAddresses } from '@/stores/trade-store';
import { formatBtc, formatTokenAmount, shortenAddress } from '@/lib/format';
import { mapApiTokenToToken } from '@/lib/mappers';
import * as api from '@/services/api';
import type { Token } from '@/types/token';

interface HoldingEntry {
  address: string;
  units: string;
  token: Token | null;
}

interface WalletPopoverContentProps {
  onClose: () => void;
}

export function WalletPopoverContent({ onClose }: WalletPopoverContentProps) {
  const navigate = useNavigate();
  const { address, balanceSats, disconnect, hashedMLDSAKey, publicKey } = useWalletStore();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<HoldingEntry[]>([]);
  const fetched = useRef(false);

  // Fetch everything into local state only — no global store mutations
  useEffect(() => {
    if (!hashedMLDSAKey || !publicKey || fetched.current) return;
    fetched.current = true;

    const addresses = getKnownTokenAddresses();
    if (addresses.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Fetch balances and metadata in parallel, all into local state
    import('@/services/contract').then(({ fetchBalanceOf }) => {
      const promises = addresses.map(async (addr) => {
        const [balance, token] = await Promise.all([
          fetchBalanceOf(addr, hashedMLDSAKey, publicKey).catch(() => '0'),
          api.getToken(addr).then(mapApiTokenToToken).catch(() => null),
        ]);
        return { address: addr, units: balance, token };
      });

      Promise.all(promises).then((results) => {
        if (cancelled) return;
        // Only show non-zero holdings
        setEntries(results.filter((e) => e.units !== '0'));
        setLoading(false);
      });
    });

    return () => { cancelled = true; };
  }, [hashedMLDSAKey, publicKey]);

  const handleCopy = useCallback(async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const handleNavigateToken = useCallback((tokenAddress: string) => {
    navigate(`/token/${tokenAddress}`);
    onClose();
  }, [navigate, onClose]);

  const handleViewProfile = useCallback(() => {
    navigate(`/profile/${address}`);
    onClose();
  }, [navigate, address, onClose]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  return (
    <div className="w-72 sm:w-80">
      {/* Header — address + BTC balance */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-sm font-mono text-text-secondary hover:text-text-primary transition-colors"
          >
            {shortenAddress(address ?? '', 6)}
            {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-lg font-semibold font-mono text-accent">{formatBtc(balanceSats)}</p>
      </div>

      {/* Holdings list */}
      <div className="px-2 py-2 max-h-64 overflow-y-auto">
        <p className="px-2 mb-1 text-xs font-medium text-text-muted uppercase tracking-wider">
          Holdings
        </p>

        {loading ? (
          <div className="space-y-2 px-2 py-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-elevated" />
                  <div className="space-y-1">
                    <div className="w-20 h-3 rounded bg-elevated" />
                    <div className="w-12 h-2.5 rounded bg-elevated" />
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <div className="w-16 h-3 rounded bg-elevated" />
                  <div className="w-12 h-2.5 rounded bg-elevated" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-text-muted">
            <Coins size={24} />
            <p className="text-sm">No holdings yet — buy some tokens!</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {entries.map(({ address: tokenAddress, units, token }) => {
              if (!token) {
                return (
                  <div
                    key={tokenAddress}
                    className="w-full flex items-center justify-between px-2 py-2 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-elevated" />
                      <span className="text-xs font-mono text-text-muted">
                        {shortenAddress(tokenAddress, 4)}
                      </span>
                    </div>
                    <p className="text-sm font-mono text-text-primary">{formatTokenAmount(units)}</p>
                  </div>
                );
              }

              const valueSats = new BigNumber(units).times(token.currentPriceSats).toNumber();

              return (
                <button
                  key={tokenAddress}
                  onClick={() => handleNavigateToken(tokenAddress)}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-elevated transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl flex-shrink-0">{token.image}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{token.name}</p>
                      <p className="text-xs text-text-muted">${token.symbol}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-sm font-mono text-text-primary">{formatTokenAmount(units)}</p>
                    <p className="text-xs font-mono text-text-secondary">{formatBtc(valueSats)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — View Profile + Disconnect */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <button
          onClick={handleViewProfile}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors"
        >
          <ExternalLink size={14} />
          View Profile
        </button>
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-1.5 text-sm text-red hover:text-red/80 transition-colors"
        >
          <LogOut size={14} />
          Disconnect
        </button>
      </div>
    </div>
  );
}
