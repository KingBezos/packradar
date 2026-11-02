"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X, CheckCircle2, Send } from "lucide-react";

const ISSUE_CATEGORIES = [
  { value: "drop_time_wrong", label: "⏰ Vending Drop Time Wrong" },
  { value: "machine_dead", label: "🔌 Machine Dead / Broken / Offline" },
  { value: "stock_wrong", label: "📦 Stock / Retail Listing Wrong" },
  { value: "site_bug", label: "🐛 Website Issue / Broken Link" },
  { value: "other", label: "💡 Other Report for Admin" },
];

export function AlertAdminButton({
  machineId,
  label = "Alert Admin",
  variant = "chip",
}: {
  machineId?: string;
  label?: string;
  variant?: "chip" | "nav" | "footer";
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(machineId ? "drop_time_wrong" : "site_bug");
  const [machineCode, setMachineCode] = useState(machineId ?? "");
  const [message, setMessage] = useState("");
  const [senderName, setSenderName] = useState("");
  const [faxHoneypot, setFaxHoneypot] = useState("");
  const [challengeA, setChallengeA] = useState(4);
  const [challengeB, setChallengeB] = useState(3);
  const [challengeInput, setChallengeInput] = useState("");
  const [openedAt, setOpenedAt] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setChallengeA(Math.floor(Math.random() * 7) + 2);
      setChallengeB(Math.floor(Math.random() * 7) + 2);
      setChallengeInput("");
      setOpenedAt(Date.now());
      setError(null);
      setSentMsg(null);
      if (machineId) setMachineCode(machineId);
    }
  }, [open, machineId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 4) {
      setError("Please enter a short description of the issue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "admin_alert",
          category,
          machineId: machineCode.trim() || null,
          pageUrl: typeof window !== "undefined" ? window.location.pathname : null,
          message: message.trim(),
          senderName: senderName.trim() || null,
          faxHoneypot,
          challengeA,
          challengeB,
          challengeAnswer: Number(challengeInput),
          elapsedMs: Date.now() - openedAt,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not send alert");
      setSentMsg(j.message || "Alert sent directly to the Admin section!");
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const btnClass =
    variant === "nav"
      ? "flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-300 transition hover:border-amber-400 hover:bg-amber-500/20"
      : variant === "footer"
        ? "inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 font-semibold"
        : "chip border-amber-400/40 bg-amber-500/10 text-amber-300 hover:border-amber-400 hover:text-white cursor-pointer";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnClass}>
        <AlertTriangle className="h-3.5 w-3.5" />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="card relative w-full max-w-md border-amber-400/40 bg-panel p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-lg font-black text-white">Alert Admin</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Send an instant issue report straight into the Admin Command Center (wrong drop time, dead machine, broken link, etc.).
            </p>

            {sentMsg ? (
              <div className="mt-5 space-y-4 rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-green-400" />
                <p className="text-sm font-bold text-white">{sentMsg}</p>
                <button type="button" className="btn-primary w-full justify-center" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3 text-left">
                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
                    What&apos;s the issue?
                  </label>
                  <select
                    className="input text-xs"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {ISSUE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
                      Machine ID (optional)
                    </label>
                    <input
                      className="input text-xs font-mono uppercase"
                      placeholder="e.g. Q00810"
                      value={machineCode}
                      onChange={(e) => setMachineCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
                      Your Handle (optional)
                    </label>
                    <input
                      className="input text-xs"
                      placeholder="Spotter handle"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Hidden Honeypot for spam bots */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  value={faxHoneypot}
                  onChange={(e) => setFaxHoneypot(e.target.value)}
                />

                <div>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted">
                    Details for Admin
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="input text-xs"
                    placeholder="Describe what needs fixing (e.g., Q00810 dropped at :42 instead of :12, machine screen is black, or stock status is wrong)…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2/60 px-3 py-2">
                  <label className="text-xs text-slate-300">
                    🛡️ Anti-spam check: What is{" "}
                    <b className="text-volt">
                      {challengeA} + {challengeB}
                    </b>
                    ?
                  </label>
                  <input
                    type="number"
                    required
                    className="input w-20 px-2 py-1 text-center font-mono text-xs font-bold"
                    placeholder="?"
                    value={challengeInput}
                    onChange={(e) => setChallengeInput(e.target.value)}
                  />
                </div>

                {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary w-full justify-center py-2.5 text-xs font-bold"
                >
                  <Send className="h-3.5 w-3.5" />
                  {busy ? "Sending Alert…" : "Send Alert to Admin"}
                </button>

                <p className="pt-1 text-center text-[11px] text-muted">
                  Vendor, card shop, or sales inquiry?{" "}
                  <Link href="/advertise" onClick={() => setOpen(false)} className="font-semibold text-volt hover:underline">
                    Contact Sales →
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
