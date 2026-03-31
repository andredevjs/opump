import { describe, it, expect } from 'vitest';
import {
  BondingCurveSimulator,
  calculateBuyCost,
  calculateSellPayout,
  calculatePrice,
  maxTokensForBudget,
  deriveParams,
} from '../../functions/_shared/bonding-curve.mts';
import { expScaled, EXP_SCALE, LN_100_SCALED } from '../../functions/_shared/exp-math.mts';
import {
  MIN_TRADE_SATS,
  GRADUATION_THRESHOLD_SATS,
  PLATFORM_FEE_BPS,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  PRICE_PRECISION,
  TOKEN_UNITS_PER_TOKEN,
  DEFAULT_MAX_SUPPLY,
} from '../../functions/_shared/constants.mts';

const sim = new BondingCurveSimulator();

// Default reserves: 0% allocation, 1B supply, 6.9M sats graduation
function freshReserves() {
  return BondingCurveSimulator.getInitialReserves();
}

// ──────────────────────────────────────────────────────────
// 1. ExpMath
// ──────────────────────────────────────────────────────────
describe('expScaled', () => {
  it('exp(0) = 1', () => {
    expect(expScaled(0n)).toBe(EXP_SCALE);
  });

  it('exp(1) ≈ 2.718281828', () => {
    const result = Number(expScaled(EXP_SCALE)) / 1e18;
    expect(result).toBeCloseTo(Math.exp(1), 12);
  });

  it('exp(ln(100)) = 100', () => {
    const result = Number(expScaled(LN_100_SCALED)) / 1e18;
    expect(result).toBeCloseTo(100, 8);
  });

  it('exp(5) ≈ 148.413', () => {
    const result = Number(expScaled(5n * EXP_SCALE)) / 1e18;
    expect(result).toBeCloseTo(Math.exp(5), 6);
  });

  it('throws for argument > 100', () => {
    expect(() => expScaled(101n * EXP_SCALE)).toThrow();
  });

  it('throws for negative argument', () => {
    expect(() => expScaled(-1n)).toThrow();
  });
});

// ──────────────────────────────────────────────────────────
// 2. deriveParams
// ──────────────────────────────────────────────────────────
describe('deriveParams', () => {
  it('produces params that give 100x multiplier at graduation supply', () => {
    const { aScaled, bScaled } = deriveParams(DEFAULT_MAX_SUPPLY, GRADUATION_THRESHOLD_SATS);

    const gradSupply = DEFAULT_MAX_SUPPLY * 80n / 100n; // 80% of supply
    const p0 = calculatePrice(aScaled, bScaled, 0n);
    const pGrad = calculatePrice(aScaled, bScaled, gradSupply);

    const multiplier = Number(pGrad) / Number(p0);
    expect(multiplier).toBeCloseTo(100, 0);
  });

  it('total cost to graduation equals graduation threshold', () => {
    const { aScaled, bScaled } = deriveParams(DEFAULT_MAX_SUPPLY, GRADUATION_THRESHOLD_SATS);

    const gradSupply = DEFAULT_MAX_SUPPLY * 80n / 100n;
    const totalCost = calculateBuyCost(aScaled, bScaled, 0n, gradSupply);

    // Should match within 1 sat (ceiling rounding)
    expect(Number(totalCost)).toBeGreaterThanOrEqual(Number(GRADUATION_THRESHOLD_SATS));
    expect(Number(totalCost) - Number(GRADUATION_THRESHOLD_SATS)).toBeLessThan(2);
  });

  it('works with different allocations (50% off-curve)', () => {
    const curveSupply = DEFAULT_MAX_SUPPLY / 2n; // 500M tokens
    const { aScaled, bScaled } = deriveParams(curveSupply, GRADUATION_THRESHOLD_SATS);

    const gradSupply = curveSupply * 80n / 100n;
    const p0 = calculatePrice(aScaled, bScaled, 0n);
    const pGrad = calculatePrice(aScaled, bScaled, gradSupply);

    expect(Number(pGrad) / Number(p0)).toBeCloseTo(100, 0);
  });

  it('throws for zero curveSupply', () => {
    expect(() => deriveParams(0n, GRADUATION_THRESHOLD_SATS)).toThrow();
  });

  it('throws for zero graduation threshold', () => {
    expect(() => deriveParams(DEFAULT_MAX_SUPPLY, 0n)).toThrow();
  });
});

// ──────────────────────────────────────────────────────────
// 3. calculatePrice
// ──────────────────────────────────────────────────────────
describe('calculatePrice', () => {
  it('returns a * SCALE at supply = 0', () => {
    const reserves = freshReserves();
    const price = calculatePrice(reserves.aScaled, reserves.bScaled, 0n);

    // price = aScaled * exp(0) / SCALE = aScaled
    expect(price).toBe(reserves.aScaled);
  });

  it('is monotonically increasing with supply', () => {
    const reserves = freshReserves();
    let prev = 0n;

    for (const pct of [0n, 10n, 25n, 50n, 75n, 80n]) {
      const supply = (DEFAULT_MAX_SUPPLY * pct) / 100n;
      const price = calculatePrice(reserves.aScaled, reserves.bScaled, supply);
      expect(price).toBeGreaterThan(prev);
      prev = price;
    }
  });
});

// ──────────────────────────────────────────────────────────
// 4. calculateBuyCost / calculateSellPayout
// ──────────────────────────────────────────────────────────
describe('cost and payout', () => {
  it('cost is monotonically increasing with token amount', () => {
    const reserves = freshReserves();
    let prev = 0n;

    for (const wholeTokens of [1_000_000n, 10_000_000n, 50_000_000n, 100_000_000n, 500_000_000n]) {
      const units = wholeTokens * TOKEN_UNITS_PER_TOKEN;
      const cost = calculateBuyCost(reserves.aScaled, reserves.bScaled, 0n, units);
      expect(cost).toBeGreaterThan(prev);
      prev = cost;
    }
  });

  it('buy cost > sell payout at same supply (no arbitrage)', () => {
    const reserves = freshReserves();
    const supply = (DEFAULT_MAX_SUPPLY * 50n) / 100n; // 50% sold
    const delta = 10_000_000n * TOKEN_UNITS_PER_TOKEN; // 10M tokens

    const buyCost = calculateBuyCost(reserves.aScaled, reserves.bScaled, supply, delta);
    const sellPayout = calculateSellPayout(reserves.aScaled, reserves.bScaled, supply + delta, delta);

    expect(buyCost).toBeGreaterThanOrEqual(sellPayout);
  });

  it('cost(0 tokens) = 0', () => {
    const reserves = freshReserves();
    expect(calculateBuyCost(reserves.aScaled, reserves.bScaled, 0n, 0n)).toBe(0n);
  });

  it('payout(0 tokens) = 0', () => {
    const reserves = freshReserves();
    expect(calculateSellPayout(reserves.aScaled, reserves.bScaled, DEFAULT_MAX_SUPPLY, 0n)).toBe(0n);
  });

  it('sell throws if delta > supply', () => {
    const reserves = freshReserves();
    expect(() =>
      calculateSellPayout(reserves.aScaled, reserves.bScaled, 1000n, 2000n),
    ).toThrow('Sell exceeds supply');
  });
});

// ──────────────────────────────────────────────────────────
// 5. maxTokensForBudget (binary search)
// ──────────────────────────────────────────────────────────
describe('maxTokensForBudget', () => {
  it('cost(ans) <= budget < cost(ans + 1)', () => {
    const reserves = freshReserves();
    const budget = 500_000n;
    const maxDelta = DEFAULT_MAX_SUPPLY;

    const tokens = maxTokensForBudget(reserves.aScaled, reserves.bScaled, 0n, budget, maxDelta);
    const costExact = calculateBuyCost(reserves.aScaled, reserves.bScaled, 0n, tokens);
    const costPlus1 = calculateBuyCost(reserves.aScaled, reserves.bScaled, 0n, tokens + 1n);

    expect(costExact).toBeLessThanOrEqual(budget);
    expect(costPlus1).toBeGreaterThan(budget);
  });

  it('larger budget yields more tokens', () => {
    const reserves = freshReserves();
    const maxDelta = DEFAULT_MAX_SUPPLY;
    let prev = 0n;

    for (const budget of [100_000n, 500_000n, 1_000_000n, 3_000_000n]) {
      const tokens = maxTokensForBudget(reserves.aScaled, reserves.bScaled, 0n, budget, maxDelta);
      expect(tokens).toBeGreaterThan(prev);
      prev = tokens;
    }
  });

  it('returns 0 for zero budget', () => {
    const reserves = freshReserves();
    expect(maxTokensForBudget(reserves.aScaled, reserves.bScaled, 0n, 0n, DEFAULT_MAX_SUPPLY)).toBe(0n);
  });

  it('returns maxDelta if budget covers everything', () => {
    const reserves = freshReserves();
    const maxDelta = 1_000_000n * TOKEN_UNITS_PER_TOKEN; // 1M tokens
    const hugebudget = 100_000_000n; // 1 BTC

    const tokens = maxTokensForBudget(reserves.aScaled, reserves.bScaled, 0n, hugebudget, maxDelta);
    expect(tokens).toBe(maxDelta);
  });
});

// ──────────────────────────────────────────────────────────
// 6. simulateBuy
// ──────────────────────────────────────────────────────────
describe('simulateBuy', () => {
  it('computes correct fees for a 100k sat buy', () => {
    const reserves = freshReserves();
    const btcAmount = 100_000n;
    const result = sim.simulateBuy(reserves, btcAmount);

    const expectedPlatform = (btcAmount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
    const expectedBaseFee = (btcAmount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
    const expectedCreator = expectedBaseFee - expectedPlatform;

    expect(result.fees.platform).toBe(expectedPlatform);
    expect(result.fees.creator).toBe(expectedCreator);
    expect(result.fees.flywheel).toBe(0n);
    expect(result.fees.total).toBe(expectedBaseFee);
  });

  it('returns positive tokensOut and positive price impact', () => {
    const reserves = freshReserves();
    const result = sim.simulateBuy(reserves, 100_000n);

    expect(result.tokensOut).toBeGreaterThan(0n);
    expect(result.priceImpactBps).toBeGreaterThan(0);
    expect(result.newPriceSats).toBeGreaterThan(
      calculatePrice(reserves.aScaled, reserves.bScaled, 0n),
    );
  });

  it('new supply increases by tokensOut', () => {
    const reserves = freshReserves();
    const result = sim.simulateBuy(reserves, 100_000n);

    expect(result.newReserves.currentSupplyOnCurve).toBe(result.tokensOut);
  });

  it('realBtcReserve increases', () => {
    const reserves = freshReserves();
    const result = sim.simulateBuy(reserves, 100_000n);

    expect(result.newReserves.realBtcReserve).toBeGreaterThan(0n);
  });

  it('throws below MIN_TRADE_SATS', () => {
    expect(() => sim.simulateBuy(freshReserves(), 9999n)).toThrow('Below minimum');
  });

  it('throws when buy exceeds graduation threshold', () => {
    expect(() => sim.simulateBuy(freshReserves(), 7_100_000n)).toThrow('Exceeds graduation');
  });

  it('succeeds right at graduation threshold', () => {
    // netBtc = btcAmount * (10000 - 125) / 10000 <= 6_900_000
    // btcAmount <= 6_900_000 * 10000 / 9875 = 6_987_341
    const maxBuy = 6_987_341n;
    expect(() => sim.simulateBuy(freshReserves(), maxBuy)).not.toThrow();
  });

  it('includes flywheel fee when buyTaxBps > 0', () => {
    const reserves = freshReserves();
    const btcAmount = 100_000n;
    const buyTax = 100n; // 1%

    const withTax = sim.simulateBuy(reserves, btcAmount, buyTax);
    const noTax = sim.simulateBuy(reserves, btcAmount);

    expect(withTax.fees.flywheel).toBe((btcAmount * buyTax) / FEE_DENOMINATOR);
    expect(withTax.tokensOut).toBeLessThan(noTax.tokensOut);
  });
});

// ──────────────────────────────────────────────────────────
// 7. simulateSell
// ──────────────────────────────────────────────────────────
describe('simulateSell', () => {
  it('returns positive btcOut and correct fees', () => {
    const buyResult = sim.simulateBuy(freshReserves(), 100_000n);
    const result = sim.simulateSell(buyResult.newReserves, buyResult.tokensOut);

    expect(result.btcOut).toBeGreaterThan(0n);
    expect(result.fees.platform).toBeGreaterThan(0n);
    expect(result.fees.creator).toBeGreaterThan(0n);
    expect(result.fees.flywheel).toBe(0n);
  });

  it('throws when grossBtcOut exceeds realBtcReserve', () => {
    const buyResult = sim.simulateBuy(freshReserves(), 100_000n);
    const excessiveTokens = buyResult.tokensOut * 2n;

    expect(() => sim.simulateSell(buyResult.newReserves, excessiveTokens)).toThrow();
  });

  it('throws for tiny sell below MIN_TRADE_SATS', () => {
    const buyResult = sim.simulateBuy(freshReserves(), 100_000n);

    expect(() => sim.simulateSell(buyResult.newReserves, 1n)).toThrow(
      'Below minimum trade amount',
    );
  });

  it('includes flywheel fee on sell', () => {
    const buyResult = sim.simulateBuy(freshReserves(), 100_000n);
    const tokens = buyResult.tokensOut;

    const withTax = sim.simulateSell(buyResult.newReserves, tokens, 100n);
    const noTax = sim.simulateSell(buyResult.newReserves, tokens);

    expect(withTax.fees.flywheel).toBeGreaterThan(0n);
    expect(withTax.btcOut).toBeLessThan(noTax.btcOut);
  });
});

// ──────────────────────────────────────────────────────────
// 8. Roundtrip: buy then sell
// ──────────────────────────────────────────────────────────
describe('roundtrip buy → sell', () => {
  it('selling all tokens back yields less BTC than invested (fees)', () => {
    const btcAmount = 500_000n;
    const buyResult = sim.simulateBuy(freshReserves(), btcAmount);
    const sellResult = sim.simulateSell(buyResult.newReserves, buyResult.tokensOut);

    // User gets back less than they spent
    expect(sellResult.btcOut).toBeLessThan(btcAmount);
    expect(sellResult.btcOut).toBeGreaterThan(0n);
  });

  it('supply returns to 0 after selling all tokens', () => {
    const buyResult = sim.simulateBuy(freshReserves(), 500_000n);
    const sellResult = sim.simulateSell(buyResult.newReserves, buyResult.tokensOut);

    expect(sellResult.newReserves.currentSupplyOnCurve).toBe(0n);
  });

  it('realBtcReserve returns to 0 after selling all tokens', () => {
    const buyResult = sim.simulateBuy(freshReserves(), 500_000n);
    const sellResult = sim.simulateSell(buyResult.newReserves, buyResult.tokensOut);

    // May be 0 or 1 due to ceil(buy cost) vs floor(sell payout) rounding
    expect(sellResult.newReserves.realBtcReserve).toBeLessThanOrEqual(1n);
  });

  it('price returns to initial after full roundtrip', () => {
    const reserves = freshReserves();
    const initialPrice = calculatePrice(reserves.aScaled, reserves.bScaled, 0n);

    const buyResult = sim.simulateBuy(reserves, 500_000n);
    expect(buyResult.newPriceSats).toBeGreaterThan(initialPrice);

    const sellResult = sim.simulateSell(buyResult.newReserves, buyResult.tokensOut);
    expect(sellResult.newPriceSats).toBe(initialPrice);
  });
});

// ──────────────────────────────────────────────────────────
// 9. Sequential buys: price strictly increases
// ──────────────────────────────────────────────────────────
describe('sequential buys', () => {
  it('each successive buy gets fewer tokens for the same BTC', () => {
    let reserves = freshReserves();
    const btcAmount = 200_000n;
    let prevTokensOut = 0n;

    for (let i = 0; i < 5; i++) {
      const result = sim.simulateBuy(reserves, btcAmount);
      if (i > 0) {
        expect(result.tokensOut).toBeLessThan(prevTokensOut);
      }
      prevTokensOut = result.tokensOut;
      reserves = result.newReserves;
    }
  });

  it('price increases after each buy', () => {
    let reserves = freshReserves();
    let prevPrice = calculatePrice(reserves.aScaled, reserves.bScaled, reserves.currentSupplyOnCurve);

    for (let i = 0; i < 5; i++) {
      const result = sim.simulateBuy(reserves, 200_000n);
      expect(result.newPriceSats).toBeGreaterThan(prevPrice);
      prevPrice = result.newPriceSats;
      reserves = result.newReserves;
    }
  });
});

// ──────────────────────────────────────────────────────────
// 10. Full graduation scenario
// ──────────────────────────────────────────────────────────
describe('graduation scenario', () => {
  it('many small buys eventually reach graduation', () => {
    let reserves = freshReserves();
    const buyAmount = 500_000n; // 500k sats per trade
    let totalBtcIn = 0n;
    let tradeCount = 0;

    while (reserves.realBtcReserve < GRADUATION_THRESHOLD_SATS) {
      try {
        const result = sim.simulateBuy(reserves, buyAmount);
        totalBtcIn += buyAmount;
        reserves = result.newReserves;
        tradeCount++;
      } catch {
        // Hit threshold on last trade — expected
        break;
      }
      if (tradeCount > 100) throw new Error('Too many trades — graduation not reached');
    }

    expect(reserves.realBtcReserve).toBeGreaterThanOrEqual(GRADUATION_THRESHOLD_SATS - buyAmount);
    expect(tradeCount).toBeGreaterThan(1);
    expect(tradeCount).toBeLessThan(50);
  });
});
