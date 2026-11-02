import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { getGoogleOAuthCreds, reloadAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const creds = getGoogleOAuthCreds();
  return {
    configured: Boolean(creds),
    clientIdPreview: creds ? `${creds.clientId.slice(0, 12)}…` : null,
  };
});

const Body = z.object({
  clientId: z.string().min(10),
  clientSecret: z.string().min(6),
  resendApiKey: z.string().optional(),
  emailFrom: z.string().optional(),
});

export const POST = route(async (req) => {
  const { clientId, clientSecret, resendApiKey, emailFrom } = Body.parse(await json(req));
  const cleanId = clientId.trim();
  const cleanSecret = clientSecret.trim();
  const cleanResend = resendApiKey?.trim();
  const cleanFrom = emailFrom?.trim();

  const payload: Record<string, string> = {
    googleClientId: cleanId,
    googleClientSecret: cleanSecret,
  };
  if (cleanResend) payload.resendApiKey = cleanResend;
  if (cleanFrom) payload.emailFrom = cleanFrom;

  // Save to data/oauth-config.json (local) or /tmp/packradar-oauth-config.json (serverless)
  try {
    const dataDir = path.join(process.cwd(), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "oauth-config.json"), JSON.stringify(payload, null, 2), "utf8");
  } catch {
    try {
      fs.writeFileSync("/tmp/packradar-oauth-config.json", JSON.stringify(payload, null, 2), "utf8");
    } catch {}
  }

  // Also append/update .env.local for persistence across restarts when writable
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    envContent = envContent
      .split(/\r?\n/)
      .filter(
        (l) =>
          !l.startsWith("GOOGLE_CLIENT_ID=") &&
          !l.startsWith("GOOGLE_CLIENT_SECRET=") &&
          (!cleanResend || !l.startsWith("RESEND_API_KEY=")),
      )
      .join("\n")
      .trim();
    envContent += `\nGOOGLE_CLIENT_ID=${cleanId}\nGOOGLE_CLIENT_SECRET=${cleanSecret}\n`;
    if (cleanResend) envContent += `RESEND_API_KEY=${cleanResend}\n`;
    fs.writeFileSync(envPath, envContent.trimStart(), "utf8");
  } catch {}

  process.env.GOOGLE_CLIENT_ID = cleanId;
  process.env.GOOGLE_CLIENT_SECRET = cleanSecret;
  if (cleanResend) process.env.RESEND_API_KEY = cleanResend;
  if (cleanFrom) process.env.EMAIL_FROM = cleanFrom;
  reloadAuth();

  return { ok: true, configured: true, emailConfigured: Boolean(process.env.RESEND_API_KEY) };
});
