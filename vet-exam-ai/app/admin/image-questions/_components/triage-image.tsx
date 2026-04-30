import { TriageLightbox } from "./triage-lightbox";

export function TriageImage({
  filename,
  url,
  label,
}: {
  filename: string;
  url: string | null;
  label: string;
}) {
  if (!url) {
    return (
      <div
        title={`업로드 누락: ${filename}`}
        style={{
          width:        96,
          height:       96,
          background:   "var(--surface-raised)",
          border:       "1px dashed var(--rule)",
          color:        "var(--text-muted)",
          fontSize:     11,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          textAlign:    "center",
          padding:      4,
          borderRadius: 4,
        }}
      >
        없음
      </div>
    );
  }

  return <TriageLightbox url={url} filename={filename} label={label} />;
}
