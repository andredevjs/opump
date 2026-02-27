import { useMemo } from 'react';
import BigNumber from 'bignumber.js';
import type { Token } from '@/types/token';
import type { TradeSimulation } from '@/types/trade';
import { calculateBuy, calculateSell } from '@/lib/bonding-curve';

export function useBondingCurve(token: Token | null) {
  const virtualBtc = useMemo(
    () => (token ? new BigNumber(token.virtualBtcReserve) : new BigNumber(0)),
    [token?.virtualBtcReserve],
  );
  const virtualToken = useMemo(
    () => (token ? new BigNumber(token.virtualTokenSupply) : new BigNumber(0)),
    [token?.virtualTokenSupply],
  );

  const simulateBuy = (btcSats: number): TradeSimulation | null => {
    if (!token || btcSats <= 0) return null;
    return calculateBuy(virtualBtc, virtualToken, btcSats);
  };

  const simulateSell = (tokenUnits: number): TradeSimulation | null => {
    if (!token || tokenUnits <= 0) return null;
    return calculateSell(virtualBtc, virtualToken, tokenUnits);
  };

  return { simulateBuy, simulateSell };
}
