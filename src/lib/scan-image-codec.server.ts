import sharp from "sharp";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function scanEncryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("SCAN_IMAGE_ENCRYPTION_KEY must contain 64 hexadecimal characters.");
  }
  return Buffer.from(value, "hex");
}

export function encryptScanImage(image: Uint8Array, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(image), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptScanImage(payload: string, key: Buffer): Buffer {
  const bytes = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}

export async function normalizeScanImage(image: Uint8Array): Promise<Buffer> {
  const options = { limitInputPixels: 20_000_000, failOn: "warning" as const, animated: false };
  const metadata = await sharp(image, options).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 100 ||
    metadata.height < 100 ||
    (metadata.pages ?? 1) > 1 ||
    !["jpeg", "png", "webp"].includes(metadata.format ?? "")
  ) {
    throw new Error(
      "Use a clear, static screenshot at least 100 x 100 pixels (up to 20 megapixels).",
    );
  }
  // Full decode rejects corrupt files; re-encoding drops EXIF/location metadata.
  const normalized = await sharp(image, options)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  if (normalized.byteLength > 4 * 1024 * 1024) {
    throw new Error("Decoded screenshot is too large. Crop it to the visible fixtures.");
  }
  return normalized;
}
