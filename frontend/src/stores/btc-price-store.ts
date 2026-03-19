import { create } from 'zustand';

const STORAGE_KEY = 'btc-usd-price';
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

interface BtcPriceStore {
  btcUsdPrice: number;
  lastFetchedAt: number;
  loading: boolean;
  fetchBtcPrice: () => Promise<void>;
  startPolling: () => () => void;
}

function loadCached(): { price: number; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.price === 'number' && parsed.price > 0) return parsed;
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function saveCache(price: number) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ price, timestamp: Date.now() }),
  );
}

const cached = loadCached();

export const useBtcPriceStore = create<BtcPriceStore>((set, get) => ({
  btcUsdPrice: cached?.price ?? 0,
  lastFetchedAt: cached?.timestamp ?? 0,
  loading: !cached,

  fetchBtcPrice: async () => {
    try {
      const res = await fetch(COINGECKO_URL);
      if (!res.ok) return;
      const data = await res.json();
      const price = data?.bitcoin?.usd;
      if (typeof price === 'number' && price > 0) {
        set({ btcUsdPrice: price, lastFetchedAt: Date.now(), loading: false });
        saveCache(price);
      }
    } catch {
      // Keep last known price — UI unaffected
      if (get().btcUsdPrice > 0) set({ loading: false });
    }
  },

  startPolling: () => {
    get().fetchBtcPrice();
    const id = setInterval(() => get().fetchBtcPrice(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  },
}));

export function useBtcPrice(): { btcPrice: number; loading: boolean } {
  const btcPrice = useBtcPriceStore((s) => s.btcUsdPrice);
  const loading = useBtcPriceStore((s) => s.loading);
  return { btcPrice, loading };
}
