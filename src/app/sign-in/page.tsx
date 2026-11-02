import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { getAuthProviders } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return <AuthForm mode="sign-in" google={getAuthProviders().google} />;
}
