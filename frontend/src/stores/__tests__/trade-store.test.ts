import { describe, it, expect, beforeEach } from 'vitest';
import { useTradeStore } from '../trade-store';
import type { PendingTransaction } from '@/types/trade';

function resetStore() {
  useTradeStore.setState({
    pendingTransactions: [],
    holdings: {},
    recentTrades: {},
  });
}

const makePending = (overrides: Partial<PendingTransaction> = {}): PendingTransaction => ({
  id: 'tx-1',
  type: 'buy',
  status: 'broadcasted',
  btcAmount: 100000,
  tokenAmount: '500000000',
  tokenSymbol: 'TEST',
  tokenAddress: 'bc1qtest',
  timestamp: Date.now(),
  ...overrides,
});

describe('trade-store', () => {
  beforeEach(resetStore);

  describe('pendingTransactions', () => {
    it('adds a pending transaction', () => {
      const tx = makePending();
      useTradeStore.getState().addPending(tx);

      expect(useTradeStore.getState().pendingTransactions).toHaveLength(1);
      expect(useTradeStore.getState().pendingTransactions[0].id).toBe('tx-1');
    });

    it('prepends new pending transactions', () => {
      useTradeStore.getState().addPending(makePending({ id: 'tx-1' }));
      useTradeStore.getState().addPending(makePending({ id: 'tx-2' }));

      const txs = useTradeStore.getState().pendingTransactions;
      expect(txs[0].id).toBe('tx-2');
      expect(txs[1].id).toBe('tx-1');
    });

    it('updates pending transaction status', () => {
      useTradeStore.getState().addPending(makePending());
      useTradeStore.getState().updatePendingStatus('tx-1', 'mempool');

      expect(useTradeStore.getState().pendingTransactions[0].status).toBe('mempool');
    });

    it('does not mutate other transactions when updating', () => {
      useTradeStore.getState().addPending(makePending({ id: 'tx-1' }));
      useTradeStore.getState().addPending(makePending({ id: 'tx-2' }));
      useTradeStore.getState().updatePendingStatus('tx-1', 'confirmed');

      const txs = useTradeStore.getState().pendingTransactions;
      expect(txs.find((t) => t.id === 'tx-1')!.status).toBe('confirmed');
      expect(txs.find((t) => t.id === 'tx-2')!.status).toBe('broadcasted');
    });

    it('removes a pending transaction', () => {
      useTradeStore.getState().addPending(makePending());
      useTradeStore.getState().removePending('tx-1');

      expect(useTradeStore.getState().pendingTransactions).toHaveLength(0);
    });
  });

  describe('holdings', () => {
    it('adds holdings for a token', () => {
      useTradeStore.getState().addHolding('bc1qtoken1', '500000000');

      expect(useTradeStore.getState().getHolding('bc1qtoken1')).toBe('500000000');
    });

    it('accumulates holdings for same token', () => {
      useTradeStore.getState().addHolding('bc1qtoken1', '500000000');
      useTradeStore.getState().addHolding('bc1qtoken1', '300000000');

      expect(useTradeStore.getState().getHolding('bc1qtoken1')).toBe('800000000');
    });

    it('removes holdings', () => {
      useTradeStore.getState().addHolding('bc1qtoken1', '500000000');
      useTradeStore.getState().removeHolding('bc1qtoken1', '200000000');

      expect(useTradeStore.getState().getHolding('bc1qtoken1')).toBe('300000000');
    });

    it('clamps holdings at zero (no negative)', () => {
      useTradeStore.getState().addHolding('bc1qtoken1', '100000000');
      useTradeStore.getState().removeHolding('bc1qtoken1', '999999999');

      expect(useTradeStore.getState().getHolding('bc1qtoken1')).toBe('0');
    });

    it('returns 0 for unknown token', () => {
      expect(useTradeStore.getState().getHolding('unknown')).toBe('0');
    });

    it('handles multiple tokens independently', () => {
      useTradeStore.getState().addHolding('token-a', '100');
      useTradeStore.getState().addHolding('token-b', '200');

      expect(useTradeStore.getState().getHolding('token-a')).toBe('100');
      expect(useTradeStore.getState().getHolding('token-b')).toBe('200');
    });
  });

  describe('recentTrades (local/optimistic)', () => {
    const localTrade = {
      txHash: 'hash-1',
      type: 'buy' as const,
      traderAddress: 'bc1qtrader',
      btcAmount: '100000',
      tokenAmount: '500000000',
      status: 'pending',
      pricePerToken: '3',
    };

    it('adds a local trade', () => {
      useTradeStore.getState().addLocalTrade('bc1qtoken1', localTrade);

      const trades = useTradeStore.getState().recentTrades['bc1qtoken1'];
      expect(trades).toHaveLength(1);
      expect(trades[0].txHash).toBe('hash-1');
    });

    it('prepends new trades', () => {
      useTradeStore.getState().addLocalTrade('bc1qtoken1', localTrade);
      useTradeStore.getState().addLocalTrade('bc1qtoken1', { ...localTrade, txHash: 'hash-2' });

      const trades = useTradeStore.getState().recentTrades['bc1qtoken1'];
      expect(trades[0].txHash).toBe('hash-2');
    });

    it('caps at 50 trades', () => {
      for (let i = 0; i < 60; i++) {
        useTradeStore.getState().addLocalTrade('bc1qtoken1', { ...localTrade, txHash: `hash-${i}` });
      }

      const trades = useTradeStore.getState().recentTrades['bc1qtoken1'];
      expect(trades).toHaveLength(50);
    });

    it('confirms a trade', () => {
      useTradeStore.getState().addLocalTrade('bc1qtoken1', localTrade);
      useTradeStore.getState().confirmLocalTrade('bc1qtoken1', 'hash-1');

      const trades = useTradeStore.getState().recentTrades['bc1qtoken1'];
      expect(trades[0].status).toBe('confirmed');
    });

    it('drops a trade', () => {
      useTradeStore.getState().addLocalTrade('bc1qtoken1', localTrade);
      useTradeStore.getState().dropLocalTrade('bc1qtoken1', 'hash-1');

      const trades = useTradeStore.getState().recentTrades['bc1qtoken1'];
      expect(trades).toHaveLength(0);
    });
  });
});
