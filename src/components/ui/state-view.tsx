import type { ReactNode } from "react";
import { CircleAlert, Inbox } from "lucide-react";

type StateViewProps = {
  title: string;
  description: string;
  variant?: "empty" | "error";
  action?: ReactNode;
};

export function StateView({ title, description, variant = "empty", action }: StateViewProps) {
  const Icon = variant === "error" ? CircleAlert : Inbox;
  return (
    <div className="state-view" role={variant === "error" ? "alert" : undefined}>
      <span className="state-view__icon"><Icon size={22} strokeWidth={1.8} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
