"use client";

type AdminConfirmSubmitButtonProps = {
  children: React.ReactNode;
  confirmMessage: string;
  className?: string;
  style?: React.CSSProperties;
};

export function AdminConfirmSubmitButton({
  children,
  confirmMessage,
  className,
  style,
}: AdminConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
