import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/app/actions/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. PWA BYPASS (CRITICAL)
  // Explicitly allow the browser to download the manifest, icons,
  // and service worker without needing authentication.
  const isPublicAsset =
    pathname === "/manifest.json" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/serwist/") ||
    pathname === "/~offline";

  if (isPublicAsset) {
    return NextResponse.next();
  }

  // 2. JWT AUTHENTICATION LOGIC
  // We look for the 'session' cookie set by our Server Action
  const sessionCookie = request.cookies.get("session")?.value;
  const isLoginPage = pathname === "/login";

  // Attempt to decrypt the JWT session at the Edge
  const session = sessionCookie ? await decrypt(sessionCookie) : null;

  // Redirect unauthenticated users to the login page
  if (!session?.isAuthenticated && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect already authenticated users away from the login page
  if (session?.isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

// 3. UPDATED MATCHER
// Ensure middleware only runs on actual pages, ignoring static files,
// images, and the PWA assets at the routing level.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|manifest\\.json|icon-|serwist|~offline|\\.*\\.svg$).*)",
  ],
};
