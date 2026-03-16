import { useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { useWalletStore } from '@/stores/wallet-store';
import { cn } from '@/lib/cn';
import { Check, Loader2, Circle, Rocket, ExternalLink } from 'lucide-react';
import { createToken, uploadImage } from '@/services/api';
import toast from 'react-hot-toast';
import type { TaxDestination } from '@/types/launch';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URI prefix (e.g. "data:image/png;base64,")
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '';

const flywheelDestMap: Record<TaxDestination, number> = {
  burn: 0,
  community_pool: 1,
  creator_wallet: 2,
};

function PhaseIcon({ status }: { status: string }) {
  if (status === 'completed') return <Check size={16} className="text-bull" />;
  if (status === 'active') return <Loader2 size={16} className="text-accent animate-spin" />;
  return <Circle size={16} className="text-text-muted" />;
}

export function StepDeploy() {
  const navigate = useNavigate();
  const { connected, address: walletAddress } = useWalletStore();
  const {
    formData,
    deployPhases,
    isDeploying,
    deployedAddress,
    prevStep,
    startDeploy,
    advanceDeployPhase,
    setDeployedAddress,
    abortDeploy,
  } = useLaunchStore();

  const previewUrl = useMemo(
    () => (formData.imageFile ? URL.createObjectURL(formData.imageFile) : null),
    [formData.imageFile],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDeploy = useCallback(async () => {
    if (!connected || !walletAddress) {
      toast.error('Connect your wallet first');
      return;
    }

    startDeploy();

    try {
      // Phase 1: Get factory contract
      advanceDeployPhase(0);

      if (!FACTORY_ADDRESS) {
        throw new Error('Factory contract address not configured (VITE_FACTORY_ADDRESS)');
      }
      const { getFactoryContract, sendContractCall } = await import('@/services/contract');
      const factory = getFactoryContract(FACTORY_ADDRESS);

      // Phase 2: Deploy via factory contract
      advanceDeployPhase(1);

      const sim = await factory.deployToken(
        formData.name,
        formData.symbol,
        BigInt(Math.round(formData.creatorAllocationPercent * 100)),
        BigInt(Math.round(formData.flywheelEnabled ? formData.buyTaxPercent * 100 : 0)),
        BigInt(Math.round(formData.flywheelEnabled ? formData.sellTaxPercent * 100 : 0)),
        BigInt(flywheelDestMap[formData.taxDestination]),
      );
      const result = await sendContractCall(sim, {
        refundTo: walletAddress,
        maximumAllowedSatToSpend: 100000n,
      });

      const contractAddress = result.txHash;

      // Phase 3: Register metadata in backend
      advanceDeployPhase(2);

      // Upload image if a file was selected
      let imageUrl = '';
      if (formData.imageFile) {
        const base64 = await fileToBase64(formData.imageFile);
        const uploaded = await uploadImage({
          data: base64,
          contentType: formData.imageFile.type,
        });
        imageUrl = uploaded.url;
      }

      const flywheelDestNames = ['burn', 'communityPool', 'creator'] as const;

      await createToken({
        name: formData.name,
        symbol: formData.symbol,
        description: formData.description,
        imageUrl,
        socials: {
          website: formData.website || undefined,
          twitter: formData.twitter || undefined,
          telegram: formData.telegram || undefined,
          discord: formData.discord || undefined,
          github: formData.github || undefined,
        },
        creatorAddress: walletAddress,
        contractAddress,
        config: {
          creatorAllocationBps: Math.round(formData.creatorAllocationPercent * 100),
          buyTaxBps: formData.flywheelEnabled ? Math.round(formData.buyTaxPercent * 100) : 0,
          sellTaxBps: formData.flywheelEnabled ? Math.round(formData.sellTaxPercent * 100) : 0,
          flywheelDestination: flywheelDestNames[flywheelDestMap[formData.taxDestination]],
        },
        deployTxHash: result.txHash,
      });

      setDeployedAddress(contractAddress);
      toast.success('Token deployed successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deployment failed');
      abortDeploy();
    }
  }, [connected, walletAddress, formData]);

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Deploy Token</h3>
        <p className="text-sm text-text-secondary">Review and launch your token on OPNet.</p>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-elevated space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-input flex items-center justify-center text-2xl overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt="Token" className="w-full h-full object-cover" />
            ) : (
              formData.image || '🪙'
            )}
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
              None
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
          <Button
            onClick={handleDeploy}
            disabled={isDeploying || !connected || !FACTORY_ADDRESS}
            className="flex-1"
            size="lg"
          >
            {isDeploying ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Deploying...
              </>
            ) : !FACTORY_ADDRESS ? (
              'Factory Not Configured'
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
