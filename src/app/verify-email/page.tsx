"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const sendCode = async (targetEmail?: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetEmail ? { email: targetEmail } : {}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to send verification code");
      if (j.alreadyVerified) {
        setVerified(true);
        setTimeout(() => router.push("/map"), 1200);
        return;
      }
      if (j.previewCode) {
        setPreviewCode(j.previewCode);
        setCode(j.previewCode);
      }
      setMsg("Verification code sent! Check your email inbox (or spam folder).");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!params.get("code")) {
      void sendCode(params.get("email") ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/verify-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || undefined, code }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Verification failed");
      setVerified(true);
      setTimeout(() => {
        router.push("/map");
        router.refresh();
      }, 1000);
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
      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-2 text-volt">
          <MailCheck className="h-6 w-6" />
          <h1 className="text-2xl font-black text-white">Verify your email</h1>
        </div>
        <p className="text-sm text-muted">
          To keep bots and spam accounts off the Monthly Prize Leaderboard, new email accounts verify a 6-digit code
          before earning Reputation. (Signing in with Google verifies automatically.)
        </p>

        {verified ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-300">
            <p className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4" /> Email verified! Redirecting to the live map…
            </p>
          </div>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            {email && (
              <input
                className="input"
                type="email"
                placeholder="Your account email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            <input
              className="input text-center font-mono text-lg tracking-widest"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={10}
            />
            {previewCode && (
              <div className="rounded-lg border border-volt/40 bg-volt/10 p-2.5 text-xs text-slate-200">
                <b className="text-volt">Sandbox Email Preview:</b> Outbound SMTP (`RESEND_API_KEY`) is not set yet, so
                we auto-filled your verification code: <code className="font-mono font-bold text-white">{previewCode}</code>
              </div>
            )}
            {msg && <p className="rounded-lg bg-green-500/10 p-2 text-xs text-green-300">{msg}</p>}
            {err && <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{err}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy || !code.trim()}>
              <ShieldCheck className="h-4 w-4" /> {busy ? "Verifying…" : "Verify & Continue"}
            </button>
            <button
              type="button"
              onClick={() => sendCode(email || undefined)}
              disabled={busy}
              className="btn-ghost w-full text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Resend verification code
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted">
          <Link href="/map" className="text-volt hover:underline">
            Skip for now &amp; browse live map →
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-14 text-center text-muted">Loading…</div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
