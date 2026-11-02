"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { Logo } from "@/components/ui";

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState(params.get("code") ?? params.get("preview") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const previewCode = params.get("preview");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErr("Passwords do not match");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to reset password");
      setDone(true);
      setTimeout(() => router.push("/sign-in?reset=success"), 1200);
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
          <Lock className="h-6 w-6" />
          <h1 className="text-2xl font-black text-white">Choose a new password</h1>
        </div>
        <p className="text-sm text-muted">Enter the 6-digit recovery code sent to your email and your new password.</p>

        {done ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-300">
            <p className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4" /> Password updated! Redirecting to Sign In…
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              className="input"
              type="email"
              placeholder="Account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input text-center font-mono text-lg tracking-widest"
              placeholder="6-digit reset code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            {previewCode && (
              <div className="rounded-lg border border-volt/40 bg-volt/10 p-2.5 text-xs text-slate-200">
                <b className="text-volt">Sandbox Email Preview:</b> Outbound SMTP (`RESEND_API_KEY`) is not configured
                yet, so your reset code was auto-filled:{" "}
                <code className="font-mono font-bold text-white">{previewCode}</code>
              </div>
            )}
            <input
              className="input"
              type="password"
              placeholder="New password (8+ characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <input
              className="input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
            {err && <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{err}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted">
          <Link href="/forgot-password" className="text-volt hover:underline">
            Need a new code? Resend →
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-14 text-center text-muted">Loading…</div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
