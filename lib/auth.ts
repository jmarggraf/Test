/**
 * Auth helpers: JWT-based session via signed cookie, role guards.
 *
 * We use `jose` for JWT signing/verification; no NextAuth — keeps things
 * lightweight and easy to unit-test.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOKIE_NAME = "ferienhaus_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Session payload
// ---------------------------------------------------------------------------

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers (server-side only)
// ---------------------------------------------------------------------------

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Session access
// ---------------------------------------------------------------------------

/**
 * Returns the current session payload or null if not authenticated.
 * Safe to call from Server Components and Route Handlers.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Returns the current session or redirects to /login.
 * Also redirects to /change-password if mustChangePassword is set.
 */
export async function requireUser(
  options: { allowMustChangePassword?: boolean } = {}
): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.mustChangePassword && !options.allowMustChangePassword) {
    redirect("/change-password");
  }
  return session;
}

/**
 * Returns the current session only if the user has the ADMIN role,
 * otherwise redirects to /login (unauthenticated) or returns 403 forbidden.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireUser();
  if (session.role !== Role.ADMIN) {
    redirect("/");
  }
  return session;
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export { Role, UserStatus };
