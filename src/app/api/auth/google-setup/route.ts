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
});

export const POST = route(async (req) => {
  const { clientId, clientSecret } = Body.parse(await json(req));
  const cleanId = clientId.trim();
  const cleanSecret = clientSecret.trim();

  // Save to data/oauth-config.json
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "oauth-config.json"),
    JSON.stringify({ googleClientId: cleanId, googleClientSecret: cleanSecret }, null, 2),
    "utf8",
  );

  // Also append/update .env.local for persistence across restarts
  const envPath = path.join(process.cwd(), ".env.local");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  envContent = envContent
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("GOOGLE_CLIENT_ID=") && !l.startsWith("GOOGLE_CLIENT_SECRET="))
    .join("\n")
    .trim();
  envContent += `\nGOOGLE_CLIENT_ID=${cleanId}\nGOOGLE_CLIENT_SECRET=${cleanSecret}\n`;
  fs.writeFileSync(envPath, envContent.trimStart(), "utf8");

  process.env.GOOGLE_CLIENT_ID = cleanId;
  process.env.GOOGLE_CLIENT_SECRET = cleanSecret;
  reloadAuth();

  return { ok: true, configured: true };
});
