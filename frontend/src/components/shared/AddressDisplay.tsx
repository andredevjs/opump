import { Copy, ExternalLink } from 'lucide-react';
import { shortenAddress } from '@/lib/format';
import { cn } from '@/lib/cn';
import toast from 'react-hot-toast';

interface AddressDisplayProps {
  address: string;
  chars?: number;
  showCopy?: boolean;
  showLink?: boolean;
  className?: string;
}

export function AddressDisplay({ address, chars = 6, showCopy = true, showLink = false, className }: AddressDisplayProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied');
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-sm text-text-secondary', className)}>
      {shortenAddress(address, chars)}
      {showCopy && (
        <button onClick={handleCopy} className="hover:text-accent transition-colors">
          <Copy size={14} />
        </button>
      )}
      {showLink && (
        <a href="#" className="hover:text-accent transition-colors">
          <ExternalLink size={14} />
        </a>
      )}
    </span>
  );
}
