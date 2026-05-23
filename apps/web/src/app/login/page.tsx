"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { LoginBackground } from "@/components/LoginBackground";
import { LOGIN_BRAND } from "@/lib/login-brand-colors";

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

      <section className="relative z-10 w-full max-w-sm">
        <div
          className="rounded-[28px] px-7 py-8 text-center sm:px-8"
          style={{
            background: "rgba(255,255,255,0.14)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            border: "1px solid rgba(255,255,255,0.22)",
            boxShadow: "0 24px 60px rgba(10,18,38,0.24)",
          }}
        >
          <img
            src="https://lineforbusiness.com/files/1Moby%20logo.png"
            alt="1Moby"
            className="mx-auto mb-6 block h-12 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />

          <div className="space-y-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "rgba(255,255,255,0.58)" }}
            >
              Customer Intelligence
            </p>
            <h1 className="text-3xl font-semibold text-white" style={{ letterSpacing: "-0.03em" }}>
              Sign in
            </h1>
            
          </div>

          <button
            onClick={() => handle("google")}
            disabled={busy !== null}
            className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-2xl px-4 text-sm font-semibold text-slate-900 transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "rgba(255,255,255,0.96)",
              border: "1px solid rgba(255,255,255,0.5)",
              boxShadow: "0 10px 24px rgba(8,15,35,0.12)",
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
              className="mt-4 rounded-2xl px-4 py-3 text-left text-xs leading-5 text-white"
              style={{ background: "rgba(220,38,38,0.18)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              {error}
            </div>
          )}

          <p className="mt-6 text-xs leading-5" style={{ color: "rgba(255,255,255,0.52)" }}>
            หากเข้าไม่ได้ ให้ตรวจสอบว่าบัญชี Google ของคุณถูกเพิ่มสิทธิ์ในระบบแล้ว
          </p>
        </div>

        <p className="mt-4 text-center text-[11px] tracking-[0.18em] uppercase" style={{ color: "rgba(255,255,255,0.34)" }}>
          Powered by 1Moby
        </p>
      </section>
    </main>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke={LOGIN_BRAND.orange} strokeOpacity="0.22" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={LOGIN_BRAND.orange} strokeWidth="3" strokeLinecap="round" />
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
