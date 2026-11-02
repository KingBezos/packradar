"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Heart, Check, X, Plus, Bell, Loader2, Camera, Flag } from "lucide-react";
import clsx from "clsx";
import { AccuracyMeter } from "./AccuracyMeter";
import { describeSchedule, formatMinuteOfDay, type DropSchedule } from "@/lib/drops/schedule";

async function post(url: string, body?: unknown, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Something went wrong");
  return j;
}

export type CandidateView = {
  id: string;
  intervalMinutes: number;
  anchorMinute: number;
  source: string;
  accuracy: number;
  verified: boolean;
  confirms: number;
  disputes: number;
  matching: number;
  supporters: number;
  isActive: boolean;
  sourceUrl: string | null;
  sourceTitle: string | null;
  description: string;
  myVote: number;
};

const SOURCE_LABEL: Record<string, string> = {
  official: "Official",
  scraped: "Found online",
  community: "Community",
  observed: "From drop reports",
  seed: "Demo data",
};

export function MachineActions({
  machineId,
  signedIn,
  isFavorite,
  candidates,
  schedule,
  isStaff,
}: {
  machineId: string;
  signedIn: boolean;
  isFavorite: boolean;
  candidates: CandidateView[];
  schedule: DropSchedule | null;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [minute, setMinute] = useState("");
  const [showPropose, setShowPropose] = useState(false);
  const [showPhotoProof, setShowPhotoProof] = useState(false);
  const [photoKind, setPhotoKind] = useState<"receipt" | "screen">("receipt");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [receiptTimeText, setReceiptTimeText] = useState("");
  const [pInterval, setPInterval] = useState(60);
  const [pAnchor, setPAnchor] = useState(0);
  const [fav, setFav] = useState(isFavorite);

  const run = async (key: string, fn: () => Promise<unknown>, success: string, allowGuest = false) => {
    if (!signedIn && !allowGuest) {
      router.push("/sign-in");
      return;
    }
    setBusy(key);
    setMsg(null);
    try {
      const res = (await fn()) as { safeguardMessage?: string } | undefined;
      setMsg({ ok: true, text: res?.safeguardMessage || success });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const submitPhotoProof = async () => {
    setBusy("photo");
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("kind", photoKind);
      if (photoFile) {
        fd.set("photo", photoFile);
        fd.set("lastModified", String(photoFile.lastModified));
      }
      if (receiptTimeText.trim()) {
        fd.set("receiptText", receiptTimeText.trim());
      }
      const r = await fetch(`/api/machines/${machineId}/verify-photo`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Photo verification failed");
      setMsg({ ok: true, text: j.message });
      setPhotoFile(null);
      setReceiptTimeText("");
      setShowPhotoProof(false);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const droppedNow = () =>
    run(
      "drop",
      () => post(`/api/machines/${machineId}/observations`, { kind: "dropped" }),
      signedIn ? "Thanks! Drop recorded +2 rep" : "Thanks! Drop recorded into live consensus",
      true,
    );
  const droppedAt = () => {
    const [h, m] = minute.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return setMsg({ ok: false, text: "Pick a time" });
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() > Date.now() + 3 * 3_600_000) d.setDate(d.getDate() - 1);
    return run(
      "dropAt",
      () => post(`/api/machines/${machineId}/observations`, { kind: "dropped", observedAt: d.toISOString() }),
      signedIn ? "Thanks! Drop recorded +2 rep" : "Drop recorded! Sign in on this browser to earn Leaderboard Rep.",
      true,
    );
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-bold text-white">Seeing a drop right now?</p>
            <p className="text-xs text-muted">Every report pushes accuracy toward 100% and earns reputation.</p>
          </div>
          <button
            className="chip border-volt/40 text-volt hover:bg-volt/10"
            onClick={() => setShowPhotoProof((s) => !s)}
          >
            <Camera className="h-3.5 w-3.5" /> Snap Receipt / Screen (+25 Rep)
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-volt/25 bg-volt/5 px-3 py-1.5 text-xs">
          <span className="text-slate-200">
            🏆 <b className="text-volt">Monthly Rep Prizes:</b> 🥇 1st Pokémon ETB · 🥈 2nd Booster Bundle · 🥉 3rd 2
            Free Packs · <span className="text-slate-400">🛡️ Corroborated = +3 Rep bonus · Spam/false = -3 to -6 Rep</span>
          </span>
          <Link href="/leaderboard" className="font-bold text-volt hover:underline">
            Standings →
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-green" disabled={busy !== null} onClick={droppedNow}>
            {busy === "drop" ? <Loader2 className="h-4 w-4 animate-spin" /> : "🟢"} It dropped just now!
          </button>
          <button
            className="btn-ghost"
            disabled={busy !== null}
            onClick={() =>
              run(
                "nodrop",
                () => post(`/api/machines/${machineId}/observations`, { kind: "no_drop" }),
                "Noted – if neighbors also miss their window, we'll flag a route reset",
                true,
              )
            }
          >
            🚫 Nothing dropped
          </button>
          <button
            className={clsx("btn-ghost", fav && "border-red-400/50 text-red-300")}
            onClick={() =>
              run("fav", async () => setFav((await post(`/api/machines/${machineId}/favorite`)).favorite), fav ? "Removed from favorites" : "Added to favorites")
            }
          >
            <Heart className={clsx("h-4 w-4", fav && "fill-current")} /> {fav ? "Favorited" : "Favorite"}
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              run("alert", () => post("/api/alerts", { kind: "machine_drop", machineId, leadMinutes: 5, channels: ["email", "push"] }), "Alert created – we'll ping you 5 min before each drop")
            }
          >
            <Bell className="h-4 w-4" /> Alert me
          </button>
        </div>

        {showPhotoProof && (
          <div className="mt-4 space-y-3 rounded-xl border border-volt/30 bg-panel-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-bold text-white">📸 Receipt & Screen Photo EXIF / OCR Verifier</p>
              <span className="rounded-full bg-volt/20 px-2 py-0.5 text-[11px] font-bold text-volt">+25 Rep</span>
            </div>
            <p className="text-xs text-muted">
              Upload a photo of your vending receipt or in-stock touchscreen. We read the embedded{" "}
              <b className="text-white">EXIF DateTimeOriginal</b> &amp; receipt timestamp to mathematically lock in the
              drop minute mark.
            </p>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPhotoKind("receipt")}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 font-semibold",
                  photoKind === "receipt" ? "border-volt bg-volt/15 text-white" : "border-line text-muted",
                )}
              >
                🧾 Vending Receipt (adjusts -1m checkout lag)
              </button>
              <button
                type="button"
                onClick={() => setPhotoKind("screen")}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 font-semibold",
                  photoKind === "screen" ? "border-volt bg-volt/15 text-white" : "border-line text-muted",
                )}
              >
                📱 In-Stock Kiosk Screen
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                className="input flex-1 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="Or receipt time (e.g. 2:43 PM)"
                value={receiptTimeText}
                onChange={(e) => setReceiptTimeText(e.target.value)}
                className="input w-48 py-1.5 text-xs"
              />
              <button
                type="button"
                className="btn-primary py-1.5"
                disabled={busy !== null || (!photoFile && !receiptTimeText.trim())}
                onClick={submitPhotoProof}
              >
                {busy === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify Proof"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">It dropped earlier at</span>
          <input type="time" value={minute} onChange={(e) => setMinute(e.target.value)} className="input w-32 py-1.5" />
          <button className="btn-ghost py-1.5" disabled={!minute || busy !== null} onClick={droppedAt}>
            Submit
          </button>
        </div>
        {msg && <p className={clsx("mt-3 text-sm", msg.ok ? "text-green-400" : "text-red-300")}>{msg.text}</p>}
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-bold text-white">Drop-time candidates</p>
          <button className="chip hover:text-white" onClick={() => setShowPropose((s) => !s)}>
            <Plus className="h-3 w-3" /> Suggest a time
          </button>
        </div>
        {showPropose && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-panel-2 p-3 text-sm">
            <label>
              <span className="mb-1 block text-xs text-muted">Every</span>
              <select className="input py-1.5" value={pInterval} onChange={(e) => setPInterval(Number(e.target.value))}>
                {[15, 20, 30, 45, 60, 90, 120, 180, 240, 1440].map((i) => (
                  <option key={i} value={i}>{i === 1440 ? "day" : i >= 60 && i % 60 === 0 ? `${i / 60} h` : `${i} min`}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">{pInterval === 1440 ? "At (time)" : "At minute past the hour"}</span>
              {pInterval === 1440 ? (
                <input type="time" className="input py-1.5" onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setPAnchor(h * 60 + m); }} />
              ) : (
                <input type="number" min={0} max={59} className="input w-24 py-1.5" value={pAnchor} onChange={(e) => setPAnchor(Math.min(59, Math.max(0, Number(e.target.value))))} />
              )}
            </label>
            <button
              className="btn-primary py-1.5"
              disabled={busy !== null}
              onClick={() => run("propose", () => post(`/api/machines/${machineId}/candidates`, { intervalMinutes: pInterval, anchorMinute: pAnchor }), "Suggestion added +2 rep")}
            >
              Add
            </button>
          </div>
        )}
        {candidates.length === 0 && <p className="text-sm text-muted">No drop times yet. Be the first to report one!</p>}
        <ul className="space-y-3">
          {candidates.map((c) => (
            <li key={c.id} className={clsx("rounded-xl border p-3", c.isActive ? "border-volt/50 bg-volt/5" : "border-line")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">
                    {c.description}
                    {c.isActive && <span className="ml-2 rounded-full bg-volt px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">Active</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {SOURCE_LABEL[c.source] ?? c.source} · {c.confirms.toFixed(0)} confirms · {c.disputes.toFixed(0)} disputes · {c.matching} matching reports
                    {c.sourceUrl && (
                      <>
                        {" · "}
                        <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-volt hover:underline">source</a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    title="Confirm"
                    className={clsx("rounded-lg border p-1.5", c.myVote === 1 ? "border-green-500 bg-green-500/20 text-green-300" : "border-line text-muted hover:text-green-300")}
                    onClick={() => run(`v+${c.id}`, () => post(`/api/candidates/${c.id}/vote`, { value: 1 }), "Vote recorded")}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    title="Dispute"
                    className={clsx("rounded-lg border p-1.5", c.myVote === -1 ? "border-red-500 bg-red-500/20 text-red-300" : "border-line text-muted hover:text-red-300")}
                    onClick={() => run(`v-${c.id}`, () => post(`/api/candidates/${c.id}/vote`, { value: -1 }), "Vote recorded")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {isStaff && (
                    <button
                      className="rounded-lg border border-line px-2 text-[11px] font-semibold text-volt hover:border-volt"
                      onClick={() => run(`ver${c.id}`, () => post(`/api/candidates/${c.id}/verify`, { verified: !c.verified }), c.verified ? "Unverified" : "Verified")}
                    >
                      {c.verified ? "Unverify" : "Verify"}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <AccuracyMeter accuracy={c.accuracy} verified={c.verified} size="sm" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function StockButtons({ machineId }: { machineId: string; signedIn?: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const send = async (status: string) => {
    try {
      const res = await post(`/api/machines/${machineId}/stock`, { status });
      setDone(status);
      setNote(res.narrowedWindowNote ?? `Marked as ${status}`);
      router.refresh();
    } catch {}
  };
  const opts = [
    ["stocked", "📦 Stocked"],
    ["low", "📉 Low"],
    ["empty", "🫙 Empty"],
    ["broken", "🛠️ Broken"],
    ["removed", "❌ Gone"],
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {opts.map(([k, l]) => (
          <button key={k} onClick={() => send(k)} className={clsx("chip hover:text-white", done === k && "border-volt text-volt")}>
            {l}
          </button>
        ))}
      </div>
      {note && <p className="text-xs font-medium text-green-400">{note}</p>}
    </div>
  );
}

export function CommentForm({ targetType, targetId, signedIn }: { targetType: "machine" | "news"; targetId: string; signedIn: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!signedIn)
    return (
      <p className="text-sm text-muted">
        <Link href="/sign-in" className="text-volt hover:underline">Sign in</Link> to join the conversation.
      </p>
    );
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await post("/api/comments", { targetType, targetId, body });
          setBody("");
          router.refresh();
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <textarea className="input min-h-20" maxLength={1000} placeholder="Share a tip, what you found, or a question…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !body.trim()}>Post comment</button>
        {err && <span className="text-sm text-red-300">{err}</span>}
      </div>
    </form>
  );
}

export function CommentFlagButton({ commentId }: { commentId: string }) {
  const [flagged, setFlagged] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flagComment = async () => {
    if (flagged || busy) return;
    setBusy(true);
    try {
      let voterKey = "";
      if (typeof window !== "undefined") {
        voterKey = localStorage.getItem("pr_voter_key") || "";
        if (!voterKey) {
          voterKey = `vk-${Math.random().toString(36).slice(2, 12)}`;
          localStorage.setItem("pr_voter_key", voterKey);
        }
      }
      const res = await post("/api/comments/flag", {
        commentId,
        reason: "Flagged by community",
        clientVoterKey: voterKey,
      });
      setFlagged(true);
      setStatusMsg(res.triggeredAdminAlert ? "Flagged · Admin Alerted" : "Flagged");
    } catch {
      setStatusMsg("Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={flagComment}
      disabled={flagged || busy}
      title="Flag inappropriate or spam comment (2+ unique IPs alerts Admin)"
      className={clsx(
        "ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition",
        flagged
          ? "bg-red-500/15 text-red-300"
          : "text-muted hover:bg-red-500/10 hover:text-red-300",
      )}
    >
      <Flag className="h-3 w-3" />
      {statusMsg || "Flag"}
    </button>
  );
}

export { describeSchedule, formatMinuteOfDay };
