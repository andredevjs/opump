import { describe, it, expect } from 'vitest';
import { computeOptimistic24hChange } from '../price-utils';

describe('computeOptimistic24hChange', () => {
  it('returns 0 when oldPriceSats is 0', () => {
    expect(computeOptimistic24hChange(0, 10, 100)).toBe(0);
  });

  it('returns 0 when oldPriceSats is negative', () => {
    expect(computeOptimistic24hChange(-1, 0, 100)).toBe(0);
  });

  it('returns positive change when new price is higher than 24h reference', () => {
    // old price = 100, old change = 0% → refPrice = 100
    // new price = 150 → change = 50%
    const result = computeOptimistic24hChange(100, 0, 150);
    expect(result).toBe(50);
  });

  it('returns negative change when new price is lower than 24h reference', () => {
    // old price = 100, old change = 0% → refPrice = 100
    // new price = 80 → change = -20%
    const result = computeOptimistic24hChange(100, 0, 80);
    expect(result).toBe(-20);
  });

  it('correctly derives reference price from old change', () => {
    // old price = 110, old change = 10% → refPrice = 110 / 1.10 = 100
    // new price = 120 → change = 20%
    const result = computeOptimistic24hChange(110, 10, 120);
    expect(result).toBeCloseTo(20, 5);
  });

  it('returns 0 change when new price equals reference price', () => {
    // old price = 110, old change = 10% → refPrice = 100
    // new price = 100 → change = 0%
    const result = computeOptimistic24hChange(110, 10, 100);
    expect(result).toBeCloseTo(0, 5);
  });

  it('handles large negative old change', () => {
    // old price = 50, old change = -50% → refPrice = 50 / 0.5 = 100
    // new price = 75 → change = -25%
    const result = computeOptimistic24hChange(50, -50, 75);
    expect(result).toBeCloseTo(-25, 5);
  });

  it('returns 0 when old change is -100% (division by zero)', () => {
    // refPrice = oldPrice / (1 + (-100/100)) = oldPrice / 0 = Infinity
    const result = computeOptimistic24hChange(100, -100, 150);
    expect(result).toBe(0);
  });

  it('handles fractional prices', () => {
    // old price = 0.5, old change = 0% → refPrice = 0.5
    // new price = 0.75 → change = 50%
    const result = computeOptimistic24hChange(0.5, 0, 0.75);
    expect(result).toBeCloseTo(50, 5);
  });
});
