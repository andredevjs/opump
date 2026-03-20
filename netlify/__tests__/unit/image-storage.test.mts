import { describe, it, expect, beforeEach } from 'vitest';
import { resetBlobStore } from '../mocks/blobs-mock.js';
import { uploadImage } from '../../functions/_shared/image-storage.mts';

describe('uploadImage()', () => {
  beforeEach(() => resetBlobStore());

  it('returns a url containing "/api/images/" for a valid PNG upload', async () => {
    const base64 = btoa('x'.repeat(100));
    const result = await uploadImage(base64, 'image/png');
    expect(result.url).toContain('/api/images/');
  });

  it('throws "Unsupported image type" for application/pdf', async () => {
    const base64 = btoa('x'.repeat(100));
    await expect(uploadImage(base64, 'application/pdf')).rejects.toThrow('Unsupported image type');
  });

  it('throws a size limit error when data exceeds 500KB', async () => {
    const base64 = btoa('x'.repeat(500_001));
    await expect(uploadImage(base64, 'image/png')).rejects.toThrow('500000 bytes limit');
  });

  it('accepts all 5 allowed content types', async () => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    const base64 = btoa('x'.repeat(100));

    for (const contentType of allowedTypes) {
      const result = await uploadImage(base64, contentType);
      expect(result.url).toContain('/api/images/');
    }
  });

  it('generates a URL with the correct file extension for image/png', async () => {
    const base64 = btoa('x'.repeat(100));
    const result = await uploadImage(base64, 'image/png');
    expect(result.url).toMatch(/\.png$/);
  });
});
