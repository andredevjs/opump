import { useMemo, useCallback } from 'react';
import BigNumber from 'bignumber.js';
import type { Token } from '@/types/token';
import type { TradeSimulation } from '@/types/trade';
import { calculateBuy, calculateSell } from '@/lib/bonding-curve';

export function useBondingCurve(token: Token | null) {
  const hasToken = token != null;
  const virtualBtc = useMemo(
    () => new BigNumber(token?.virtualBtcReserve ?? '0'),
    [token?.virtualBtcReserve],
  );
  const virtualToken = useMemo(
    () => new BigNumber(token?.virtualTokenSupply ?? '0'),
    [token?.virtualTokenSupply],
  );

  const simulateBuy = useCallback(
    (btcSats: string): TradeSimulation | null => {
      if (!hasToken || !btcSats || btcSats === '0') return null;
      return calculateBuy(virtualBtc, virtualToken, btcSats);
    },
    [hasToken, virtualBtc, virtualToken],
  );

  const simulateSell = useCallback(
    (tokenUnits: string): TradeSimulation | null => {
      if (!hasToken || !tokenUnits || tokenUnits === '0') return null;
      return calculateSell(virtualBtc, virtualToken, tokenUnits);
    },
    [hasToken, virtualBtc, virtualToken],
  );

  return { simulateBuy, simulateSell };
}
