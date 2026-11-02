"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, KeyRound } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-client";
import { Logo } from "./ui";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
      />
      <path
        fill="#34A853"
        d="M3.6 7.4l3.2 2.4C7.7 7.6 9.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.6 7.4z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.5c2.5 0 4.7-.8 6.3-2.3l-2.9-2.4c-.8.6-1.9 1-3.4 1-3.8 0-5.2-2.5-5.5-3.8l-3.2 2.5c1.5 3 4.7 5 8.7 5z"
      />
      <path
        fill="#4285F4"
        d="M21.1 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.3-1.1 2.4-2.1 3.1l2.9 2.4c1.7-1.6 2.8-4 2.8-7.8z"
      />
    </svg>
  );
}

export function AuthForm({ mode, google: initialGoogle }: { mode: "sign-in" | "sign-up"; google: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleReady, setGoogleReady] = useState(initialGoogle);
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const up = mode === "sign-up";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const callbackUri = `${origin}/api/auth/callback/google`;

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleGoogleClick = async () => {
    if (!googleReady) {
      setShowGoogleSetup(true);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await signIn.social({ provider: "google", callbackURL: "/map" });
    if (res?.error) {
      setBusy(false);
      setErr(res.error.message ?? "Google sign-in failed");
    }
  };

  const saveGoogleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/google-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to save Google OAuth credentials");
      setGoogleReady(true);
      setShowGoogleSetup(false);
      await signIn.social({ provider: "google", callbackURL: "/map" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <div className="card p-6">
        <h1 className="text-2xl font-black text-white">{up ? "Create your free account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-muted">
          {up ? "Report drops, climb the monthly prize leaderboard, and get drop alerts." : "Sign in to PackRadar."}
        </p>

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow transition hover:bg-slate-100 disabled:opacity-50"
        >
          <GoogleIcon />
          {up ? "Sign up with Google" : "Continue with Google"}
        </button>

        {showGoogleSetup && (
          <div className="mt-4 space-y-3 rounded-xl border border-volt/40 bg-panel-2 p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-volt">
                <KeyRound className="h-3.5 w-3.5" /> 1-Minute Google Login Setup
              </span>
              <a
                href="https://console.cloud.google.com/apis/credentials/oauthclient"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-volt hover:underline"
              >
                Open Google Cloud Console <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-slate-300">
              Create a <b>Web application</b> OAuth Client in Google Cloud Console with these exact URLs, then paste your
              Client ID &amp; Secret below:
            </p>
            <div className="space-y-1.5 rounded-lg bg-slate-950/70 p-2.5 font-mono text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-300">
                  <b className="text-muted">Origin:</b> {origin}
                </span>
                <button
                  type="button"
                  onClick={() => copyText("origin", origin)}
                  className="shrink-0 text-volt hover:underline"
                >
                  {copiedKey === "origin" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-300">
                  <b className="text-muted">Redirect:</b> {callbackUri}
                </span>
                <button
                  type="button"
                  onClick={() => copyText("redirect", callbackUri)}
                  className="shrink-0 text-volt hover:underline"
                >
                  {copiedKey === "redirect" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <form onSubmit={saveGoogleSetup} className="space-y-2">
              <input
                className="input py-1.5 text-xs"
                placeholder="Google Client ID (….apps.googleusercontent.com)"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              />
              <input
                className="input py-1.5 text-xs"
                type="password"
                placeholder="Google Client Secret (GOCSPX-…)"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary w-full py-1.5 text-xs" disabled={busy}>
                Save &amp; Activate Google Sign-In
              </button>
            </form>
          </div>
        )}

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />
          <span>or with email</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const r = up
              ? await signUp.email({ name: name || email.split("@")[0], email, password })
              : await signIn.email({ email, password });
            setBusy(false);
            if (r.error) return setErr(r.error.message ?? "Something went wrong");
            if (up) {
              router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
            } else {
              router.push("/map");
            }
            router.refresh();
          }}
        >
          {up && (
            <input
              className="input"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={40}
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="space-y-1">
            {!up && (
              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-xs font-semibold text-volt hover:underline">
                  Forgot password?
                </Link>
              </div>
            )}
            <input
              className="input"
              type="password"
              placeholder="Password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {err && <p className="rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : up ? "Create free account & verify email" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {up ? "Already have an account?" : "New here?"}{" "}
          <Link href={up ? "/sign-in" : "/sign-up"} className="font-semibold text-volt hover:underline">
            {up ? "Sign in" : "Join free"}
          </Link>
        </p>
      </div>
    </div>
  );
}
