export function formatLocalMessageTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const sameYear = date.getFullYear() === now.getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    ...(sameDay ? {} : { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }),
    hour: "numeric", minute: "2-digit", hour12: true,
  };
  return {
    short: new Intl.DateTimeFormat("en-US", options).format(date),
    full: new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", hour12: true }).format(date),
  };
}
