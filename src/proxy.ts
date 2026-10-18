import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page: keeps the login session fresh and sends anyone who is not signed
 * in to the login page. Nothing in this app is public except that page, the page an
 * invitation link leads to, which shows nothing without the secret in its address, and the
 * two pages of a forgotten password, which show nothing of a household.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // A response that sets session cookies must never be cached and served to others.
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  // Verifies the session token. The cookie alone proves nothing: anyone can forge one.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;
  const onLoginPage = path === "/login";
  const onInvitation = path.startsWith("/einladung/");
  // Asking for a new password, and the link from that e-mail, which signs in.
  const onPasswordReset = path === "/passwort-vergessen" || path === "/auth/bestaetigen";

  if (!signedIn && !onLoginPage && !onInvitation && !onPasswordReset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && onLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Everything except Next.js internals and static files. The manifest, the service worker
  // and the page it shows without a connection are fetched without the login cookie, by the
  // phone when it installs the app, and contain nothing of the household.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
