"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { LoginBackground } from "@/components/LoginBackground";
import { INTRO_ASSETS, MOBY_BRAND } from "@/lib/login-brand-colors";

type Provider = "google";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const sp = useSearchParams();
  const callbackURL = sp.get("redirect") || "/";
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (provider: Provider) => {
    try {
      setBusy(provider);
      setError(null);

      await signIn.social({ provider, callbackURL });
    } catch (e: any) {
      setError(e?.message || "Sign-in failed");
      setBusy(null);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <LoginBackground />

      <section className="relative z-10 w-full max-w-[400px]">
        <div
          className="rounded-[32px] bg-white px-8 pb-8 pt-8"
          style={{ boxShadow: "0 24px 60px rgba(10,18,38,0.18)" }}
        >
          <div className="space-y-2 text-center">
            <img
              src={INTRO_ASSETS.logo}
              alt="1Moby"
              className="mx-auto h-9 w-auto"
              style={{ filter: "brightness(0)" }}
            />
            <p className="text-sm" style={{ color: "#8A8F9E" }}>
              Sign in to 1Moby Intelligence
            </p>
          </div>

          <div className="mt-7 space-y-3">
            <MockField icon={<Mail size={18} strokeWidth={1.75} />} placeholder="Email" />
            <MockField icon={<Lock size={18} strokeWidth={1.75} />} placeholder="Password" />
          </div>


          <button
            type="button"
            disabled
            className="mt-5 h-12 w-full rounded-2xl text-sm font-semibold text-white opacity-90"
            style={{ background: MOBY_BRAND.blue }}
          >
            Login
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#E8EAEF]" />
            <span className="text-xs" style={{ color: "#B0B5C3" }}>
              or
            </span>
            <div className="h-px flex-1 bg-[#E8EAEF]" />
          </div>

          <button
            onClick={() => handle("google")}
            disabled={busy !== null}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "#FFFFFF",
              borderColor: "#E8EAEF",
              color: MOBY_BRAND.dark,
            }}
          >
            {busy === "google" ? (
              <>
                <Spinner />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {error && (
            <div
              className="mt-4 rounded-2xl px-4 py-3 text-left text-xs leading-5"
              style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C" }}
            >
              {error}
            </div>
          )}

          
        </div>
      </section>
    </main>
  );
}

function MockField({ icon, placeholder }: { icon: React.ReactNode; placeholder: string }) {
  return (
    <div
      className="flex h-12 items-center gap-3 rounded-2xl px-4"
      style={{ background: "#F3F4F8", color: "#B0B5C3" }}
    >
      {icon}
      <span className="text-sm">{placeholder}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke={MOBY_BRAND.orangeWarm} strokeOpacity="0.22" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={MOBY_BRAND.orangeWarm} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.1 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C41.4 35.1 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
