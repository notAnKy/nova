import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeNextPath } from "@/features/auth/safe-next";

function redirectNoStore(url: URL, clearNext = false) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  if (clearNext) response.cookies.set("nova-auth-next", "", { path: "/auth/callback", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const loginUrl = new URL("/login", url.origin);
  const next = safeNextPath(request.cookies.get("nova-auth-next")?.value);
  if (next !== "/") loginUrl.searchParams.set("next", next);
  if (!getSupabaseConfig()) {
    loginUrl.searchParams.set("error", "configuration");
    return redirectNoStore(loginUrl, true);
  }
  if (url.searchParams.has("error")) {
    loginUrl.searchParams.set("error", "cancelled");
    return redirectNoStore(loginUrl, true);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    loginUrl.searchParams.set("error", "invalid_callback");
    return redirectNoStore(loginUrl, true);
  }
  const supabase = await createClient();
  let exchanged = false;
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchanged = !error;
  } catch { /* The callback can fail if Supabase is temporarily unavailable. */ }
  if (!exchanged) {
    loginUrl.searchParams.set("error", "invalid_callback");
    return redirectNoStore(loginUrl, true);
  }
  return redirectNoStore(new URL(next, url.origin), true);
}
