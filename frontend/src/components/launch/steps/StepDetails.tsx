import { useRef, useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';

const MAX_FILE_SIZE = 500_000; // 500KB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

export function StepDetails() {
  const { formData, updateForm, nextStep } = useLaunchStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<'name' | 'symbol' | 'description', boolean>>({
    name: false,
    symbol: false,
    description: false,
  });

  const touch = (field: 'name' | 'symbol' | 'description') => {
    if (!touched[field]) setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Cleanup blob URL on unmount or when it changes
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const canProceed = formData.name.length >= 2 && formData.symbol.length >= 2 && formData.description.length >= 10;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Unsupported format. Use PNG, JPG, GIF, WebP, or SVG.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File too large (${(file.size / 1024).toFixed(0)}KB). Max 500KB.`);
      return;
    }

    updateForm({ imageFile: file, image: null });
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    const url = URL.createObjectURL(file);
    prevUrlRef.current = url;
    setPreviewUrl(url);
  };

  const clearImage = () => {
    updateForm({ imageFile: null, image: null });
    setPreviewUrl(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasImage = formData.imageFile || formData.image;

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">OP20 Token Details</h3>
        <p className="text-sm text-text-secondary">Name, symbol, and description for your OP20 token.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="token-name" className="text-sm text-text-secondary mb-1.5 block">Token Name</label>
          <Input
            id="token-name"
            placeholder="e.g. Bitcoin Pizza"
            value={formData.name}
            onChange={(e) => { touch('name'); updateForm({ name: e.target.value }); }}
            onBlur={() => touch('name')}
            maxLength={32}
            error={touched.name && formData.name.length > 0 && formData.name.length < 2 ? 'At least 2 characters' : undefined}
          />
          {formData.name.length >= 2 && (
            <p className="text-xs mt-1 text-text-muted">{formData.name.length}/32</p>
          )}
        </div>

        <div>
          <label htmlFor="token-symbol" className="text-sm text-text-secondary mb-1.5 block">Symbol</label>
          <Input
            id="token-symbol"
            placeholder="e.g. PIZZA"
            value={formData.symbol}
            onChange={(e) => { touch('symbol'); updateForm({ symbol: e.target.value.toUpperCase() }); }}
            onBlur={() => touch('symbol')}
            maxLength={8}
            error={touched.symbol && formData.symbol.length > 0 && formData.symbol.length < 2 ? 'At least 2 characters' : undefined}
          />
          {formData.symbol.length >= 2 && (
            <p className="text-xs mt-1 text-text-muted">{formData.symbol.length}/8</p>
          )}
        </div>

        <div>
          <label htmlFor="token-description" className="text-sm text-text-secondary mb-1.5 block">Description</label>
          <textarea
            id="token-description"
            className={`w-full h-24 px-3 py-2 rounded-lg bg-input border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none transition-colors ${touched.description && formData.description.length > 0 && formData.description.length < 10 ? 'border-bear' : 'border-border'}`}
            placeholder="What makes your token special?"
            value={formData.description}
            onChange={(e) => { touch('description'); updateForm({ description: e.target.value }); }}
            onBlur={() => touch('description')}
            maxLength={500}
          />
          {touched.description && formData.description.length > 0 && formData.description.length < 10 ? (
            <p className="text-xs text-bear mt-1">At least 10 characters</p>
          ) : (
            <p className="text-xs mt-1 text-text-muted">{formData.description.length}/500</p>
          )}
        </div>

        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Token Image</label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="w-20 h-20 rounded-xl bg-elevated border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-accent/50 transition-colors overflow-hidden"
          >
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
            ) : formData.image ? (
              <span className="text-3xl">{formData.image}</span>
            ) : (
              <span className="text-text-muted text-xs text-center px-1">Click to upload</span>
            )}
          </div>
          {hasImage && (
            <button type="button" onClick={clearImage} className="text-xs text-text-muted hover:text-bear mt-1">
              Remove
            </button>
          )}
          {fileError && <p className="text-xs text-bear mt-1">{fileError}</p>}
          <p className="text-xs text-text-muted mt-1">PNG, JPG, GIF, WebP, SVG. Max 500KB.</p>
          <div className="flex gap-2 mt-2">
            {['🚀', '🔥', '💎', '🐕', '🌙', '⚡'].map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => {
                  updateForm({ image: emoji, imageFile: null });
                  setPreviewUrl(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="w-8 h-8 rounded bg-elevated hover:bg-input text-lg flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!canProceed && (
        <p className="text-xs text-text-muted text-center">Fill in all required fields to continue</p>
      )}
      <Button onClick={nextStep} disabled={!canProceed} className="w-full" size="lg">
        Next: Socials
      </Button>
    </div>
  );
}
