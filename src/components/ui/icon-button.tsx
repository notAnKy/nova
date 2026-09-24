import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  variant?: "plain" | "soft";
};

export function IconButton({ label, children, variant = "plain", className = "", ...props }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-button icon-button--${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
