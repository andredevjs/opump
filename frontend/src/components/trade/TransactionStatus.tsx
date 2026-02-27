import type { PendingTransaction } from '@/types/trade';
import { cn } from '@/lib/cn';
import { formatBtc, formatTokenAmount, timeAgo } from '@/lib/format';
import { Radio, Wifi, CheckCircle2 } from 'lucide-react';

interface TransactionStatusProps {
  transaction: PendingTransaction;
}

const STATUS_CONFIG = {
  broadcasted: {
    icon: Radio,
    label: 'Broadcasted',
    color: 'text-pending',
    bgColor: 'bg-pending/10',
  },
  mempool: {
    icon: Wifi,
    label: 'In Mempool',
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
  confirmed: {
    icon: CheckCircle2,
    label: 'Confirmed',
    color: 'text-bull',
    bgColor: 'bg-bull/10',
  },
};

export function TransactionStatus({ transaction }: TransactionStatusProps) {
  const config = STATUS_CONFIG[transaction.status];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-3 p-2.5 rounded-lg', config.bgColor)}>
      <Icon size={18} className={cn(config.color, transaction.status === 'broadcasted' && 'animate-pulse')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium uppercase', transaction.type === 'buy' ? 'text-bull' : 'text-bear')}>
            {transaction.type}
          </span>
          <span className="text-xs text-text-secondary">
            {formatTokenAmount(transaction.tokenAmount)} {transaction.tokenSymbol}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className={config.color}>{config.label}</span>
          <span>{timeAgo(transaction.timestamp)}</span>
        </div>
      </div>
      <span className="text-xs font-mono text-text-secondary">
        {formatBtc(transaction.btcAmount)}
      </span>
    </div>
  );
}
