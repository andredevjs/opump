/**
 * Redis data access for the referral code system.
 * All referral keys use the `op:ref:` prefix.
 */

import { getRedis } from "./redis.mts";

// ─── Key helpers ────────────────────────────────────────────

const REF_CODE_KEY = (code: string) => `op:ref:code:${code.toUpperCase()}`;
const REF_WALLET_KEY = (wallet: string) => `op:ref:wallet:${wallet}`;
const REF_LINK_KEY = (wallet: string) => `op:ref:link:${wallet}`;
const REF_EARNINGS_KEY = (wallet: string) => `op:ref:earnings:${wallet}`;
const REF_REFERRED_BY_INDEX = (referrerWallet: string) => `op:idx:ref:by:${referrerWallet}`;

// ─── Code generation ────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ─── Code CRUD ──────────────────────────────────────────────

export async function createReferralCode(wallet: string, code: string): Promise<void> {
  const redis = getRedis();
  const upperCode = code.toUpperCase();
  await redis.pipeline()
    .hset(REF_CODE_KEY(upperCode), { wallet, createdAt: new Date().toISOString() })
    .set(REF_WALLET_KEY(wallet), upperCode)
    .exec();
}

export async function getReferralCode(wallet: string): Promise<string | null> {
  const redis = getRedis();
  return redis.get<string>(REF_WALLET_KEY(wallet));
}

export async function getCodeInfo(code: string): Promise<{ wallet: string; createdAt: string } | null> {
  const redis = getRedis();
  const data = await redis.hgetall<{ wallet: string; createdAt: string }>(REF_CODE_KEY(code.toUpperCase()));
  if (!data || !data.wallet) return null;
  return data;
}

// ─── Referral linking ───────────────────────────────────────

/**
 * Link a referred wallet to a referrer. Uses SET NX for first-touch immutability.
 * Returns true if newly linked, false if already linked.
 */
export async function linkWalletToReferrer(referredWallet: string, referrerWallet: string): Promise<boolean> {
  const redis = getRedis();
  // SET NX — only sets if key doesn't exist (first-touch)
  const wasSet = await redis.set(REF_LINK_KEY(referredWallet), referrerWallet, { nx: true });
  if (!wasSet) return false;

  // Add to referrer's index + increment referral count
  await redis.pipeline()
    .sadd(REF_REFERRED_BY_INDEX(referrerWallet), referredWallet)
    .hincrby(REF_EARNINGS_KEY(referrerWallet), "referralCount", 1)
    .exec();

  return true;
}

export async function getReferrer(wallet: string): Promise<string | null> {
  const redis = getRedis();
  return redis.get<string>(REF_LINK_KEY(wallet));
}

// ─── Earnings ───────────────────────────────────────────────

/**
 * Credit referral earnings atomically. Called on every trade by a referred user.
 */
export async function creditReferralEarnings(referrerWallet: string, satAmount: string): Promise<void> {
  const redis = getRedis();
  await redis.pipeline()
    .hincrby(REF_EARNINGS_KEY(referrerWallet), "totalSats", Number(satAmount))
    .hincrby(REF_EARNINGS_KEY(referrerWallet), "tradeCount", 1)
    .exec();
}

export async function getReferralEarnings(wallet: string): Promise<{ totalSats: string; tradeCount: number; referralCount: number }> {
  const redis = getRedis();
  const data = await redis.hgetall<Record<string, string>>(REF_EARNINGS_KEY(wallet));
  return {
    totalSats: data?.totalSats || "0",
    tradeCount: parseInt(data?.tradeCount || "0"),
    referralCount: parseInt(data?.referralCount || "0"),
  };
}

export async function getReferralCount(wallet: string): Promise<number> {
  const redis = getRedis();
  return redis.scard(REF_REFERRED_BY_INDEX(wallet));
}
