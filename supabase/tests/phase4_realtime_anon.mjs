import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
    }),
);

const client = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

async function probe(privateChannel) {
  const channel = client.channel("channel:00000000-0000-0000-0000-000000000000", {
    config: { private: privateChannel },
  });
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: "NO_RESPONSE", message: "" }), 15_000);
    channel.subscribe((status, error) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
        clearTimeout(timer);
        resolve({ status, message: String(error?.message ?? "") });
      }
    });
  });
  await client.removeChannel(channel);
  return result;
}

const publicResult = await probe(false);
const privateResult = await probe(true);
client.realtime.disconnect();
const publicBlocked = publicResult.status === "CHANNEL_ERROR" && /PrivateOnly/i.test(publicResult.message);
const privateBlocked =
  privateResult.status === "CHANNEL_ERROR" &&
  /unauthoriz|permission|forbidden|access denied|rls|invalid jwt/i.test(privateResult.message);
const safeReason = (message) => message.replaceAll(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "[redacted]");
console.log(`Public-topic rejection: ${publicBlocked ? "confirmed" : "not confirmed"} (${safeReason(publicResult.message)})`);
console.log(`Anonymous private-topic rejection: ${privateBlocked ? "confirmed" : "not confirmed"} (${safeReason(privateResult.message)})`);
process.exit(publicBlocked && privateBlocked ? 0 : 1);
