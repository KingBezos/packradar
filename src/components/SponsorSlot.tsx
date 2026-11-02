import { pickSponsor } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { effectivePlan, PLAN_LIMITS } from "@/lib/plans";
import { MapPin, Megaphone, Tag } from "lucide-react";

/**
 * Geo-targeted sponsor slot. Shows the nearest local vendor if one covers
 * this location, then affiliate offers, then a house ad. Hidden for Premium.
 */
export async function SponsorSlot({
  lat,
  lng,
  placement = "any",
  className,
}: {
  lat?: number | null;
  lng?: number | null;
  placement?: string;
  className?: string;
}) {
  const u = await getCurrentUser();
  if (!PLAN_LIMITS[effectivePlan(u)].ads) return null;
  const s = await pickSponsor({ lat: lat ?? u?.homeLat, lng: lng ?? u?.homeLng, placement });
  if (!s) return null;
  const Icon = s.kind === "local_vendor" ? MapPin : s.kind === "affiliate" ? Tag : Megaphone;
  return (
    <a
      href={`/api/sponsor/click?id=${s.id}`}
      target={s.url.startsWith("http") ? "_blank" : undefined}
      rel="sponsored noopener"
      className={`card group block p-4 transition hover:border-volt/50 ${className ?? ""}`}
    >
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted">
        <span>{s.kind === "local_vendor" ? "Local shop near you" : s.kind === "affiliate" ? "Partner offer" : "Sponsored"}</span>
        <span>Ad</span>
      </div>
      <div className="flex items-start gap-3">
        {s.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-volt/10 text-volt">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-bold text-white group-hover:text-volt">{s.name}</p>
          {s.tagline && <p className="text-sm text-muted">{s.tagline}</p>}
          {s.city && <p className="mt-0.5 text-xs text-muted">{s.city}, {s.state}</p>}
        </div>
      </div>
    </a>
  );
}
