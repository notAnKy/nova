import Image from "next/image";
import type { Profile } from "./profile";

export function ProfileAvatar({ profile, size = "sm" }: { profile: Profile; size?: "sm" | "lg" }) {
  const initials = profile.display_name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
  return <span className={`profile-avatar profile-avatar--${size}`} role="img" aria-label={profile.display_name}>
    {profile.avatar_url ? <Image src={profile.avatar_url} alt="" fill sizes={size === "lg" ? "64px" : "30px"} unoptimized /> : initials}
  </span>;
}
