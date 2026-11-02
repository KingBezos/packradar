"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Mail, ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to send password reset code");
      const q = new URLSearchParams({ email });
      if (j.previewCode) q.set("preview", j.previewCode);
      router.push(`/reset-password?${q.toString()}`);
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
          <KeyRound className="h-6 w-6" />
          <h1 className="text-2xl font-black text-white">Reset your password</h1>
        </div>
        <p className="text-sm text-muted">
          Enter the email address associated with your PackRadar account and we&apos;ll send you a 6-digit recovery code
          to choose a new password.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {err && <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{err}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy || !email.trim()}>
            <Mail className="h-4 w-4" /> {busy ? "Sending…" : "Send Reset Code"} <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Remembered your password?{" "}
          <Link href="/sign-in" className="font-semibold text-volt hover:underline">
            Back to Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
