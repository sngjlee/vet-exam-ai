import { BADGE_META, BADGE_DISPLAY_ORDER, type BadgeType } from "../../../lib/profile/badgeMeta";

type Props = {
  ownedBadges: BadgeType[];
};

export default function ProfileBadges({ ownedBadges }: Props) {
  const owned = new Set(ownedBadges);

  // Visible chips: held badges first (in display order), then non-held auto-grant
  // badges as gray outline. Manual-grant badges hidden when not held.
  const chips = BADGE_DISPLAY_ORDER.filter((bt) => {
    if (owned.has(bt)) return true;
    return !BADGE_META[bt].manualGrant;
  });

  return (
    <section>
      <h2
        className="mb-4 font-bold"
        style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 22 }}
      >
        뱃지
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {chips.map((bt) => {
          const meta = BADGE_META[bt];
          const has = owned.has(bt);
          const Icon = meta.icon;
          return (
            <div
              key={bt}
              title={meta.description}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                background: has ? meta.background : "transparent",
                color: has ? meta.color : "var(--text-faint)",
                border: has ? "none" : "1px dashed var(--border)",
              }}
            >
              <Icon size={14} />
              {meta.label}
              {!has && <span style={{ fontSize: 11, opacity: 0.7 }}>미획득</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
