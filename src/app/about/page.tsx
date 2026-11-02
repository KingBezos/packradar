import type { Metadata } from "next";

export const metadata: Metadata = { title: "How PackRadar works" };

export default function About() {
  return (
    <div className="prose-pr mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-black text-white">How PackRadar works</h1>
      <h2>Where drop times come from</h2>
      <p>Machine locations come from the official vending locator and are refreshed daily. Drop times are gathered from public community discussions and from collectors like you. No drop time is ever treated as certain until the community and moderators back it up.</p>
      <h2>The accuracy meter</h2>
      <p>Each candidate drop time starts with a confidence score based on its source, then rises toward 100% as people confirm it or report drops that match, and falls when it&apos;s disputed or contradicted by reports. The most-supported time becomes the active schedule, and a single outlier can&apos;t flip an established one.</p>
      <h2>Pin colors</h2>
      <ul>
        <li><b>Green</b>: dropped in the last 5 minutes</li>
        <li><b>Yellow</b>: drops within 10 minutes</li>
        <li><b>Red</b>: no drop soon</li>
        <li><b>Gray</b>: unknown drop time</li>
        <li><b>Dashed orange ring / ?</b>: unconfirmed (accuracy under 90%)</li>
      </ul>
      <h2 id="help">How to help</h2>
      <p>Open a machine, watch for a drop, and tap <b>It dropped just now</b>, or confirm or dispute the listed times. You earn reputation and your votes count more as you build trust.</p>
    </div>
  );
}
