export const MAX_SCAN_BYTES = 5 * 1024 * 1024;
export const SCAN_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ScanMediaType = (typeof SCAN_TYPES)[number];
export type ScanResult = { analysis: string; balance: number };

export function isScanMediaType(type: string): type is ScanMediaType {
  return SCAN_TYPES.some((allowed) => allowed === type);
}

export function matchesScanSignature(bytes: Uint8Array, type: ScanMediaType): boolean {
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  }
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

export function isScanResult(value: unknown): value is ScanResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "analysis" in value &&
    typeof value.analysis === "string" &&
    "balance" in value &&
    typeof value.balance === "number" &&
    Number.isInteger(value.balance) &&
    value.balance >= 0
  );
}
