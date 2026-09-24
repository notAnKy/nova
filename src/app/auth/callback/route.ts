import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

function redirectNoStore(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const loginUrl = new URL("/login", url.origin);
  if (!getSupabaseConfig()) {
    loginUrl.searchParams.set("error", "configuration");
    return redirectNoStore(loginUrl);
  }
  if (url.searchParams.has("error")) {
    loginUrl.searchParams.set("error", "cancelled");
    return redirectNoStore(loginUrl);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    loginUrl.searchParams.set("error", "invalid_callback");
    return redirectNoStore(loginUrl);
  }
  const supabase = await createClient();
  let exchanged = false;
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchanged = !error;
  } catch { /* The callback can fail if Supabase is temporarily unavailable. */ }
  if (!exchanged) {
    loginUrl.searchParams.set("error", "invalid_callback");
    return redirectNoStore(loginUrl);
  }
  return redirectNoStore(new URL("/", url.origin));
}
