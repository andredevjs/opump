import { useState, useEffect } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Gift } from 'lucide-react';
import { formatBtc, formatTokenAmount } from '@/lib/format';

interface MinterRewardCardProps {
  tokenAddress: string;
}

export function MinterRewardCard({ tokenAddress }: MinterRewardCardProps) {
  const { connected, address: walletAddress, hashedMLDSAKey, publicKey } = useWalletStore();
  const [claiming, setClaiming] = useState(false);
  const [minterInfo, setMinterInfo] = useState<{ shares: string; eligible: boolean } | null>(null);
  const [minterPoolSats, setMinterPoolSats] = useState<number | null>(null);
  const [claimResult, setClaimResult] = useState<string | null>(null);
  // W10: error state for data loading failures
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !walletAddress || !hashedMLDSAKey) return;
    setError(null);
    (async () => {
      const { getLaunchTokenContract } = await import('@/services/contract');
      const { Address } = await import('@btc-vision/transaction');
      const contract = getLaunchTokenContract(tokenAddress);
      const addr = Address.fromString(hashedMLDSAKey, publicKey ?? undefined);

      // Fetch minter info and fee pool independently so one failure doesn't block the other
      try {
        const result = await contract.getMinterInfo(addr);
        setMinterInfo({
          shares: String(result.properties.shares ?? '0'),
          eligible: Boolean(result.properties.eligible),
        });
      } catch (err) {
        console.warn('[MinterRewardCard] getMinterInfo failed:', err);
        setError('Failed to load minter data');
      }

      try {
        const poolResult = await contract.getFeePools();
        setMinterPoolSats(Number(poolResult.properties.minterFees));
      } catch (err) {
        console.warn('[MinterRewardCard] getFeePools failed:', err);
      }
    })();
  }, [connected, walletAddress, hashedMLDSAKey, publicKey, tokenAddress]);

  if (!connected) return null;
  if (minterInfo && minterInfo.shares === '0') return null;

  const handleClaim = async () => {
    if (!walletAddress) return;
    setClaiming(true);
    setClaimResult(null);
    try {
      const { getLaunchTokenContract, sendContractCall } = await import('@/services/contract');
      const contract = getLaunchTokenContract(tokenAddress);
      const sim = await contract.claimMinterReward();
      const receipt = await sendContractCall(sim, {
        refundTo: walletAddress,
      });
      setClaimResult(`Claimed! Tx: ${receipt.txHash.slice(0, 12)}...`);
    } catch (err) {
      setClaimResult(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Gift size={16} className="text-accent" />
        <h3 className="text-sm font-medium text-text-secondary">Minter Rewards</h3>
      </div>
      <p className="text-xs text-text-muted mb-2">
        Early buyers in the first ~30 days earn a share of minter fees proportional to their purchase.
      </p>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {minterPoolSats !== null && (
        <p className="text-sm font-mono text-text-primary mb-2">
          Pool: {formatBtc(minterPoolSats)}
        </p>
      )}
      {/* W14: Use formatTokenAmount instead of parseInt for potentially large u256 shares */}
      {minterInfo && minterInfo.shares !== '0' && (
        <p className="text-xs text-text-secondary mb-2">
          Your shares: {formatTokenAmount(minterInfo.shares)}
        </p>
      )}
      {minterInfo && !minterInfo.eligible && (
        <p className="text-xs text-yellow-400 mb-2">Hold period not yet met. Keep holding!</p>
      )}
      {claimResult && (
        <p className="text-xs text-text-secondary mb-2">{claimResult}</p>
      )}
      <Button
        size="sm"
        variant="secondary"
        onClick={handleClaim}
        disabled={claiming || (minterInfo !== null && !minterInfo.eligible)}
        className="w-full"
      >
        {claiming ? 'Claiming...' : 'Claim Minter Reward'}
      </Button>
    </Card>
  );
}
