"use client";

import { useRef } from "react";

export function TriageLightbox({
  url,
  filename,
  label,
}: {
  url: string;
  filename: string;
  label: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  function open() {
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title={`${label}: ${filename} (클릭 시 확대)`}
        style={{
          padding:      0,
          border:       "1px solid var(--rule)",
          borderRadius: 4,
          background:   "var(--surface-raised)",
          cursor:       "zoom-in",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${label} ${filename}`}
          style={{
            width:        96,
            height:       96,
            objectFit:    "contain",
            display:      "block",
          }}
        />
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          // backdrop click 시 닫기
          if (e.target === dialogRef.current) close();
        }}
        style={{
          padding:      0,
          border:       "none",
          borderRadius: 8,
          maxWidth:     "min(90vw, 1200px)",
          maxHeight:    "90vh",
          background:   "transparent",
        }}
      >
        <div style={{ position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${label} ${filename}`}
            style={{
              maxWidth:     "min(90vw, 1200px)",
              maxHeight:    "90vh",
              display:      "block",
              background:   "white",
              borderRadius: 8,
            }}
          />
          <button
            type="button"
            onClick={close}
            style={{
              position:   "absolute",
              top:        8,
              right:      8,
              padding:    "4px 10px",
              fontSize:   13,
              background: "rgba(0,0,0,0.7)",
              color:      "white",
              border:     "none",
              borderRadius: 4,
              cursor:     "pointer",
            }}
          >
            닫기
          </button>
        </div>
      </dialog>
    </>
  );
}
