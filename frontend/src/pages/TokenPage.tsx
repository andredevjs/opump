import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PriceChart } from '@/components/chart/PriceChart';
import { ChartControls } from '@/components/chart/ChartControls';
import { TradePanel } from '@/components/trade/TradePanel';
import { TradeHistory } from '@/components/trade/TradeHistory';
import { TokenPrice } from '@/components/token/TokenPrice';
import { TokenBadge, isTokenPending } from '@/components/token/TokenBadge';
import { CreatorFeeCard } from '@/components/token/CreatorFeeCard';
import { MigrationCard } from '@/components/token/MigrationCard';
import { useMigration } from '@/hooks/use-migration';
import { useWalletStore } from '@/stores/wallet-store';
import { GraduationProgress } from '@/components/shared/GraduationProgress';
import { BondingCurveVisual } from '@/components/shared/BondingCurveVisual';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { TopHolders } from '@/components/token/TopHolders';
import { Card } from '@/components/ui/Card';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { usePriceFeed } from '@/hooks/use-price-feed';
import { formatUsd, formatNumber, timeAgo, priceSatsToMcapUsd, formatMcapUsd } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';
import type { TimeframeKey } from '@/types/api';
import { Globe, Twitter, Send, MessageCircle, Github, Loader2 } from 'lucide-react';

import type { OHLCVCandle } from '@/types/api';

const EMPTY_CANDLES: OHLCVCandle[] = [];

export function TokenPage() {
  const { address } = useParams<{ address: string }>();
  const [timeframe, setTimeframe] = useState<TimeframeKey>('1m');
  const token = useTokenStore((s) => s.selectedToken?.address === address ? s.selectedToken : s.tokens.find((t) => t.address === address) ?? null);
  const fetchToken = useTokenStore((s) => s.fetchToken);
  const candles = usePriceStore((s) => (address ? s.candles[address] : undefined)) ?? EMPTY_CANDLES;
  const chartLoading = usePriceStore((s) => (address ? s.loading[address] : false)) ?? false;
  const livePrice = usePriceStore((s) => (address ? s.livePrices[address] : undefined));
  const chartType = usePriceStore((s) => s.chartType);
  const setChartType = usePriceStore((s) => s.setChartType);
  const { btcPrice } = useBtcPrice();
  const walletAddress = useWalletStore((s) => s.address);
  const { executeMigrate, migrating, isCreator } = useMigration(token);

  const mcapCandles = useMemo(() => {
    if (btcPrice <= 0) return candles;
    return candles.map((c) => ({
      ...c,
      open: priceSatsToMcapUsd(c.open, btcPrice),
      high: priceSatsToMcapUsd(c.high, btcPrice),
      low: priceSatsToMcapUsd(c.low, btcPrice),
      close: priceSatsToMcapUsd(c.close, btcPrice),
    }));
  }, [candles, btcPrice]);

  // S24: Fetch token from API if not in store — depend on address and fetchToken
  useEffect(() => {
    if (!token && address) {
      fetchToken(address);
    }
  }, [address, fetchToken, token]);

  // Poll for confirmation while token is pending (deployBlock === 0).
  // Each tick tries to re-verify on-chain, then re-fetches the token.
  useEffect(() => {
    if (!token || !address || !isTokenPending(token)) return;
    const id = setInterval(async () => {
      try {
        const { confirmToken } = await import('@/services/api');
        await confirmToken(address);
      } catch { /* best-effort */ }
      fetchToken(address);
    }, 10_000);
    return () => clearInterval(id);
  }, [token?.deployBlock, address, fetchToken, token]);

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
              <TokenBadge status={token.status} deployBlock={token.deployBlock} />
            </div>
            <TokenPrice priceSats={token.currentPriceSats} change24h={token.priceChange24h} btcPrice={btcPrice} size="md" isOptimistic={livePrice?.isOptimistic} />
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
              <span className="text-sm font-medium text-text-secondary">Market Cap</span>
              <ChartControls timeframe={timeframe} onTimeframeChange={setTimeframe} chartType={chartType} onChartTypeChange={setChartType} />
            </div>
            <PriceChart candles={mcapCandles} loading={chartLoading} chartType={chartType} priceFormatter={formatMcapUsd} />
          </Card>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Volume 24h', value: formatUsd(token.volume24hSats, btcPrice) },
              { label: 'Market Cap', value: formatMcapUsd(priceSatsToMcapUsd(token.currentPriceSats, btcPrice)) },
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
                  <div className="border-t border-border pt-3">
                    <TopHolders tokenAddress={token.address} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="curve">
                <div className="space-y-4">
                  <BondingCurveVisual
                    virtualBtcReserve={token.virtualBtcReserve}
                    virtualTokenSupply={token.virtualTokenSupply}
                    realBtcReserve={token.realBtcReserve}
                    btcPrice={btcPrice}
                  />
                  <GraduationProgress
                    progress={token.graduationProgress}
                    realBtcSats={Number(token.realBtcReserve)}
                    status={token.status}
                    btcPrice={btcPrice}
                    currentPriceSats={token.currentPriceSats}
                  />
                </div>
              </TabsContent>
            </TabsRoot>
          </Card>
        </div>

        {/* Trade panel sidebar */}
        <div className="space-y-6">
          {isTokenPending(token) ? (
            <Card className="p-6 text-center space-y-3">
              <Loader2 size={32} className="mx-auto text-accent animate-spin" />
              <p className="text-sm text-text-secondary">
                This token is waiting for on-chain confirmation. Trading will be available once the deployment transaction is confirmed.
              </p>
            </Card>
          ) : token.status === 'graduated' || token.status === 'migrating' || token.status === 'migrated' ? (
            <MigrationCard
              token={token}
              walletAddress={walletAddress}
              isCreator={isCreator}
              migrating={migrating}
              onMigrate={executeMigrate}
            />
          ) : (
            <TradePanel token={token} />
          )}

          <Card>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Graduation Progress</h3>
            <GraduationProgress
              progress={token.graduationProgress}
              realBtcSats={Number(token.realBtcReserve)}
              status={token.status}
              btcPrice={btcPrice}
              currentPriceSats={token.currentPriceSats}
            />
          </Card>

          {!isTokenPending(token) && (
            <CreatorFeeCard tokenAddress={token.address} creatorAddress={token.creatorAddress} />
          )}
        </div>
      </div>
    </div>
  );
}
