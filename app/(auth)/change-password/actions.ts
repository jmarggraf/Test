"use server";

/**
 * Server Action: change the current user's password.
 */
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser, setSessionCookie } from "@/lib/auth";

export interface ChangePasswordState {
  error?: string;
  success?: boolean;
}

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await requireUser({ allowMustChangePassword: true });

  const currentPassword = formData.get("currentPassword") as string | null;
  const newPassword = formData.get("newPassword") as string | null;
  const confirmPassword = formData.get("confirmPassword") as string | null;

  if (!newPassword || !confirmPassword) {
    return { error: "Alle Felder sind erforderlich." };
  }

  if (newPassword.length < 8) {
    return { error: "Das neue Passwort muss mindestens 8 Zeichen lang sein." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Die Passwörter stimmen nicht überein." };
  }

  // Fetch current user from DB to verify existing password
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return { error: "Benutzer nicht gefunden." };
  }

  // If the user already has a password set (not a first-time forced change),
  // verify the current password.
  if (!session.mustChangePassword) {
    if (!currentPassword) {
      return { error: "Bitte geben Sie Ihr aktuelles Passwort ein." };
    }
    if (!user.passwordHash) {
      return { error: "Kein Passwort gesetzt. Bitte kontaktieren Sie den Administrator." };
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return { error: "Das aktuelle Passwort ist falsch." };
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      // Activate user if they were in INVITED state
      status: user.status === "INVITED" ? "ACTIVE" : user.status,
    },
  });

  // Refresh the session cookie to clear mustChangePassword flag
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: false,
  });

  redirect("/");
}
