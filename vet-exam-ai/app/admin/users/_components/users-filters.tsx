"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ALL_USER_ROLES,
  USER_ROLE_KO,
} from "../../../../lib/admin/user-labels";
import {
  buildUsersSearchString,
  type ParsedUsersSearchParams,
} from "../_lib/parse-users-search-params";

export function UsersFilters({
  current,
}: {
  current: ParsedUsersSearchParams;
}) {
  const router = useRouter();
  const [q, setQ]           = useState(current.q ?? "");
  const [role, setRole]     = useState(current.role ?? "");
  const [active, setActive] = useState(current.active);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = buildUsersSearchString(current, {
      q:      q.trim() || null,
      role:   (role || null) as ParsedUsersSearchParams["role"],
      active,
      page:   1,
    });
    router.push(`/admin/users${next}`);
  }

  function onReset() {
    setQ("");
    setRole("");
    setActive("all");
    router.push("/admin/users");
  }

  const inputStyle: React.CSSProperties = {
    background:   "var(--surface)",
    border:       "1px solid var(--rule)",
    borderRadius: 6,
    padding:      "6px 10px",
    fontSize:     13,
    color:        "var(--text)",
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        검색 (닉네임 또는 이메일)
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="예: seongju 또는 user@..."
          style={{ ...inputStyle, minWidth: 240 }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        역할
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={inputStyle}
        >
          <option value="">전체</option>
          {ALL_USER_ROLES.map((r) => (
            <option key={r} value={r}>{USER_ROLE_KO[r]}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        상태
        <select
          value={active}
          onChange={(e) => setActive(e.target.value as typeof active)}
          style={inputStyle}
        >
          <option value="all">전체</option>
          <option value="active">정상</option>
          <option value="suspended">정지</option>
        </select>
      </label>

      <button
        type="submit"
        className="text-sm rounded px-3 py-1.5"
        style={{ background: "var(--teal)", color: "white", border: 0, cursor: "pointer" }}
      >
        검색
      </button>
      <button
        type="button"
        onClick={onReset}
        className="text-sm rounded px-3 py-1.5"
        style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--rule)", cursor: "pointer" }}
      >
        초기화
      </button>
    </form>
  );
}
