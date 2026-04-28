"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { canChangeNickname } from "../../../lib/profile/nickname";
import ProfileTempNicknameBanner from "./ProfileTempNicknameBanner";
import type { UserProfilePublicRow } from "../../../lib/profile/maskPrivacy";

type Props = {
  profile: UserProfilePublicRow;
  joinedLabel: string;
};

type FormState = {
  nickname: string;
  bio: string;
  target_round: string;
  university: string;
  target_round_visible: boolean;
  university_visible: boolean;
};

function toForm(p: UserProfilePublicRow): FormState {
  return {
    nickname: p.nickname,
    bio: p.bio ?? "",
    target_round: p.target_round?.toString() ?? "",
    university: p.university ?? "",
    target_round_visible: p.target_round_visible,
    university_visible: p.university_visible,
  };
}

export default function ProfileEditController({ profile, joinedLabel }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(profile));
  const [nicknameUnlocked, setNicknameUnlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);

  const policy = canChangeNickname(profile.nickname, profile.nickname_changed_at);

  useEffect(() => {
    if (editing && nicknameUnlocked) nicknameRef.current?.focus();
  }, [editing, nicknameUnlocked]);

  function startEdit() {
    setForm(toForm(profile));
    setError(null);
    setNicknameUnlocked(false);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setError(null);
    setNicknameUnlocked(false);
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    const update: Record<string, unknown> = {
      bio: form.bio || null,
      target_round: form.target_round ? Number(form.target_round) : null,
      university: form.university || null,
      target_round_visible: form.target_round_visible,
      university_visible: form.university_visible,
    };
    if (nicknameUnlocked && form.nickname !== profile.nickname) {
      update.nickname = form.nickname;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          next_change_available_at?: string;
        };
        if (data.error === "nickname_taken") {
          setError("이미 사용 중인 닉네임입니다.");
        } else if (data.error === "nickname_change_too_soon") {
          const next = data.next_change_available_at
            ? new Date(data.next_change_available_at).toLocaleDateString("ko-KR")
            : "";
          setError(`닉네임은 30일에 한 번만 변경할 수 있습니다. (다음 변경 가능: ${next})`);
        } else {
          setError("저장에 실패했습니다.");
        }
        return;
      }
      const updated = (await res.json()) as UserProfilePublicRow;
      if (updated.nickname !== profile.nickname) {
        router.push(`/profile/${encodeURIComponent(updated.nickname)}`);
      } else {
        router.refresh();
        setEditing(false);
        setNicknameUnlocked(false);
      }
    } catch (e) {
      console.error("[ProfileEditController] save failed", e);
      setError("저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditFromBanner() {
    startEdit();
    setNicknameUnlocked(true);
  }

  return (
    <div>
      {policy.canChange && policy.reason === "temp" && !editing && (
        <ProfileTempNicknameBanner onStartEdit={startEditFromBanner} />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <FieldGroup
              form={form}
              setForm={setForm}
              policy={policy}
              nicknameUnlocked={nicknameUnlocked}
              setNicknameUnlocked={setNicknameUnlocked}
              currentNickname={profile.nickname}
              nicknameRef={nicknameRef}
            />
          ) : (
            <ReadOnly profile={profile} joinedLabel={joinedLabel} />
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {editing ? (
            <>
              <button type="button" onClick={cancelEdit} disabled={submitting} style={btnSecondary}>
                취소
              </button>
              <button type="button" onClick={save} disabled={submitting} style={btnPrimary}>
                {submitting ? "저장 중…" : "저장"}
              </button>
            </>
          ) : (
            <button type="button" onClick={startEdit} style={btnGhost}>
              <Pencil size={14} /> 편집
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "var(--wrong-dim)",
            color: "var(--wrong)",
            border: "1px solid var(--wrong)",
            borderRadius: 8,
            fontSize: 13,
          }}
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--teal)",
  color: "#080D1A",
  border: "none",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 16px",
  background: "var(--surface-raised)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function ReadOnly({
  profile,
  joinedLabel,
}: {
  profile: UserProfilePublicRow;
  joinedLabel: string;
}) {
  const meta = [
    profile.target_round ? `${profile.target_round}회 준비` : null,
    profile.university,
    joinedLabel,
  ].filter(Boolean);
  return (
    <>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text)",
          fontSize: 34,
          lineHeight: 1.15,
          fontWeight: 800,
          margin: 0,
        }}
      >
        {profile.nickname}
      </h1>
      {profile.bio && (
        <p
          style={{
            color: "var(--text)",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {profile.bio}
        </p>
      )}
      {meta.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8, marginBottom: 0 }}>
          {meta.join(" · ")}
        </p>
      )}
    </>
  );
}

function FieldGroup({
  form,
  setForm,
  policy,
  nicknameUnlocked,
  setNicknameUnlocked,
  currentNickname,
  nicknameRef,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  policy: ReturnType<typeof canChangeNickname>;
  nicknameUnlocked: boolean;
  setNicknameUnlocked: (v: boolean) => void;
  currentNickname: string;
  nicknameRef: React.RefObject<HTMLInputElement | null>;
}) {
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    marginBottom: 4,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 14,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Nickname */}
      <div>
        <label htmlFor="nickname" style={labelStyle}>닉네임</label>
        {policy.canChange ? (
          <>
            {nicknameUnlocked ? (
              <input
                id="nickname"
                ref={nicknameRef}
                type="text"
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                maxLength={16}
                style={inputStyle}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input value={currentNickname} disabled style={{ ...inputStyle, opacity: 0.7 }} />
                <button
                  type="button"
                  onClick={() => setNicknameUnlocked(true)}
                  style={btnGhost}
                >
                  변경
                </button>
              </div>
            )}
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              변경 후 30일 동안 다시 바꿀 수 없습니다. 한글/영문/숫자/밑줄 2~16자.
            </p>
          </>
        ) : (
          <>
            <input value={currentNickname} disabled style={{ ...inputStyle, opacity: 0.7 }} />
            <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              다음 변경 가능: {policy.nextChangeAt.toLocaleDateString("ko-KR")}
            </p>
          </>
        )}
      </div>

      {/* Bio */}
      <div>
        <label htmlFor="bio" style={labelStyle}>자기소개</label>
        <textarea
          id="bio"
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          maxLength={500}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
        />
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
          {form.bio.length}/500
        </p>
      </div>

      {/* Target round */}
      <div>
        <label htmlFor="round" style={labelStyle}>준비 회차</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="round"
            type="number"
            min={1}
            max={200}
            value={form.target_round}
            onChange={(e) => setForm({ ...form, target_round: e.target.value })}
            style={{ ...inputStyle, width: 120 }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={form.target_round_visible}
              onChange={(e) => setForm({ ...form, target_round_visible: e.target.checked })}
            />
            공개
          </label>
        </div>
      </div>

      {/* University */}
      <div>
        <label htmlFor="uni" style={labelStyle}>대학</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="uni"
            type="text"
            value={form.university}
            onChange={(e) => setForm({ ...form, university: e.target.value })}
            maxLength={50}
            style={{ ...inputStyle, flex: 1 }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={form.university_visible}
              onChange={(e) => setForm({ ...form, university_visible: e.target.checked })}
            />
            공개
          </label>
        </div>
      </div>
    </div>
  );
}
