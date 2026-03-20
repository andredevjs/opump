import { describe, it, expect, beforeEach } from 'vitest';
import { useLaunchStore } from '../launch-store';

describe('launch-store', () => {
  beforeEach(() => {
    useLaunchStore.setState(useLaunchStore.getInitialState());
  });

  describe('step navigation', () => {
    it('starts at step 1', () => {
      expect(useLaunchStore.getState().currentStep).toBe(1);
    });

    it('advances to next step', () => {
      useLaunchStore.getState().nextStep();
      expect(useLaunchStore.getState().currentStep).toBe(2);
    });

    it('goes back to previous step', () => {
      useLaunchStore.getState().nextStep();
      useLaunchStore.getState().nextStep();
      useLaunchStore.getState().prevStep();
      expect(useLaunchStore.getState().currentStep).toBe(2);
    });

    it('does not go below step 1', () => {
      useLaunchStore.getState().prevStep();
      expect(useLaunchStore.getState().currentStep).toBe(1);
    });

    it('does not go above step 6', () => {
      for (let i = 0; i < 10; i++) useLaunchStore.getState().nextStep();
      expect(useLaunchStore.getState().currentStep).toBe(6);
    });
  });

  describe('form data', () => {
    it('starts with empty form', () => {
      const { formData } = useLaunchStore.getState();
      expect(formData.name).toBe('');
      expect(formData.symbol).toBe('');
      expect(formData.creatorAllocationPercent).toBe(0);
    });

    it('updates form data partially', () => {
      useLaunchStore.getState().updateForm({ name: 'MyToken', symbol: 'MT' });
      const { formData } = useLaunchStore.getState();
      expect(formData.name).toBe('MyToken');
      expect(formData.symbol).toBe('MT');
      expect(formData.description).toBe(''); // unchanged
    });
  });

  describe('deploy phases', () => {
    it('starts with all phases pending', () => {
      const { deployPhases } = useLaunchStore.getState();
      expect(deployPhases.every((p) => p.status === 'pending')).toBe(true);
    });

    it('startDeploy sets isDeploying', () => {
      useLaunchStore.getState().startDeploy();
      expect(useLaunchStore.getState().isDeploying).toBe(true);
    });

    it('advanceDeployPhase marks prior phases completed and current active', () => {
      useLaunchStore.getState().advanceDeployPhase(1);
      const phases = useLaunchStore.getState().deployPhases;
      expect(phases[0].status).toBe('completed');
      expect(phases[1].status).toBe('active');
      expect(phases[2].status).toBe('pending');
    });

    it('setDeployedAddress completes all phases and clears isDeploying', () => {
      useLaunchStore.getState().startDeploy();
      useLaunchStore.getState().setDeployedAddress('bcrt1qresult');
      const state = useLaunchStore.getState();
      expect(state.deployedAddress).toBe('bcrt1qresult');
      expect(state.isDeploying).toBe(false);
      expect(state.deployPhases.every((p) => p.status === 'completed')).toBe(true);
    });

    it('abortDeploy resets deploy state', () => {
      useLaunchStore.getState().startDeploy();
      useLaunchStore.getState().advanceDeployPhase(1);
      useLaunchStore.getState().abortDeploy();
      const state = useLaunchStore.getState();
      expect(state.isDeploying).toBe(false);
      expect(state.deployPhases.every((p) => p.status === 'pending')).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets everything back to initial state', () => {
      useLaunchStore.getState().nextStep();
      useLaunchStore.getState().nextStep();
      useLaunchStore.getState().updateForm({ name: 'X' });
      useLaunchStore.getState().startDeploy();
      useLaunchStore.getState().setDeployedAddress('addr');

      useLaunchStore.getState().reset();

      const state = useLaunchStore.getState();
      expect(state.currentStep).toBe(1);
      expect(state.formData.name).toBe('');
      expect(state.isDeploying).toBe(false);
      expect(state.deployedAddress).toBeNull();
    });
  });
});
