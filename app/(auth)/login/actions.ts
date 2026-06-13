"use server";

/**
 * Server Actions for authentication.
 */
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { UserStatus } from "@prisma/client";

export interface LoginState {
  error?: string;
}

/**
 * Authenticates a user with email + password.
 * Only ACTIVE users can log in (FR-1); INVITED and DISABLED users are rejected.
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

  // Look up user
  const user = await prisma.user.findUnique({ where: { email } });

  // Deliberate: same error for "not found" and "wrong password" to avoid
  // user enumeration.
  const genericError = "Ungültige E-Mail-Adresse oder falsches Passwort.";

  if (!user || !user.passwordHash) {
    return { error: genericError };
  }

  // FR-1 / FR-5: only ACTIVE users may log in
  if (user.status === UserStatus.DISABLED) {
    return { error: "Ihr Konto wurde deaktiviert. Bitte wenden Sie sich an den Administrator." };
  }
  if (user.status === UserStatus.INVITED) {
    return { error: "Ihr Konto ist noch nicht aktiviert. Bitte verwenden Sie das temporäre Passwort, um sich einzuloggen." };
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return { error: genericError };
  }

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
