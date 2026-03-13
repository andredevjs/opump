import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PriceChart } from '@/components/chart/PriceChart';
import { ChartControls } from '@/components/chart/ChartControls';
import { TradePanel } from '@/components/trade/TradePanel';
import { TradeHistory } from '@/components/trade/TradeHistory';
import { TokenPrice } from '@/components/token/TokenPrice';
import { TokenBadge } from '@/components/token/TokenBadge';
import { GraduationProgress } from '@/components/shared/GraduationProgress';
import { BondingCurveVisual } from '@/components/shared/BondingCurveVisual';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { usePriceFeed } from '@/hooks/use-price-feed';
import { formatBtc, formatNumber, timeAgo } from '@/lib/format';
import type { TimeframeKey } from '@/types/api';
import { Globe, Twitter, Send, MessageCircle, Github, Gift, Coins } from 'lucide-react';
import { useWalletStore } from '@/stores/wallet-store';
import { Button } from '@/components/ui/Button';

import type { OHLCVCandle } from '@/types/api';

const MOTOSWAP_URL = import.meta.env.VITE_MOTOSWAP_URL || '';
const EMPTY_CANDLES: OHLCVCandle[] = [];

function MinterRewardCard({ tokenAddress }: { tokenAddress: string }) {
  const { connected, address: walletAddress, hashedMLDSAKey, publicKey } = useWalletStore();
  const [claiming, setClaiming] = useState(false);
  const [minterInfo, setMinterInfo] = useState<{ shares: string; eligible: boolean } | null>(null);
  const [minterPoolSats, setMinterPoolSats] = useState<number | null>(null);
  const [claimResult, setClaimResult] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !walletAddress || !hashedMLDSAKey) return;
    // Fetch minter info and fee pool from contract
    (async () => {
      try {
        const { getLaunchTokenContract } = await import('@/services/contract');
        const { Address } = await import('@btc-vision/transaction');
        const contract = getLaunchTokenContract(tokenAddress);
        const addr = Address.fromString(hashedMLDSAKey, publicKey ?? undefined);
        const result = await contract.getMinterInfo(addr);
        setMinterInfo({
          shares: String(result.properties.shares ?? '0'),
          eligible: Boolean(result.properties.eligible),
        });

        // Fetch on-chain fee pool totals instead of iterating trades
        const poolResult = await contract.getFeePools();
        setMinterPoolSats(Number(poolResult.properties.minterFees));
      } catch {
        // Silently fail — user may not be a minter
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
      {minterPoolSats !== null && (
        <p className="text-sm font-mono text-text-primary mb-2">
          Pool: {formatBtc(minterPoolSats)}
        </p>
      )}
      {minterInfo && minterInfo.shares !== '0' && (
        <p className="text-xs text-text-secondary mb-2">
          Your shares: {formatNumber(parseInt(minterInfo.shares, 10))}
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

function CreatorFeeCard({ tokenAddress, creatorAddress }: { tokenAddress: string; creatorAddress: string }) {
  const { connected, address: walletAddress } = useWalletStore();
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<string | null>(null);
  const [claimableSats, setClaimableSats] = useState<number | null>(null);

  const isCreator = connected && walletAddress === creatorAddress;

  // Fetch on-chain creator fee pool instead of iterating trades
  useEffect(() => {
    if (!isCreator) return;
    let cancelled = false;
    (async () => {
      try {
        const { getLaunchTokenContract } = await import('@/services/contract');
        const contract = getLaunchTokenContract(tokenAddress);
        const poolResult = await contract.getFeePools();
        if (!cancelled) {
          setClaimableSats(Number(poolResult.properties.creatorFees));
        }
      } catch {
        // Silently fail
      }
    })();
    return () => { cancelled = true; };
  }, [tokenAddress, isCreator]);

  if (!isCreator) return null;

  const handleClaim = async () => {
    if (!walletAddress) return;
    setClaiming(true);
    setClaimResult(null);
    try {
      const { getLaunchTokenContract, sendContractCall } = await import('@/services/contract');
      const contract = getLaunchTokenContract(tokenAddress);
      const sim = await contract.claimCreatorFees();
      const receipt = await sendContractCall(sim, {
        refundTo: walletAddress,
      });
      setClaimResult(`Claimed! Tx: ${receipt.txHash.slice(0, 12)}...`);
      setClaimableSats(0);
    } catch (err) {
      setClaimResult(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  const nothingToClaim = claimableSats !== null && claimableSats === 0;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Coins size={16} className="text-accent" />
        <h3 className="text-sm font-medium text-text-secondary">Creator Fees</h3>
      </div>
      <p className="text-xs text-text-muted mb-2">
        As the token creator, you earn 0.25% of every trade.
      </p>
      <p className="text-sm font-mono text-text-primary mb-3">
        {claimableSats === null
          ? 'Loading...'
          : `${formatBtc(claimableSats)} available`}
      </p>
      {nothingToClaim && (
        <p className="text-xs text-text-muted mb-2">No fees to claim yet.</p>
      )}
      {claimResult && (
        <p className="text-xs text-text-secondary mb-2">{claimResult}</p>
      )}
      <Button
        size="sm"
        variant="secondary"
        onClick={handleClaim}
        disabled={claiming || nothingToClaim}
        className="w-full"
      >
        {claiming ? 'Claiming...' : 'Claim Creator Fees'}
      </Button>
    </Card>
  );
}

export function TokenPage() {
  const { address } = useParams<{ address: string }>();
  const [timeframe, setTimeframe] = useState<TimeframeKey>('15m');
  const token = useTokenStore((s) => s.selectedToken?.address === address ? s.selectedToken : s.tokens.find((t) => t.address === address) ?? null);
  const fetchToken = useTokenStore((s) => s.fetchToken);
  const candles = usePriceStore((s) => (address ? s.candles[address] : undefined)) ?? EMPTY_CANDLES;
  const livePrice = usePriceStore((s) => (address ? s.livePrices[address] : undefined));

  // Fetch token from API if not in store
  useEffect(() => {
    if (!token && address) {
      fetchToken(address);
    }
  }, [address, token?.address]);

  usePriceFeed(token, timeframe);

  if (!token) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  const socialLinks = [
    { icon: Globe, url: token.website, label: 'Website' },
    { icon: Twitter, url: token.twitter, label: 'Twitter' },
    { icon: Send, url: token.telegram, label: 'Telegram' },
    { icon: MessageCircle, url: token.discord, label: 'Discord' },
    { icon: Github, url: token.github, label: 'GitHub' },
  ].filter((s) => s.url);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-elevated flex items-center justify-center text-3xl overflow-hidden">
            {token.imageUrl ? (
              <img src={token.imageUrl} alt={token.name} className="w-full h-full object-cover" />
            ) : (
              token.image
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text-primary">{token.name}</h1>
              <span className="text-text-muted font-mono">${token.symbol}</span>
              <TokenBadge status={token.status} />
            </div>
            <TokenPrice priceSats={token.currentPriceSats} change24h={token.priceChange24h} size="md" isOptimistic={livePrice?.isOptimistic} />
          </div>
        </div>

        {socialLinks.length > 0 && (
          <div className="flex gap-2 sm:ml-auto">
            {socialLinks.map(({ icon: Icon, url, label }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-elevated hover:bg-input text-text-muted hover:text-text-primary transition-colors"
                title={label}
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chart + Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-sm font-medium text-text-secondary">Price Chart</span>
              <ChartControls timeframe={timeframe} onTimeframeChange={setTimeframe} />
            </div>
            <PriceChart candles={candles} />
          </Card>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Volume 24h', value: formatBtc(token.volume24hSats) },
              { label: 'Market Cap', value: formatBtc(token.marketCapSats) },
              { label: 'Holders', value: formatNumber(token.holderCount) },
              { label: 'Trades 24h', value: formatNumber(token.tradeCount24h) },
            ].map((stat) => (
              <Card key={stat.label} className="text-center py-3">
                <p className="text-xs text-text-muted">{stat.label}</p>
                <p className="font-mono font-semibold text-text-primary mt-1">{stat.value}</p>
              </Card>
            ))}
          </div>

          {/* Tabs: History, Info, Curve */}
          <Card>
            <TabsRoot defaultValue="trades">
              <TabsList>
                <TabsTrigger value="trades">Trade History</TabsTrigger>
                <TabsTrigger value="info">Token Info</TabsTrigger>
                <TabsTrigger value="curve">Bonding Curve</TabsTrigger>
              </TabsList>

              <TabsContent value="trades">
                <TradeHistory token={token} />
              </TabsContent>

              <TabsContent value="info">
                <div className="space-y-3 text-sm">
                  <p className="text-text-secondary">{token.description}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-text-muted">Contract</span>
                      <div className="mt-1"><AddressDisplay address={token.address} showCopy /></div>
                    </div>
                    <div>
                      <span className="text-text-muted">Creator</span>
                      <div className="mt-1">
                        <Link to={`/profile/${token.creatorAddress}`}>
                          <AddressDisplay address={token.creatorAddress} className="hover:text-accent" />
                        </Link>
                      </div>
                    </div>
                    <div>
                      <span className="text-text-muted">Created</span>
                      <p className="font-mono text-text-primary mt-1">{timeAgo(token.createdAt)}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">Creator Allocation</span>
                      <p className="font-mono text-text-primary mt-1">{token.creatorAllocationPercent}%</p>
                    </div>
                    {(token.buyTaxPercent > 0 || token.sellTaxPercent > 0) && (
                      <>
                        <div>
                          <span className="text-text-muted">Buy Tax</span>
                          <p className="font-mono text-text-primary mt-1">{token.buyTaxPercent}%</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Sell Tax</span>
                          <p className="font-mono text-text-primary mt-1">{token.sellTaxPercent}%</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="curve">
                <div className="space-y-4">
                  <BondingCurveVisual
                    virtualBtcReserve={token.virtualBtcReserve}
                    virtualTokenSupply={token.virtualTokenSupply}
                    realBtcReserve={token.realBtcReserve}
                  />
                  <GraduationProgress
                    progress={token.graduationProgress}
                    realBtcSats={Number(token.realBtcReserve)}
                    status={token.status}
                  />
                </div>
              </TabsContent>
            </TabsRoot>
          </Card>
        </div>

        {/* Trade panel sidebar */}
        <div className="space-y-6">
          {token.status === 'migrated' ? (
            <Card className="text-center py-8">
              <Badge variant="bull" className="mb-3 text-base px-4 py-1">Trading on MotoSwap</Badge>
              <p className="text-text-secondary text-sm mt-2">
                This token has migrated to MotoSwap DEX for open-market trading.
              </p>
              {MOTOSWAP_URL && (
                <a
                  href={`${MOTOSWAP_URL}/swap?token=${token.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 px-6 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Trade on MotoSwap
                </a>
              )}
            </Card>
          ) : token.status === 'migrating' ? (
            <Card className="text-center py-8">
              <Badge variant="warning" className="mb-3 text-base px-4 py-1 animate-pulse">Migrating</Badge>
              <p className="text-text-secondary text-sm mt-2">
                This token is being migrated to MotoSwap DEX.
              </p>
              <p className="text-text-muted text-xs mt-1">
                Liquidity pool creation in progress. Trading will be available shortly.
              </p>
              <div className="mt-4 flex justify-center">
                <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            </Card>
          ) : token.status === 'graduated' ? (
            <Card className="text-center py-8">
              <Badge variant="warning" className="mb-3 text-base px-4 py-1">Graduated</Badge>
              <p className="text-text-secondary text-sm mt-2">
                This token has graduated from the bonding curve.
              </p>
              <p className="text-text-muted text-xs mt-1">
                DEX liquidity migration starting soon.
              </p>
              <div className="mt-4 flex justify-center">
                <div className="h-5 w-5 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
              </div>
            </Card>
          ) : (
            <TradePanel token={token} />
          )}

          <Card>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Graduation Progress</h3>
            <GraduationProgress
              progress={token.graduationProgress}
              realBtcSats={Number(token.realBtcReserve)}
              status={token.status}
            />
          </Card>

          <MinterRewardCard tokenAddress={token.address} />
          <CreatorFeeCard tokenAddress={token.address} creatorAddress={token.creatorAddress} />
        </div>
      </div>
    </div>
  );
}
