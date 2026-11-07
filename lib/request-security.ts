const encoder = new TextEncoder();

export const MAX_INBOUND_EMAIL_BYTES = 1_000_000;

export function exceedsContentLength(request: Request, maximum: number) {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > maximum;
}

/** Compares shared secrets without revealing where a mismatch occurs. */
export async function secretMatches(expected: string | undefined, supplied: string | null | undefined) {
  if (!expected || !supplied) return false;
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  const left = new Uint8Array(expectedHash);
  const right = new Uint8Array(suppliedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}
