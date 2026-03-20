import { ReferralDashboard } from '@/components/referral/ReferralDashboard';

export function ReferralPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Referrals</h1>
      <ReferralDashboard />
    </div>
  );
}
