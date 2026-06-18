"use server";

/**
 * Server Actions for authentication.
 */
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { UserStatus } from "@prisma/client";
import { isRateLimited, registerFailure, clearAttempts } from "@/lib/rateLimit";

export interface LoginState {
  error?: string;
}

/**
 * Authenticates a user with email + password.
 *
 * DISABLED users are always rejected (FR-5). INVITED users may log in with their
 * temporary password but carry `mustChangePassword = true` and are redirected to
 * /change-password, which activates them to ACTIVE (FR-1, FR-4).
 */
export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string | null;

  if (!email || !password) {
    return { error: "E-Mail und Passwort sind erforderlich." };
  }

  // [15] Throttle repeated failed attempts against a given account.
  if (isRateLimited(email)) {
    return {
      error:
        "Zu viele Fehlversuche. Bitte warten Sie einige Minuten und versuchen Sie es erneut.",
    };
  }

  // Look up user
  const user = await prisma.user.findUnique({ where: { email } });

  // Deliberate: same error for "not found" and "wrong password" to avoid
  // user enumeration.
  const genericError = "Ungültige E-Mail-Adresse oder falsches Passwort.";

  if (!user || !user.passwordHash) {
    registerFailure(email);
    return { error: genericError };
  }

  // FR-5: deactivated users may never log in.
  if (user.status === UserStatus.DISABLED) {
    return { error: "Ihr Konto wurde deaktiviert. Bitte wenden Sie sich an den Administrator." };
  }
  // INVITED users are allowed through with their temporary password; the
  // mustChangePassword flag forces them to /change-password (where they are
  // activated to ACTIVE). See redirect below.

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    registerFailure(email);
    return { error: genericError };
  }

  // Successful login resets the failed-attempt counter.
  clearAttempts(email);

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });

  // redirect must be called outside try/catch; Next.js throws internally
  redirect(user.mustChangePassword ? "/change-password" : "/");
}

/**
 * Logs out the current user by clearing the session cookie.
 */
export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
