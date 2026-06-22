import { createHash, randomBytes, timingSafeEqual } from "crypto";

  export function newSecret(): string {
    return randomBytes(32).toString("hex");
  }

  export function hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  export function verifySecret(provided: string | null | undefined, storedHash: string): boolean {
    if (!provided) return false;
    const a = Buffer.from(hashSecret(provided), "hex");
    const b = Buffer.from(storedHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }