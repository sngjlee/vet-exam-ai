"use client";
// components/LoadingSpinner.tsx
export default function LoadingSpinner({ label = "로딩 중…" }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "4rem 0",
        color: "var(--text-muted)",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          border: "2px solid var(--border)",
          borderTopColor: "var(--teal)",
          animation: "spin 0.8s linear infinite",
          willChange: "transform",
        }}
      />
      <span className="text-sm">{label}</span>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
