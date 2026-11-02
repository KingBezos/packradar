import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="prose-pr mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-black text-white">Privacy</h1>
      <p>We store your email, display name and activity (reports, votes, comments) to run your account. If you enable alerts we also store your ZIP, notification preferences, push subscription and optional Discord webhook. Your location is only used when you ask (search, near-me, Drive Plan) and is not stored unless you save a home ZIP.</p>
      <p>We don&apos;t sell personal data. Ads shown to free users are geo-targeted using your home ZIP or the area you&apos;re viewing, not tracked across sites.</p>
      <p>To delete your account and data, contact the site operator.</p>
      <p className="text-sm text-muted">This is a template. Have it reviewed before launch.</p>
    </div>
  );
}
