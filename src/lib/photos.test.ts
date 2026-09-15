import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { prepareForVision } from './photos';

/** The API refuses any single image whose base64 payload passes 10 MiB. */
const API_LIMIT = 10 * 1024 * 1024;

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 210, g: 130, b: 70 } } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

describe('prepareForVision', () => {
  it('brings an oversized screenshot under the API limit', async () => {
    // Roughly the 11 MB phone screenshot that produced a raw 400 from the API.
    const huge = await png(3000, 4000);
    expect(huge.byteLength).toBeGreaterThan(API_LIMIT);

    const prepared = await prepareForVision(huge);
    expect(prepared.base64.length).toBeLessThan(API_LIMIT);
    expect(prepared.mediaType).toBe('image/jpeg');
  }, 30_000);

  it('caps the long edge at 1568px, which is all the model looks at', async () => {
    const wide = await png(4000, 1000);
    const prepared = await prepareForVision(wide);
    const meta = await sharp(Buffer.from(prepared.base64, 'base64')).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1568);
  }, 30_000);

  it('leaves a small image small rather than blowing it up', async () => {
    const small = await png(600, 400);
    const prepared = await prepareForVision(small);
    const meta = await sharp(Buffer.from(prepared.base64, 'base64')).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(400);
  }, 30_000);

  it('produces something the API would accept for eight images at once', async () => {
    const page = await png(3000, 2000);
    const prepared = await prepareForVision(page);
    // Eight of these still have to fit in one request.
    expect(prepared.base64.length * 8).toBeLessThan(32 * 1024 * 1024);
  }, 30_000);
});
