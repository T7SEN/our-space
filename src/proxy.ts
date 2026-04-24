import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. PWA BYPASS (CRITICAL)
  // This explicitly allows the browser to download the manifest, icons,
  // and service worker without needing the 'besho_auth' cookie.
  const isPublicAsset =
    pathname === "/manifest.json" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/serwist/") ||
    pathname === "/~offline";

  if (isPublicAsset) {
    return NextResponse.next();
  }

  // 2. YOUR ORIGINAL AUTH LOGIC
  const authCookie = request.cookies.get("besho_auth");
  const isLoginPage = pathname === "/login";

  if (!authCookie && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (authCookie && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

// 3. UPDATED MATCHER
// Ensure middleware only runs on actual pages, ignoring static files,
// images, and the new PWA assets.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-|serwist|~offline|.*\\.svg$).*)",
  ],
};
