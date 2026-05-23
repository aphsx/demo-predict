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
  const [showPass, setShowPass] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <LoginBackground />

      {/* Card */}
      <div className="relative z-10 w-full" style={{ maxWidth: 420, margin: "0 1rem" }}>
        <div
          className="rounded-2xl px-8 py-10"
          style={{
            background: "rgba(255,255,255,0.10)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          {/* Logo */}
          <div className="text-center mb-7">
            <img
              src="https://lineforbusiness.com/files/1Moby%20logo.png"
              alt="1Moby"
              style={{ height: 80, width: "auto", margin: "0 auto 20px", display: "block", filter: "brightness(0) invert(1)" }}
            />
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: "-0.015em" }}>
            Login
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.6)" }}>
            Sign in to your analytics dashboard
          </p>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>
              Email
            </label>
            <input
              type="email"
              placeholder="username@gmail.com"
              className="w-full h-11 rounded-xl px-4 text-sm outline-none"
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1.5px solid rgba(255,255,255,0.3)",
                color: "#1d1f2a",
              }}
            />
          </div>

          {/* Password */}
          <div className="mb-2">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                placeholder="Password"
                className="w-full h-11 rounded-xl px-4 pr-11 text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.92)",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  color: "#1d1f2a",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "#94a3b8", lineHeight: 0 }}
              >
                {showPass ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* Forgot */}
          <div className="flex justify-end mb-5">
            <button className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              Forgot Password?
            </button>
          </div>

          {/* Sign in */}
          <button
            onClick={() => handle("google")}
            disabled={busy !== null}
            className="w-full h-11 rounded-xl font-semibold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #1d1f2a 0%, #2d3142 100%)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            {busy !== null ? (
              <>
                <Spinner />
                <span>Signing in…</span>
              </>
            ) : (
              "Sign in"
            )}
          </button>

          {/* Error */}
          {error && (
            <div
              className="mt-3 px-3 py-2 rounded-lg text-xs text-white flex items-center gap-2"
              style={{ background: "rgba(220,38,38,0.25)", border: "1px solid rgba(220,38,38,0.4)" }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>or continue with</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />
          </div>

          {/* Social */}
          <div className="flex gap-3 justify-center">
            <SocialButton onClick={() => handle("google")} disabled={busy !== null} label="Google">
              <GoogleIcon />
            </SocialButton>
            <SocialButton disabled label="GitHub">
              <GitHubIcon />
            </SocialButton>
            <SocialButton disabled label="Facebook">
              <FacebookIcon />
            </SocialButton>
          </div>

          {/* Footer */}
          <p className="text-center text-xs mt-6" style={{ color: "rgba(255,255,255,0.45)" }}>
            Don&apos;t have an account yet?{" "}
            <span className="font-semibold" style={{ color: LOGIN_BRAND.orange }}>
              Register for free
            </span>
          </p>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "rgba(255,255,255,0.3)" }}>
          Customer Predictive Intelligence · v4.0
        </p>
      </div>
    </div>
  );
}

function SocialButton({
  children, onClick, disabled, label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="w-14 h-11 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: "rgba(255,255,255,0.9)",
        border: "1.5px solid rgba(255,255,255,0.3)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.1 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C41.4 35.1 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1d1f2a">
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
