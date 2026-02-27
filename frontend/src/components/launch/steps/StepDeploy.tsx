import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLaunchStore } from '@/stores/launch-store';
import { cn } from '@/lib/cn';
import { Check, Loader2, Circle, Rocket, ExternalLink } from 'lucide-react';
import { MOCK_TOKENS } from '@/mock/tokens';

export function StepDeploy() {
  const navigate = useNavigate();
  const {
    formData,
    deployPhases,
    isDeploying,
    deployedAddress,
    prevStep,
    startDeploy,
    advanceDeployPhase,
    setDeployedAddress,
  } = useLaunchStore();

  const handleDeploy = useCallback(async () => {
    startDeploy();

    // Phase 1: Compiling (2s)
    advanceDeployPhase(0);
    await new Promise((r) => setTimeout(r, 2000));

    // Phase 2: Broadcasting (3s)
    advanceDeployPhase(1);
    await new Promise((r) => setTimeout(r, 3000));

    // Phase 3: Confirming (4s)
    advanceDeployPhase(2);
    await new Promise((r) => setTimeout(r, 4000));

    // Done — pick a random mock token address
    const randomToken = MOCK_TOKENS[Math.floor(Math.random() * MOCK_TOKENS.length)];
    setDeployedAddress(randomToken.address);
  }, []);

  const PhaseIcon = ({ status }: { status: string }) => {
    if (status === 'completed') return <Check size={16} className="text-bull" />;
    if (status === 'active') return <Loader2 size={16} className="text-accent animate-spin" />;
    return <Circle size={16} className="text-text-muted" />;
  };

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Deploy Token</h3>
        <p className="text-sm text-text-secondary">Review and launch your token on OPNet.</p>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-elevated space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-input flex items-center justify-center text-2xl">
            {formData.image || '🪙'}
          </div>
          <div>
            <p className="font-semibold text-text-primary">{formData.name || 'Untitled Token'}</p>
            <p className="text-sm text-text-muted">${formData.symbol || 'TOKEN'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-input">
            <span className="text-text-muted">Creator Alloc</span>
            <p className="font-mono text-text-primary">{formData.creatorAllocationPercent}%</p>
          </div>
          <div className="p-2 rounded bg-input">
            <span className="text-text-muted">Airdrop</span>
            <p className="font-mono text-text-primary">
              {formData.airdropEnabled ? `${formData.airdropPercent}%` : 'None'}
            </p>
          </div>
          <div className="p-2 rounded bg-input">
            <span className="text-text-muted">Buy Tax</span>
            <p className="font-mono text-text-primary">
              {formData.flywheelEnabled ? `${formData.buyTaxPercent}%` : '0%'}
            </p>
          </div>
          <div className="p-2 rounded bg-input">
            <span className="text-text-muted">Sell Tax</span>
            <p className="font-mono text-text-primary">
              {formData.flywheelEnabled ? `${formData.sellTaxPercent}%` : '0%'}
            </p>
          </div>
        </div>
      </div>

      {/* Deploy phases */}
      {(isDeploying || deployedAddress) && (
        <div className="space-y-3">
          {deployPhases.map((phase, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg transition-colors',
                phase.status === 'active' && 'bg-accent/5',
                phase.status === 'completed' && 'bg-bull/5',
              )}
            >
              <PhaseIcon status={phase.status} />
              <span className={cn(
                'text-sm',
                phase.status === 'active' ? 'text-accent' : phase.status === 'completed' ? 'text-bull' : 'text-text-muted',
              )}>
                {phase.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Success */}
      {deployedAddress && (
        <div className="text-center space-y-3 p-4 rounded-lg bg-bull/5 border border-bull/20">
          <div className="text-4xl">🎉</div>
          <p className="text-lg font-semibold text-bull">Token Deployed!</p>
          <p className="text-sm text-text-secondary">Your token is now live on OPNet.</p>
          <Button
            onClick={() => navigate(`/token/${deployedAddress}`)}
            className="w-full"
            size="lg"
          >
            <ExternalLink size={16} className="mr-2" />
            View Token
          </Button>
        </div>
      )}

      {/* Actions */}
      {!deployedAddress && (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={prevStep} disabled={isDeploying} className="flex-1" size="lg">
            Back
          </Button>
          <Button onClick={handleDeploy} disabled={isDeploying} className="flex-1" size="lg">
            {isDeploying ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Rocket size={16} className="mr-2" />
                Deploy Token
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
