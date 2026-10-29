import { badRequest, body, ok, rateLimited } from "@/lib/api";
import { requestOtp } from "@/lib/otp";
import { recordOutbox } from "@/lib/adapters";
import { boot } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  boot();
  const { phone, purpose } = await body<{ phone?: string; purpose?: string }>(req);
  if (!phone || String(phone).replace(/\D/g, "").length < 10) {
    return badRequest("Enter a 10-digit mobile number.");
  }

  const result = requestOtp(phone, purpose ?? "login");
  if (!result.ok) {
    if (result.error === "rate_limited") return rateLimited(`Wait ${result.retryAfter}s before requesting another code.`);
    return rateLimited("This number is locked for 15 minutes after too many wrong attempts.");
  }

  // Simulated SMS driver — the Console reads the same row.
  recordOutbox({
    channel: "otp",
    to: String(phone).replace(/\D/g, "").slice(-10),
    subject: "Docmate verification code",
    body: `Your Docmate code is ${result.code}. It expires in 5 minutes.`,
    meta: { code: result.code, expiresAt: result.expiresAt, purpose: result.purpose },
  });

  return ok({ phone: String(phone).replace(/\D/g, "").slice(-10), expiresAt: result.expiresAt });
}
