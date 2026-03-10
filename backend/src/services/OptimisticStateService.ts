import { BondingCurveSimulator, type Reserves } from './BondingCurveSimulator.js';

interface PendingAdjustment {
  txHash: string;
  type: 'buy' | 'sell';
  amount: bigint; // btcAmount for buy, tokenAmount for sell
  timestamp: number;
}

interface OptimisticState {
  confirmedReserves: Reserves;
  pendingAdjustments: PendingAdjustment[];
}

export class OptimisticStateService {
  private states = new Map<string, OptimisticState>();
  private simulator = new BondingCurveSimulator();

  /**
   * Set the confirmed (on-chain) reserves for a token.
   */
  setConfirmedReserves(tokenAddress: string, reserves: Reserves): void {
    const state = this.getOrCreate(tokenAddress);
    state.confirmedReserves = reserves;
  }

  /**
   * Add a pending trade adjustment.
   */
  addPendingTrade(
    tokenAddress: string,
    txHash: string,
    type: 'buy' | 'sell',
    amount: bigint,
  ): void {
    const state = this.getOrCreate(tokenAddress);
    state.pendingAdjustments.push({
      txHash,
      type,
      amount,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove a pending trade (confirmed or dropped).
   */
  removePendingTrade(tokenAddress: string, txHash: string): void {
    const state = this.states.get(tokenAddress);
    if (!state) return;
    state.pendingAdjustments = state.pendingAdjustments.filter(
      (a) => a.txHash !== txHash,
    );
  }

  /**
   * Get the optimistic price for a token (confirmed + pending trades applied).
   */
  getOptimisticPrice(tokenAddress: string): {
    reserves: Reserves;
    isOptimistic: boolean;
    pendingBuySats: bigint;
    pendingSellTokens: bigint;
  } {
    const state = this.states.get(tokenAddress);
    if (!state) {
      return {
        reserves: BondingCurveSimulator.getInitialReserves(),
        isOptimistic: false,
        pendingBuySats: 0n,
        pendingSellTokens: 0n,
      };
    }

    const isOptimistic = state.pendingAdjustments.length > 0;
    let pendingBuySats = 0n;
    let pendingSellTokens = 0n;

    // Apply pending adjustments sequentially on top of confirmed reserves
    let currentReserves = { ...state.confirmedReserves };

    for (const adj of state.pendingAdjustments) {
      try {
        if (adj.type === 'buy') {
          pendingBuySats += adj.amount;
          const sim = this.simulator.simulateBuy(currentReserves, adj.amount);
          currentReserves = sim.newReserves;
        } else {
          pendingSellTokens += adj.amount;
          const sim = this.simulator.simulateSell(currentReserves, adj.amount);
          currentReserves = sim.newReserves;
        }
      } catch {
        // Skip invalid simulations
      }
    }

    return {
      reserves: currentReserves,
      isOptimistic,
      pendingBuySats,
      pendingSellTokens,
    };
  }

  /**
   * Check if a token has any pending adjustments.
   */
  hasPending(tokenAddress: string): boolean {
    const state = this.states.get(tokenAddress);
    return !!state && state.pendingAdjustments.length > 0;
  }

  /**
   * Remove states with no pending adjustments to prevent unbounded memory growth.
   */
  cleanup(): void {
    for (const [address, state] of this.states) {
      if (state.pendingAdjustments.length === 0) {
        this.states.delete(address);
      }
    }
  }

  private getOrCreate(tokenAddress: string): OptimisticState {
    let state = this.states.get(tokenAddress);
    if (!state) {
      state = {
        confirmedReserves: BondingCurveSimulator.getInitialReserves(),
        pendingAdjustments: [],
      };
      this.states.set(tokenAddress, state);
    }
    return state;
  }
}
