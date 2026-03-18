import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { BuyForm } from './BuyForm';
import { SellForm } from './SellForm';
import type { Token } from '@/types/token';
import { Card } from '@/components/ui/Card';

interface TradePanelProps {
  token: Token;
}

export function TradePanel({ token }: TradePanelProps) {
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
    </Card>
  );
}
