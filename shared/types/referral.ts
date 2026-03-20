export interface ReferralEarnings {
  totalSats: string;
  tradeCount: number;
  referralCount: number;
}

export interface ReferralInfo {
  code: string | null;
  earnings: ReferralEarnings;
  referredBy: string | null;
}

export interface LinkReferralRequest {
  walletAddress: string;
  referralCode: string;
}

export interface LinkReferralResponse {
  ok: boolean;
  referrerAddress: string;
}

export interface BulkCreateRequest {
  wallets: string[];
  secret: string;
}

export interface BulkCreateResponse {
  created: number;
  skipped: number;
  codes: { wallet: string; code: string }[];
}
