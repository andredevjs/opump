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
import type { TimeframeKey } from '@/mock/ohlcv';
import { Globe, Twitter, Send, MessageCircle, Github } from 'lucide-react';

export function TokenPage() {
  const { address } = useParams<{ address: string }>();
  const [timeframe, setTimeframe] = useState<TimeframeKey>('15m');
  const token = useTokenStore((s) => s.tokens.find((t) => t.address === address) ?? null);
  const candles = usePriceStore((s) => (address ? s.candles[address] ?? [] : []));

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
          <div className="w-14 h-14 rounded-xl bg-elevated flex items-center justify-center text-3xl">
            {token.image}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text-primary">{token.name}</h1>
              <span className="text-text-muted font-mono">${token.symbol}</span>
              <TokenBadge status={token.status} />
            </div>
            <TokenPrice priceSats={token.currentPriceSats} change24h={token.priceChange24h} size="md" />
          </div>
        </div>

        {socialLinks.length > 0 && (
          <div className="flex gap-2 sm:ml-auto">
            {socialLinks.map(({ icon: Icon, url, label }) => (
              <a
                key={label}
                href="#"
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
                    realBtcSats={parseInt(token.realBtcReserve)}
                  />
                </div>
              </TabsContent>
            </TabsRoot>
          </Card>
        </div>

        {/* Trade panel sidebar */}
        <div className="space-y-6">
          <TradePanel token={token} />

          <Card>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Graduation Progress</h3>
            <GraduationProgress
              progress={token.graduationProgress}
              realBtcSats={parseInt(token.realBtcReserve)}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
