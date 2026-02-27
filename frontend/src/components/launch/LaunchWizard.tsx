import { useLaunchStore } from '@/stores/launch-store';
import { StepIndicator } from './StepIndicator';
import { StepDetails } from './steps/StepDetails';
import { StepSocials } from './steps/StepSocials';
import { StepAllocation } from './steps/StepAllocation';
import { StepAirdrop } from './steps/StepAirdrop';
import { StepFlywheel } from './steps/StepFlywheel';
import { StepDeploy } from './steps/StepDeploy';
import { motion, AnimatePresence } from 'framer-motion';

export function LaunchWizard() {
  const currentStep = useLaunchStore((s) => s.currentStep);

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <StepDetails />;
      case 2: return <StepSocials />;
      case 3: return <StepAllocation />;
      case 4: return <StepAirdrop />;
      case 5: return <StepFlywheel />;
      case 6: return <StepDeploy />;
      default: return null;
    }
  };

  return (
    <div>
      <StepIndicator currentStep={currentStep} />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
