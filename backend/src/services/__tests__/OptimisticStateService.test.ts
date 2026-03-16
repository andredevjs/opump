import { describe, it, expect, beforeEach } from 'vitest';
import { OptimisticStateService } from '../OptimisticStateService.js';
import { BondingCurveSimulator } from '../BondingCurveSimulator.js';
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
} from '../../../../shared/constants/bonding-curve.js';

describe('OptimisticStateService', () => {
  let service: OptimisticStateService;
  const TOKEN_A = 'bc1qtoken_a';
  const TOKEN_B = 'bc1qtoken_b';

  beforeEach(() => {
    service = new OptimisticStateService();
  });

  describe('initial state', () => {
    it('returns initial reserves for unknown token', () => {
      const result = service.getOptimisticPrice('unknown');

      expect(result.isOptimistic).toBe(false);
      expect(result.reserves.virtualBtcReserve).toBe(INITIAL_VIRTUAL_BTC_SATS);
      expect(result.reserves.virtualTokenSupply).toBe(INITIAL_VIRTUAL_TOKEN_SUPPLY);
      expect(result.pendingBuySats).toBe(0n);
      expect(result.pendingSellTokens).toBe(0n);
    });

    it('has no pending for unknown token', () => {
      expect(service.hasPending('unknown')).toBe(false);
    });
  });

  describe('setConfirmedReserves', () => {
    it('updates confirmed reserves', () => {
      const reserves = {
        ...BondingCurveSimulator.getInitialReserves(),
        virtualBtcReserve: 3_100_000_000n,
        realBtcReserve: 100_000_000n,
      };

      service.setConfirmedReserves(TOKEN_A, reserves);
      const result = service.getOptimisticPrice(TOKEN_A);

      expect(result.reserves.virtualBtcReserve).toBe(3_100_000_000n);
      expect(result.reserves.realBtcReserve).toBe(100_000_000n);
    });
  });

  describe('addPendingTrade', () => {
    it('marks token as having pending trades', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 100_000n);

      expect(service.hasPending(TOKEN_A)).toBe(true);
    });

    it('applies pending buy optimistically', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 1_000_000n);

      const result = service.getOptimisticPrice(TOKEN_A);

      expect(result.isOptimistic).toBe(true);
      expect(result.pendingBuySats).toBe(1_000_000n);
      // BTC reserve should increase due to pending buy
      expect(result.reserves.virtualBtcReserve).toBeGreaterThan(INITIAL_VIRTUAL_BTC_SATS);
      // Token supply should decrease
      expect(result.reserves.virtualTokenSupply).toBeLessThan(INITIAL_VIRTUAL_TOKEN_SUPPLY);
    });

    it('applies pending sell optimistically', () => {
      // First do a confirmed buy to have realistic reserves (use high threshold)
      const sim = new BondingCurveSimulator();
      const largeCapReserves = { ...BondingCurveSimulator.getInitialReserves(), graduationThreshold: 100_000_000_000n };
      const buyResult = sim.simulateBuy(largeCapReserves, 10_000_000n);

      service.setConfirmedReserves(TOKEN_A, buyResult.newReserves);
      service.addPendingTrade(TOKEN_A, 'tx-sell', 'sell', buyResult.tokensOut / 2n);

      const result = service.getOptimisticPrice(TOKEN_A);

      expect(result.isOptimistic).toBe(true);
      expect(result.pendingSellTokens).toBe(buyResult.tokensOut / 2n);
      // BTC reserve should decrease due to pending sell
      expect(result.reserves.virtualBtcReserve).toBeLessThan(buyResult.newReserves.virtualBtcReserve);
    });

    it('accumulates multiple pending buys', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 500_000n);
      service.addPendingTrade(TOKEN_A, 'tx-2', 'buy', 500_000n);

      const result = service.getOptimisticPrice(TOKEN_A);

      expect(result.pendingBuySats).toBe(1_000_000n);
    });

    it('applies buys and sells sequentially', () => {
      const sim = new BondingCurveSimulator();
      const largeCapReserves = { ...BondingCurveSimulator.getInitialReserves(), graduationThreshold: 100_000_000_000n };
      const buyResult = sim.simulateBuy(largeCapReserves, 10_000_000n);

      service.setConfirmedReserves(TOKEN_A, buyResult.newReserves);
      service.addPendingTrade(TOKEN_A, 'tx-buy', 'buy', 500_000n);
      service.addPendingTrade(TOKEN_A, 'tx-sell', 'sell', buyResult.tokensOut / 4n);

      const result = service.getOptimisticPrice(TOKEN_A);

      expect(result.pendingBuySats).toBe(500_000n);
      expect(result.pendingSellTokens).toBe(buyResult.tokensOut / 4n);
    });
  });

  describe('removePendingTrade', () => {
    it('removes a specific pending trade', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 100_000n);
      service.addPendingTrade(TOKEN_A, 'tx-2', 'buy', 200_000n);

      service.removePendingTrade(TOKEN_A, 'tx-1');

      const result = service.getOptimisticPrice(TOKEN_A);
      expect(result.pendingBuySats).toBe(200_000n);
    });

    it('marks token as non-optimistic when all pending removed', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 100_000n);
      service.removePendingTrade(TOKEN_A, 'tx-1');

      expect(service.hasPending(TOKEN_A)).toBe(false);
      expect(service.getOptimisticPrice(TOKEN_A).isOptimistic).toBe(false);
    });

    it('is a no-op for unknown token', () => {
      // Should not throw
      service.removePendingTrade('unknown', 'tx-1');
    });

    it('is a no-op for unknown txHash', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 100_000n);

      service.removePendingTrade(TOKEN_A, 'nonexistent');

      expect(service.hasPending(TOKEN_A)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes tokens with no pending adjustments', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.setConfirmedReserves(TOKEN_B, BondingCurveSimulator.getInitialReserves());
      service.addPendingTrade(TOKEN_B, 'tx-1', 'buy', 100_000n);

      service.cleanup();

      // TOKEN_A had no pending, should be cleaned
      // TOKEN_B still has pending, should remain
      expect(service.hasPending(TOKEN_A)).toBe(false);
      expect(service.hasPending(TOKEN_B)).toBe(true);
    });

    it('re-seeding reserves after cleanup uses correct base (not initial)', () => {
      const sim = new BondingCurveSimulator();
      const largeCapReserves = { ...BondingCurveSimulator.getInitialReserves(), graduationThreshold: 100_000_000_000n };
      const buyResult = sim.simulateBuy(largeCapReserves, 50_000_000n);

      service.setConfirmedReserves(TOKEN_A, buyResult.newReserves);
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 1_000_000n);
      const priceWithPending = service.getOptimisticPrice(TOKEN_A);

      service.removePendingTrade(TOKEN_A, 'tx-1');
      service.cleanup();

      // Re-seed with same confirmed reserves (simulates MempoolService re-hydration)
      service.setConfirmedReserves(TOKEN_A, buyResult.newReserves);
      service.addPendingTrade(TOKEN_A, 'tx-2', 'buy', 1_000_000n);
      const priceAfterReseed = service.getOptimisticPrice(TOKEN_A);

      // Both should produce the same optimistic price — NOT fall back to initial reserves
      expect(priceAfterReseed.reserves.virtualBtcReserve).toBe(priceWithPending.reserves.virtualBtcReserve);
      expect(priceAfterReseed.reserves.virtualTokenSupply).toBe(priceWithPending.reserves.virtualTokenSupply);
    });

    it('without re-seeding after cleanup, pending trade starts from initial reserves (bug scenario)', () => {
      const sim = new BondingCurveSimulator();
      const largeCapReserves = { ...BondingCurveSimulator.getInitialReserves(), graduationThreshold: 100_000_000_000n };
      const buyResult = sim.simulateBuy(largeCapReserves, 50_000_000n);

      service.setConfirmedReserves(TOKEN_A, buyResult.newReserves);
      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 1_000_000n);
      service.removePendingTrade(TOKEN_A, 'tx-1');
      service.cleanup();

      // Add new pending WITHOUT re-seeding: should fall back to initial reserves
      service.addPendingTrade(TOKEN_A, 'tx-2', 'buy', 1_000_000n);
      const result = service.getOptimisticPrice(TOKEN_A);

      // This demonstrates the bug: without re-seeding, reserves start from initial
      const initialSim = sim.simulateBuy(BondingCurveSimulator.getInitialReserves(), 1_000_000n);
      expect(result.reserves.virtualBtcReserve).toBe(initialSim.newReserves.virtualBtcReserve);
    });
  });

  describe('token isolation', () => {
    it('tokens do not affect each other', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      service.setConfirmedReserves(TOKEN_B, BondingCurveSimulator.getInitialReserves());

      service.addPendingTrade(TOKEN_A, 'tx-1', 'buy', 1_000_000n);

      expect(service.hasPending(TOKEN_A)).toBe(true);
      expect(service.hasPending(TOKEN_B)).toBe(false);

      const resultA = service.getOptimisticPrice(TOKEN_A);
      const resultB = service.getOptimisticPrice(TOKEN_B);

      expect(resultA.reserves.virtualBtcReserve).toBeGreaterThan(resultB.reserves.virtualBtcReserve);
    });
  });

  describe('error handling', () => {
    it('skips invalid pending simulations gracefully', () => {
      service.setConfirmedReserves(TOKEN_A, BondingCurveSimulator.getInitialReserves());
      // Add a sell that would fail (selling from initial state with no real BTC)
      service.addPendingTrade(TOKEN_A, 'bad-tx', 'sell', 1n);
      // Add a valid buy after
      service.addPendingTrade(TOKEN_A, 'good-tx', 'buy', 1_000_000n);

      // Should not throw — bad simulation is skipped
      const result = service.getOptimisticPrice(TOKEN_A);
      expect(result.pendingBuySats).toBe(1_000_000n);
    });
  });
});
