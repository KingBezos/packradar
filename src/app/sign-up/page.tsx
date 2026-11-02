import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { getAuthProviders } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return <AuthForm mode="sign-up" google={getAuthProviders().google} />;
}
