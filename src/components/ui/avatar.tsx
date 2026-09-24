import type { Person } from "@/fixtures/workspace";

type AvatarProps = {
  person: Pick<Person, "name" | "initials" | "color">;
  size?: "sm" | "md" | "lg";
  online?: boolean;
};

export function Avatar({ person, size = "md", online }: AvatarProps) {
  return (
    <span className={`avatar avatar--${size} avatar--${person.color}`} aria-label={person.name} role="img">
      {person.initials}
      {online !== undefined && <span className={`avatar__status ${online ? "is-online" : "is-offline"}`} aria-hidden="true" />}
    </span>
  );
}
