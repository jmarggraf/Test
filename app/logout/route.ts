/**
 * Logout route handler.
 *
 * Clears the session cookie and redirects to /login. Used both by an explicit
 * logout and by requireUser() to evict a user who was disabled after login
 * ([6]); routing through here (a Route Handler that can mutate cookies) avoids
 * a redirect loop with the middleware.
 */
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reason = searchParams.get("reason");

  const target = new URL("/login", request.url);
  if (reason) {
    target.searchParams.set("reason", reason);
  }

  const response = NextResponse.redirect(target);
  response.cookies.delete(COOKIE_NAME);
  return response;
}
