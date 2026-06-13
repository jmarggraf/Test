"use server";

/**
 * Server Actions for admin user management (FR-3, FR-5, FR-6).
 */
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Role, UserStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Create user
// ---------------------------------------------------------------------------

export interface CreateUserState {
  error?: string;
  /** The generated temporary password — shown once to the admin */
  tempPassword?: string;
  /** The newly created user's id — used to highlight the row */
  newUserId?: string;
}

/**
 * Creates a new user with a temporary password (FR-3, A6).
 *
 * The temporary password is shown once to the admin; the user must change it
 * on first login (FR-4, mustChangePassword = true).
 */
export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  await requireAdmin();

  const name = (formData.get("name") as string | null)?.trim();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const role = formData.get("role") as string | null;

  // Validate inputs
  if (!name || !email || !role) {
    return { error: "Name, E-Mail und Rolle sind erforderlich." };
  }
  if (!["ADMIN", "MEMBER"].includes(role)) {
    return { error: "Ungültige Rolle." };
  }

  // Generate a random temporary password
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: role as Role,
        passwordHash,
        mustChangePassword: true,
        status: UserStatus.INVITED,
      },
    });

    revalidatePath("/admin/users");

    return { tempPassword, newUserId: user.id };
  } catch (err: unknown) {
    // Unique constraint violation on email (FR-6)
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return {
        error: `Die E-Mail-Adresse „${email}" ist bereits vergeben. Bitte verwenden Sie eine andere.`,
      };
    }
    console.error("[createUserAction]", err);
    return { error: "Fehler beim Anlegen des Nutzers. Bitte erneut versuchen." };
  }
}

// ---------------------------------------------------------------------------
// Deactivate / reactivate user
// ---------------------------------------------------------------------------

export interface ToggleUserStatusState {
  error?: string;
}

/**
 * Toggles a user's status between ACTIVE and DISABLED (FR-5).
 * Admins cannot deactivate themselves.
 */
export async function toggleUserStatusAction(
  _prevState: ToggleUserStatusState,
  formData: FormData
): Promise<ToggleUserStatusState> {
  const admin = await requireAdmin();

  const userId = formData.get("userId") as string | null;
  const targetStatus = formData.get("targetStatus") as string | null;

  if (!userId || !targetStatus) {
    return { error: "Ungültige Anfrage." };
  }

  if (userId === admin.userId) {
    return { error: "Sie können Ihr eigenes Konto nicht deaktivieren." };
  }

  if (!["ACTIVE", "DISABLED"].includes(targetStatus)) {
    return { error: "Ungültiger Status." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: targetStatus as UserStatus },
  });

  revalidatePath("/admin/users");
  return {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a random temporary password of 12 characters.
 * Uses alphanumeric characters to avoid ambiguity.
 */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  // Use Math.random for non-security-critical temp passwords (will be changed immediately)
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
