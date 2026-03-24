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
import { FACTORY_ADDRESS } from '@/config/constants';

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
const LAUNCH_TOKEN_WASM_URL = '/contracts/LaunchToken.wasm';

const flywheelDestMap: Record<TaxDestination, number> = {
  burn: 0,
  creator: 1,
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
      // Phase 1: Deploy LaunchToken contract via OPWallet
      advanceDeployPhase(0);

      const { deployLaunchToken, buildLaunchTokenCalldata } = await import('@/services/contract');

      const calldata = await buildLaunchTokenCalldata({
        name: formData.name,
        symbol: formData.symbol,
        creatorAllocationBps: BigInt(Math.round(formData.creatorAllocationPercent * 100)),
        buyTaxBps: BigInt(Math.round(formData.flywheelEnabled ? formData.buyTaxPercent * 100 : 0)),
        sellTaxBps: BigInt(Math.round(formData.flywheelEnabled ? formData.sellTaxPercent * 100 : 0)),
        flywheelDestination: BigInt(flywheelDestMap[formData.taxDestination]),
        vaultAddress: FACTORY_ADDRESS, // BTC outputs go to factory vault
      });

      const deployResult = await deployLaunchToken(
        LAUNCH_TOKEN_WASM_URL,
        calldata,
        walletAddress,
      );

      const contractAddress = deployResult.contractAddress;
      const deployTxHash = deployResult.revealTxHash;

      // Phase 2: Register with factory
      // No confirmation wait — mempool-first: the RPC exposes deployed
      // contracts as soon as the reveal tx is broadcast.
      advanceDeployPhase(1);

      if (FACTORY_ADDRESS) {
        const { getFactoryContract, sendContractCall } = await import('@/services/contract');

        // Retry wrapper: the RPC node may need a moment to index the
        // mempool deployment before the factory can see the new contract.
        const MAX_RETRIES = 5;
        const RETRY_DELAY_MS = 3_000;
        let lastError: unknown;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const factory = getFactoryContract(FACTORY_ADDRESS);
            const sim = await factory.registerToken(
              formData.name,
              formData.symbol,
              BigInt(Math.round(formData.creatorAllocationPercent * 100)),
              BigInt(Math.round(formData.flywheelEnabled ? formData.buyTaxPercent * 100 : 0)),
              BigInt(Math.round(formData.flywheelEnabled ? formData.sellTaxPercent * 100 : 0)),
              BigInt(flywheelDestMap[formData.taxDestination]),
            );
            await sendContractCall(sim, {
              refundTo: walletAddress,
              maximumAllowedSatToSpend: 100000n,
            });
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES - 1) {
              await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            }
          }
        }

        if (lastError) throw lastError;
      }

      // Phase 3: Upload image + register metadata in backend
      advanceDeployPhase(2);

      let imageUrl = '';
      if (formData.imageFile) {
        const base64 = await fileToBase64(formData.imageFile);
        const uploaded = await uploadImage({
          data: base64,
          contentType: formData.imageFile.type,
        });
        imageUrl = uploaded.url;
      }

      const flywheelDestNames = ['burn', 'creator'] as const;

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
        deployTxHash,
      });

      setDeployedAddress(contractAddress);
      toast.success('Token deployed successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deployment failed');
      abortDeploy();
    }
  }, [connected, walletAddress, formData, abortDeploy, advanceDeployPhase, setDeployedAddress, startDeploy]);

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Deploy OP20 Token</h3>
        <p className="text-sm text-text-secondary">Review and launch your OP20 token on OPNet.</p>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-elevated space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-input flex items-center justify-center text-2xl overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt="OP20 Token" className="w-full h-full object-cover" />
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
          <p className="text-lg font-semibold text-bull">OP20 Token Deployed!</p>
          <p className="text-sm text-text-secondary">Your OP20 token is now live on OPNet.</p>
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
                Deploy OP20 Token
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
