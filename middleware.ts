/**
 * Next.js middleware: protects app routes.
 *
 * - Unauthenticated requests to protected routes are redirected to /login.
 * - Authenticated requests to /login are redirected to /.
 * - Admin-only routes (/admin/**) redirect non-admins to /.
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { SessionPayload } from "./lib/auth";

// Routes that are publicly accessible (no auth required)
const PUBLIC_PATHS = ["/login"];

// Routes that require ADMIN role
const ADMIN_PATHS = ["/admin"];

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get("ferienhaus_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  const session = await getSessionFromRequest(req);

  // Redirect authenticated users away from login page
  if (isPublic && session) {
    if (session.mustChangePassword) {
      return NextResponse.redirect(new URL("/change-password", req.url));
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Redirect unauthenticated users to login
  if (!isPublic && !session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Force password change before accessing other routes
  if (session?.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Guard admin routes
  const isAdminPath = ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isAdminPath && session?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - api routes (handled individually)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
