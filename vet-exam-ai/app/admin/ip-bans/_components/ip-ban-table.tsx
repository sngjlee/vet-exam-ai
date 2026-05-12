import { revokeIpBan } from "../_actions";
import { formatKstDateTime } from "../../../../lib/utils/datetime";

export type IpBanRow = {
  id:         string;
  cidr:       string;
  reason:     string;
  created_by: string;
  created_at: string;
};

export function IpBanTable({
  rows,
  creatorNicknameMap,
}: {
  rows:               IpBanRow[];
  creatorNicknameMap: Record<string, string | null>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        등록된 차단이 없습니다.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const creator = creatorNicknameMap[r.created_by] ?? "(닉네임 없음)";
        return (
          <li
            key={r.id}
            className="rounded-lg"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <details>
              <summary
                className="cursor-pointer p-3 flex flex-wrap items-center gap-3 text-sm"
                style={{ color: "var(--text)" }}
              >
                <span className="kvle-mono font-medium">{r.cidr}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {r.reason.length > 40 ? r.reason.slice(0, 40) + "…" : r.reason}
                </span>
                <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                  {creator}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatKstDateTime(r.created_at)}
                </span>
              </summary>

              <div className="border-t p-3" style={{ borderColor: "var(--rule)" }}>
                <p className="mb-3 text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>
                  {r.reason}
                </p>
                <form action={revokeIpBan} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea
                    name="note"
                    rows={2}
                    maxLength={500}
                    placeholder="해제 사유 (선택, 500자 이내)"
                    className="text-sm rounded p-2"
                    style={{ background: "var(--surface)", border: "1px solid var(--rule)", color: "var(--text)" }}
                  />
                  <button
                    type="submit"
                    className="self-start text-sm px-3 py-1.5 rounded"
                    style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--rule)", cursor: "pointer" }}
                  >
                    차단 해제
                  </button>
                </form>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
