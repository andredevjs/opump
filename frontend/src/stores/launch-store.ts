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
  abortDeploy: () => void;
  reset: () => void;
}

const INITIAL_FORM: LaunchFormData = {
  name: '',
  symbol: '',
  description: '',
  image: null,
  imageFile: null,
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
  { label: 'Deploying contract — waiting for block confirmation (~10 min)...', status: 'pending' },
  { label: 'Registering token with factory...', status: 'pending' },
  { label: 'Saving token metadata...', status: 'pending' },
];

const STEPS: LaunchStep[] = [1, 2, 3, 4, 5, 6];

export const useLaunchStore = create<LaunchStore>((set) => ({
  currentStep: 1,
  formData: { ...INITIAL_FORM },
  deployPhases: DEPLOY_PHASES.map((p) => ({ ...p })),
  isDeploying: false,
  deployedAddress: null,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => {
    const idx = STEPS.indexOf(s.currentStep);
    return { currentStep: STEPS[Math.min(STEPS.length - 1, idx + 1)] };
  }),
  prevStep: () => set((s) => {
    const idx = STEPS.indexOf(s.currentStep);
    return { currentStep: STEPS[Math.max(0, idx - 1)] };
  }),
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

  abortDeploy: () =>
    set({
      isDeploying: false,
      deployPhases: DEPLOY_PHASES.map((p) => ({ ...p })),
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
