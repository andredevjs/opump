import { useMemo, useCallback } from 'react';
import BigNumber from 'bignumber.js';
import type { Token } from '@/types/token';
import type { TradeSimulation } from '@/types/trade';
import { calculateBuy, calculateSell } from '@/lib/bonding-curve';

export function useBondingCurve(token: Token | null) {
  const hasToken = token != null;
  const currentSupplyOnCurve = useMemo(
    () => new BigNumber(token?.currentSupplyOnCurve ?? '0'),
    [token?.currentSupplyOnCurve],
  );
  const aScaled = useMemo(
    () => new BigNumber(token?.aScaled ?? '0'),
    [token?.aScaled],
  );
  const bScaled = useMemo(
    () => new BigNumber(token?.bScaled ?? '0'),
    [token?.bScaled],
  );
  const realBtc = useMemo(
    () => new BigNumber(token?.realBtcReserve ?? '0'),
    [token?.realBtcReserve],
  );

  const simulateBuy = useCallback(
    (btcSats: string): TradeSimulation | null => {
      if (!hasToken || !btcSats || btcSats === '0') return null;
      return calculateBuy(currentSupplyOnCurve, aScaled, bScaled, btcSats, realBtc);
    },
    [hasToken, currentSupplyOnCurve, aScaled, bScaled, realBtc],
  );

  const simulateSell = useCallback(
    (tokenUnits: string): TradeSimulation | null => {
      if (!hasToken || !tokenUnits || tokenUnits === '0') return null;
      return calculateSell(currentSupplyOnCurve, aScaled, bScaled, tokenUnits);
    },
    [hasToken, currentSupplyOnCurve, aScaled, bScaled],
  );

  return { simulateBuy, simulateSell };
}
