"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import { deleteUser, updateUser, useSession } from "@/lib/auth-client";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function ProfileView() {
  const router = useRouter();
  const { data: session, isPending, refetch } = useSession();
  const user = session?.user;

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Seed the form once the session resolves.
  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setImage(user.image ?? "");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-[color:var(--ink-5)]">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-[color:var(--ink-4)]">ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่</div>
    );
  }

  const displayName = name.trim() || user.email?.split("@")[0] || "User";
  const dirty = name.trim() !== (user.name ?? "").trim() || image.trim() !== (user.image ?? "").trim();
  const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString("th-TH", {
    year: "numeric", month: "long", day: "numeric",
  }) : "—";

  const handleSave = async () => {
    if (!dirty || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateUser({ name: name.trim(), image: image.trim() || undefined });
      if (res.error) throw new Error(res.error.message || "Update failed");
      await refetch();
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteUser();
      if (res.error) throw new Error(res.error.message || "Delete failed");
      router.push("/login");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "ลบบัญชีไม่สำเร็จ");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] px-8 py-8">
      {/* Identity card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-4">
          {image.trim() ? (
            <img
              src={image.trim()}
              alt=""
              referrerPolicy="no-referrer"
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[color:var(--moby-600)] text-lg font-semibold text-white">
              {initials(displayName)}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[18px] font-semibold text-[color:var(--ink-1)]">{displayName}</h2>
              {user.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--moby-50)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--moby-600)]">
                  <BadgeCheck size={13} /> ยืนยันแล้ว
                </span>
              )}
            </div>
            <p className="truncate text-[13px] text-[color:var(--ink-4)]">{user.email}</p>
          </div>
        </div>
      </section>

      {/* Editable fields */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-[.1em] text-[color:var(--ink-5)]">
          ข้อมูลส่วนตัว
        </h3>

        <div className="space-y-4">
          <Field label="ชื่อที่แสดง (Display name)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] outline-none focus:border-[color:var(--moby-600)]"
              placeholder="ชื่อที่แสดง"
            />
          </Field>

          <Field label="ลิงก์รูปโปรไฟล์ (Image URL)">
            <input
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] outline-none focus:border-[color:var(--moby-600)]"
              placeholder="https://…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <ReadOnly label="ชื่อ (จาก Google)" value={user.givenName} />
            <ReadOnly label="นามสกุล (จาก Google)" value={user.familyName} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReadOnly label="ภาษา/ภูมิภาค" value={user.locale} />
            <ReadOnly label="สมัครเมื่อ" value={createdAt} />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-[color:var(--danger)]/30 bg-red-50 px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          {savedTick && <span className="text-[13px] text-[color:var(--moby-600)]">บันทึกแล้ว ✓</span>}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || !name.trim() || saving}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--moby-600)] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[color:var(--moby-700)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="animate-spin" size={15} />}
            บันทึกการเปลี่ยนแปลง
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section className="mt-6 rounded-2xl border border-[color:var(--danger)]/30 bg-white p-6">
        <h3 className="text-[13px] font-semibold uppercase tracking-[.1em] text-[color:var(--danger)]">
          ลบบัญชี
        </h3>
        <p className="mt-2 text-[13px] leading-6 text-[color:var(--ink-4)]">
          การลบบัญชีจะลบข้อมูลผู้ใช้ของคุณและออกจากทุกอุปกรณ์อย่างถาวร ไม่สามารถกู้คืนได้
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[color:var(--danger)]/40 px-5 text-[14px] font-medium text-[color:var(--danger)] transition-colors hover:bg-red-50"
          >
            <Trash2 size={15} /> ลบบัญชีของฉัน
          </button>
        </div>
      </section>

      {confirmDelete && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการลบบัญชี"
          message="คุณต้องการลบบัญชีนี้อย่างถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้"
          confirmLabel="ลบบัญชี"
          cancelLabel="ยกเลิก"
          loading={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[color:var(--ink-3)]">{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-medium text-[color:var(--ink-3)]">{label}</span>
      <div className="flex h-11 items-center rounded-xl bg-gray-50 px-3 text-[14px] text-[color:var(--ink-2)]">
        {value?.trim() || "—"}
      </div>
    </div>
  );
}
