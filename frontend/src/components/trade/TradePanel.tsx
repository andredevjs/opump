import { useMemo } from 'react';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { BuyForm } from './BuyForm';
import { SellForm } from './SellForm';
import { TransactionStatus } from './TransactionStatus';
import type { Token } from '@/types/token';
import { useTradeStore } from '@/stores/trade-store';
import { Card } from '@/components/ui/Card';

interface TradePanelProps {
  token: Token;
}

export function TradePanel({ token }: TradePanelProps) {
  const allPending = useTradeStore((s) => s.pendingTransactions);
  const pendingTransactions = useMemo(
    () => allPending.filter((tx) => tx.tokenAddress === token.address),
    [allPending, token.address],
  );

  return (
    <Card className="p-0 overflow-hidden">
      <TabsRoot defaultValue="buy">
        <TabsList className="px-4 pt-4">
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="px-4 pb-4">
          <BuyForm token={token} />
        </TabsContent>

        <TabsContent value="sell" className="px-4 pb-4">
          <SellForm token={token} />
        </TabsContent>
      </TabsRoot>

      {pendingTransactions.length > 0 && (
        <div className="border-t border-border p-4 space-y-2">
          <p className="text-xs text-text-muted font-medium uppercase">Pending Transactions</p>
          {pendingTransactions.map((tx) => (
            <TransactionStatus key={tx.id} transaction={tx} />
          ))}
        </div>
      )}
    </Card>
  );
}
