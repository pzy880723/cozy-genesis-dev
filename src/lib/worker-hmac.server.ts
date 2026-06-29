import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

function getSecret(): string {
  const s = process.env.WORKER_SHARED_SECRET;
  if (!s) throw new Error("WORKER_SHARED_SECRET is not configured");
  return s;
}

export function verifyBearer(request: Request): { ok: true } | { ok: false; reason: string } {
  const h = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!h || !h.startsWith("Bearer ")) return { ok: false, reason: "missing bearer" };
  const token = h.slice(7).trim();
  const expected = getSecret();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "token mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "token mismatch" };
}

/**
 * 校验 Worker 回调签名：
 *   X-Worker-Timestamp: 毫秒级 UNIX 时间戳
 *   X-Worker-Signature: hex(hmac_sha256(secret, timestamp + "." + raw_body))
 */
export function verifyHmac(
  request: Request,
  rawBody: string,
): { ok: true } | { ok: false; reason: string } {
  const ts = request.headers.get("x-worker-timestamp");
  const sig = request.headers.get("x-worker-signature");
  if (!ts || !sig) return { ok: false, reason: "missing signature headers" };
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) return { ok: false, reason: "timestamp skew" };
  const expected = createHmac("sha256", getSecret()).update(`${ts}.${rawBody}`).digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "signature mismatch" };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}