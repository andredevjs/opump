import { create } from 'zustand';
import type { LaunchFormData, LaunchStep, DeployPhase } from '@/types/launch';

interface LaunchStore {
  currentStep: LaunchStep;
  formData: LaunchFormData;
  deployPhases: DeployPhase[];
  isDeploying: boolean;
  deployedAddress: string | null;
  setStep: (step: LaunchStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateForm: (data: Partial<LaunchFormData>) => void;
  startDeploy: () => void;
  advanceDeployPhase: (index: number) => void;
  setDeployedAddress: (address: string) => void;
  reset: () => void;
}

const INITIAL_FORM: LaunchFormData = {
  name: '',
  symbol: '',
  description: '',
  image: null,
  website: '',
  twitter: '',
  telegram: '',
  discord: '',
  github: '',
  creatorAllocationPercent: 0,
  airdropEnabled: false,
  airdropType: 'moto_holders',
  airdropPercent: 5,
  customAddresses: '',
  flywheelEnabled: false,
  buyTaxPercent: 0,
  sellTaxPercent: 0,
  taxDestination: 'burn',
};

const DEPLOY_PHASES: DeployPhase[] = [
  { label: 'Compiling contract...', status: 'pending' },
  { label: 'Broadcasting to OPNet...', status: 'pending' },
  { label: 'Confirming on Bitcoin...', status: 'pending' },
];

export const useLaunchStore = create<LaunchStore>((set) => ({
  currentStep: 1,
  formData: { ...INITIAL_FORM },
  deployPhases: DEPLOY_PHASES.map((p) => ({ ...p })),
  isDeploying: false,
  deployedAddress: null,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: Math.min(6, s.currentStep + 1) as LaunchStep })),
  prevStep: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) as LaunchStep })),
  updateForm: (data) => set((s) => ({ formData: { ...s.formData, ...data } })),
  startDeploy: () => set({ isDeploying: true }),

  advanceDeployPhase: (index) =>
    set((s) => ({
      deployPhases: s.deployPhases.map((p, i) => ({
        ...p,
        status: i < index ? 'completed' : i === index ? 'active' : 'pending',
      })),
    })),

  setDeployedAddress: (address) =>
    set({
      deployedAddress: address,
      isDeploying: false,
      deployPhases: DEPLOY_PHASES.map((p) => ({ ...p, status: 'completed' })),
    }),

  reset: () =>
    set({
      currentStep: 1,
      formData: { ...INITIAL_FORM },
      deployPhases: DEPLOY_PHASES.map((p) => ({ ...p })),
      isDeploying: false,
      deployedAddress: null,
    }),
}));
