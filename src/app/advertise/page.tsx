"use client";

import { useEffect, useState } from "react";
import { Store, Mail, MapPin, ShieldCheck, Send, CheckCircle2, Sparkles } from "lucide-react";
import { AlertAdminButton } from "@/components/AlertAdminButton";

const PARTNERSHIP_TYPES = [
  "Local Card Shop Geo-Sponsor (Radius Targeted)",
  "Featured Banner / Affiliate Partner",
  "Tournament / Rip-and-Ship / League Spotlight",
  "Brand / Wholesale / General Sales Inquiry",
];

export default function AdvertisePage() {
  const [businessName, setBusinessName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [cityState, setCityState] = useState("");
  const [website, setWebsite] = useState("");
  const [category, setCategory] = useState(PARTNERSHIP_TYPES[0]);
  const [message, setMessage] = useState("");
  const [faxHoneypot, setFaxHoneypot] = useState("");
  const [challengeA, setChallengeA] = useState(5);
  const [challengeB, setChallengeB] = useState(4);
  const [challengeInput, setChallengeInput] = useState("");
  const [openedAt, setOpenedAt] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setChallengeA(Math.floor(Math.random() * 8) + 2);
    setChallengeB(Math.floor(Math.random() * 8) + 2);
    setOpenedAt(Date.now());
  }, []);

  const submitSalesForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "vendor_sales",
          category,
          businessName: businessName.trim(),
          senderName: senderName.trim(),
          senderEmail: senderEmail.trim(),
          cityState: cityState.trim(),
          website: website.trim(),
          message: message.trim(),
          faxHoneypot,
          challengeA,
          challengeB,
          challengeAnswer: Number(challengeInput),
          elapsedMs: Date.now() - openedAt,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not submit inquiry");
      setSuccessMsg(
        j.message ||
          "Thank you! Your inquiry has been emailed to our partnerships team and we will follow up shortly.",
      );
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left column: Value prop + Issue Alert callout */}
        <div className="space-y-6 lg:col-span-5">
          <div>
            <span className="chip border-volt/40 text-volt">
              <Sparkles className="h-3.5 w-3.5" /> Local Card Shops &amp; Brand Partners
            </span>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">
              Advertise &amp; Partner with PackRadar
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Own a local Pokémon card shop, tournament venue, or TCG brand? Reach active collectors in the exact ZIP
              codes where they are hunting vending machine drops and retail restocks.
            </p>
          </div>

          <div className="space-y-3">
            <div className="card flex items-start gap-3 p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-volt" />
              <div>
                <h3 className="text-sm font-bold text-white">Geo-Targeted Local Shop Spotlight</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Your card shop appears directly on machine pages, map sidebars, and news feeds for collectors within
                  your chosen mile radius (e.g., 25 miles around your store).
                </p>
              </div>
            </div>

            <div className="card flex items-start gap-3 p-4">
              <Store className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
              <div>
                <h3 className="text-sm font-bold text-white">High-Intent Pokémon TCG Audience</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Promote sealed pre-orders, singles buy/trade nights, weekly leagues, or grading submissions with live
                  impression and click tracking.
                </p>
              </div>
            </div>
          </div>

          {/* Non-sales issue redirect box */}
          <div className="card border-amber-400/35 bg-amber-500/5 p-5">
            <h3 className="text-sm font-black text-white">
              🚨 Reporting a Vending Machine or Website Issue?
            </h3>
            <p className="mt-1 text-xs text-muted">
              The form on this page is strictly for <b className="text-slate-200">vendor, sponsor, and sales inquiries</b>.
              To report an inaccurate vending drop time, dead machine, or site bug, click below to alert the Admin team
              instantly:
            </p>
            <div className="mt-3">
              <AlertAdminButton label="Alert Admin of a Machine or Site Issue" />
            </div>
          </div>
        </div>

        {/* Right column: Vendor & Sales Contact Form */}
        <div className="lg:col-span-7">
          <div className="card border-volt/30 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className=" flex items-center gap-2 text-xl font-black text-white">
                  <Mail className="h-5 w-5 text-volt" /> Vendor &amp; Sales Contact Form
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Direct sales &amp; partnership inquiries are delivered straight to our partnerships desk.
                </p>
              </div>
              <span className="hidden rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[10px] font-bold text-green-400 sm:inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Spam Protected
              </span>
            </div>

            {successMsg ? (
              <div className="mt-6 space-y-4 rounded-2xl border border-green-500/40 bg-green-500/10 p-6 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
                <h3 className="text-lg font-bold text-white">Inquiry Sent!</h3>
                <p className="text-sm text-slate-300">{successMsg}</p>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    setSuccessMsg(null);
                    setOpenedAt(Date.now());
                  }}
                >
                  Send another inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={submitSalesForm} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-200">
                      Card Shop / Business Name *
                    </label>
                    <input
                      required
                      className="input text-sm"
                      placeholder="e.g. Emerald City Cards"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-200">Your Name *</label>
                    <input
                      required
                      className="input text-sm"
                      placeholder="Your name"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-200">Business Email *</label>
                    <input
                      type="email"
                      required
                      className="input text-sm"
                      placeholder="you@yourcardshop.com"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-200">
                      City, State &amp; Target ZIP
                    </label>
                    <input
                      className="input text-sm"
                      placeholder="e.g. Seattle, WA 98107 (25 mi radius)"
                      value={cityState}
                      onChange={(e) => setCityState(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-200">Partnership Type</label>
                    <select
                      className="input text-sm"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {PARTNERSHIP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-200">
                      Website / Instagram / Discord (optional)
                    </label>
                    <input
                      className="input text-sm"
                      placeholder="https://..."
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>
                </div>

                {/* Hidden Honeypot for automated bots */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  value={faxHoneypot}
                  onChange={(e) => setFaxHoneypot(e.target.value)}
                />

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-200">
                    Tell us about your shop or campaign *
                  </label>
                  <textarea
                    rows={4}
                    required
                    className="input text-sm"
                    placeholder="Share your store location, what you'd like to promote (local league, sealed drops, singles trade-ins, affiliate offer), and any questions…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel-2/60 px-4 py-3">
                  <label className="text-xs text-slate-300">
                    🛡️ Spam protection check: What is{" "}
                    <b className="text-volt">
                      {challengeA} + {challengeB}
                    </b>
                    ?
                  </label>
                  <input
                    type="number"
                    required
                    className="input w-24 px-3 py-1.5 text-center font-mono text-sm font-bold"
                    placeholder="Sum"
                    value={challengeInput}
                    onChange={(e) => setChallengeInput(e.target.value)}
                  />
                </div>

                {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

                <button type="submit" disabled={busy} className="btn-primary w-full justify-center py-3 text-sm font-bold">
                  <Send className="h-4 w-4" />
                  {busy ? "Sending Sales Inquiry…" : "Send Vendor & Sales Inquiry"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
