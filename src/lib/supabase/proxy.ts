import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();
  const protectedRoute = request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/settings/");
  const loginRedirect = (error: string) => {
    const result = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };
  if (!config) {
    if (protectedRoute) return loginRedirect("configuration");
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  let authenticated = false;
  try {
    const { data } = await supabase.auth.getClaims();
    authenticated = !!data?.claims;
  } catch {
    if (protectedRoute) return loginRedirect("service_unavailable");
  }
  if (protectedRoute && !authenticated) return loginRedirect("expired");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
