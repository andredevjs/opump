export type AirdropCommunity = 'bitcoin_puppets' | 'motocats' | 'moto' | 'pill';
export type TaxDestination = 'burn' | 'creator';

export interface LaunchFormData {
  // Step 1: Details
  name: string;
  symbol: string;
  description: string;
  image: string | null; // emoji fallback
  imageFile: File | null; // uploaded image file

  // Step 2: Socials
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  github: string;

  // Step 3: Creator Allocation
  creatorAllocationPercent: number;

  // Step 4: Airdrop
  airdropEnabled: boolean;
  airdropCommunity: AirdropCommunity;
  airdropPercent: number;

  // Step 5: Flywheel Tax
  flywheelEnabled: boolean;
  buyTaxPercent: number;
  sellTaxPercent: number;
  taxDestination: TaxDestination;

  // Step 6: Deploy (no form data, just confirmation)
}

export type LaunchStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface DeployPhase {
  label: string;
  status: 'pending' | 'active' | 'completed';
}
