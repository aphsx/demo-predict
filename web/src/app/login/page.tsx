"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";

type Provider = "google" | "github" | "discord";

export default function LoginPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-2)] px-6">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[color:var(--moby-600)] text-white text-[20px] font-bold mb-4">
            M
          </div>
          <h1 className="text-[22px] font-semibold text-[color:var(--ink-1)]">
            1Moby Intelligence
          </h1>
          <p className="text-[13px] text-[color:var(--ink-5)] mt-1">
            Sign in to access the analytics dashboard
          </p>
        </div>

        <div className="surface p-6">
          <div className="space-y-2">
            <ProviderButton
              provider="google"
              label="Continue with Google"
              busy={busy === "google"}
              disabled={busy !== null}
              onClick={() => handle("google")}
              icon={<GoogleIcon />}
            />
            {/* <ProviderButton
              provider="github"
              label="Continue with GitHub"
              busy={busy === "github"}
              disabled={busy !== null}
              onClick={() => handle("github")}
              icon={<GitHubIcon />}
            />
            <ProviderButton
              provider="discord"
              label="Continue with Discord"
              busy={busy === "discord"}
              disabled={busy !== null}
              onClick={() => handle("discord")}
              icon={<DiscordIcon />}
            /> */}
          </div>

          {error && (
            <div className="mt-4 px-3 py-2 rounded-md text-[12px] text-[color:var(--danger)] bg-[color:var(--danger-bg)]">
              {error}
            </div>
          )}

          <p className="text-[11.5px] text-[color:var(--ink-5)] text-center mt-5">
            By signing in, you agree to our terms and privacy policy.
          </p>
        </div>

        <p className="text-[11px] text-[color:var(--ink-5)] text-center mt-6">
          Customer Predictive Intelligence Platform · v4.0
        </p>
      </div>
    </div>
  );
}

function ProviderButton({
  provider, label, icon, busy, disabled, onClick,
}: {
  provider: Provider;
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full h-11 flex items-center justify-center gap-3 rounded-lg border border-[color:var(--line)] bg-white text-[13.5px] font-medium text-[color:var(--ink-2)] hover:bg-[color:var(--surface-2)] hover:border-[color:var(--moby-200)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {busy ? <Spinner /> : icon}
      <span>{busy ? "Redirecting…" : label}</span>
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.1 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C41.4 35.1 44 30 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#5865F2">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18.3 18.3 0 0 0-5.3 0L9.6 3a19.8 19.8 0 0 0-4.9 1.4C1.6 9 .8 13.4 1.2 17.8a20 20 0 0 0 6.1 3l.5-.7c-1-.4-2-.9-2.8-1.5l.6-.4a14 14 0 0 0 12.8 0l.7.4c-.9.6-1.8 1.1-2.8 1.5l.5.7a20 20 0 0 0 6.1-3c.5-5-.7-9.3-3.6-13.4zM8.5 15.2c-1.2 0-2.2-1.1-2.2-2.4 0-1.4 1-2.5 2.2-2.5s2.2 1.1 2.2 2.5c0 1.3-1 2.4-2.2 2.4zm7 0c-1.2 0-2.2-1.1-2.2-2.4 0-1.4 1-2.5 2.2-2.5s2.2 1.1 2.2 2.5c0 1.3-1 2.4-2.2 2.4z"/>
    </svg>
  );
}
