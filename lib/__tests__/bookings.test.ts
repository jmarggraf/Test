/**
 * Unit tests for lib/bookings.ts
 *
 * Strategy:
 *  - validateBookingDates: pure function — tested exhaustively with
 *    vi.useFakeTimers() so "past" comparisons are deterministic.
 *  - createBooking / updateBooking / cancelBooking: DB-dependent functions
 *    tested by mocking @/lib/db.  vi.mock factories are hoisted by Vitest to
 *    the top of the compiled module, so all mock functions are created INSIDE
 *    the factory (not in outer scope variables) and retrieved via vi.mocked().
 *
 * NOTE: prisma.$transaction is mocked to immediately invoke the callback with
 * a fake transaction object (tx), which is itself assembled inside the factory
 * closure.  This lets us test the business-rule branches without a real DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BookingStatus, Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock @/lib/db BEFORE importing bookings.ts.
// vi.mock() is hoisted — the factory must not reference outer-scope `let`/`const`.
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => {
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  const tx = { booking: { findMany, findUnique, create, update } };

  const $transaction = vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx));

  return {
    prisma: {
      $transaction,
      booking: { findMany, findUnique, create, update },
    },
  };
});

// Import AFTER mock registration
import {
  validateBookingDates,
  createBooking,
  updateBooking,
  cancelBooking,
} from "../bookings";
import { prisma } from "@/lib/db";

// Typed helpers to access the mock functions
function getMocks() {
  const booking = (prisma as unknown as { booking: Record<string, ReturnType<typeof vi.fn>> }).booking;
  return {
    $transaction: (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction,
    findMany: booking.findMany as ReturnType<typeof vi.fn>,
    findUnique: booking.findUnique as ReturnType<typeof vi.fn>,
    create: booking.create as ReturnType<typeof vi.fn>,
    update: booking.update as ReturnType<typeof vi.fn>,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UTC-midnight Date */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Minimal SessionPayload for a regular member */
function memberSession(userId = "user-1") {
  return {
    userId,
    email: "member@example.com",
    name: "Member",
    role: Role.MEMBER,
    mustChangePassword: false,
  };
}

/** Minimal SessionPayload for an admin */
function adminSession(userId = "admin-1") {
  return {
    userId,
    email: "admin@example.com",
    name: "Admin",
    role: Role.ADMIN,
    mustChangePassword: false,
  };
}

/** Minimal booking DB record */
function makeBooking(overrides: Partial<{
  id: string;
  userId: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
}> = {}) {
  return {
    id: "booking-1",
    userId: "user-1",
    status: BookingStatus.PENDING,
    startDate: utc(2026, 6, 10), // July 10 — future (today pinned to Jun 13)
    endDate: utc(2026, 6, 15),   // July 15
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateBookingDates (pure)
// ---------------------------------------------------------------------------

describe("validateBookingDates – date ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a valid future booking", () => {
    expect(validateBookingDates(utc(2026, 6, 10), utc(2026, 6, 15))).toBeNull();
  });

  it("returns null for a booking starting today", () => {
    expect(validateBookingDates(utc(2026, 5, 13), utc(2026, 5, 20))).toBeNull();
  });

  it("returns error when endDate equals startDate (zero nights)", () => {
    const result = validateBookingDates(utc(2026, 6, 10), utc(2026, 6, 10));
    expect(result).not.toBeNull();
    expect(result).toContain("Abreisedatum");
  });

  it("returns error when endDate is before startDate (negative nights)", () => {
    const result = validateBookingDates(utc(2026, 6, 15), utc(2026, 6, 10));
    expect(result).not.toBeNull();
    expect(result).toContain("Abreisedatum");
  });

  it("endDate one day after startDate (1 night) is valid", () => {
    expect(validateBookingDates(utc(2026, 6, 10), utc(2026, 6, 11))).toBeNull();
  });
});

describe("validateBookingDates – past-date guard (BR-7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns error for non-admin when startDate is in the past", () => {
    const result = validateBookingDates(utc(2026, 5, 10), utc(2026, 5, 15), false);
    expect(result).not.toBeNull();
    expect(result).toContain("Vergangenheit");
  });

  it("returns error for non-admin when startDate is yesterday", () => {
    const result = validateBookingDates(utc(2026, 5, 12), utc(2026, 5, 15), false);
    expect(result).not.toBeNull();
  });

  it("returns null for admin when startDate is in the past (A8 admin exemption)", () => {
    expect(validateBookingDates(utc(2026, 5, 10), utc(2026, 5, 15), true)).toBeNull();
  });

  it("admin can book starting today", () => {
    expect(validateBookingDates(utc(2026, 5, 13), utc(2026, 5, 20), true)).toBeNull();
  });

  it("admin endDate must still be after startDate", () => {
    const result = validateBookingDates(utc(2026, 5, 10), utc(2026, 5, 10), true);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createBooking
// ---------------------------------------------------------------------------

describe("createBooking – date validation rejects early without DB call", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error and skips DB when dates are invalid (past start)", async () => {
    const { $transaction } = getMocks();
    const result = await createBooking("user-1", {
      startDate: utc(2026, 5, 10), // past
      endDate: utc(2026, 5, 15),
    });
    expect(result.success).toBe(false);
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe("createBooking – CONFIRMED conflict detection (AK-7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("rejects booking that overlaps a CONFIRMED booking (AK-7)", async () => {
    const { findMany } = getMocks();
    findMany.mockResolvedValue([
      {
        id: "existing-1",
        startDate: utc(2026, 6, 10),
        endDate: utc(2026, 6, 15),
        status: BookingStatus.CONFIRMED,
      },
    ]);

    const result = await createBooking("user-1", {
      startDate: utc(2026, 6, 12), // overlaps
      endDate: utc(2026, 6, 14),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("bestätigt gebucht");
  });

  it("allows booking when new startDate equals CONFIRMED endDate (AK-8 checkout/checkin same day)", async () => {
    const { findMany, create } = getMocks();
    findMany.mockResolvedValue([
      {
        id: "existing-1",
        startDate: utc(2026, 6, 5),
        endDate: utc(2026, 6, 10), // ends July 10
        status: BookingStatus.CONFIRMED,
      },
    ]);
    create.mockResolvedValue({ id: "new-booking" });

    const result = await createBooking("user-1", {
      startDate: utc(2026, 6, 10), // starts July 10 — no overlap (AK-8)
      endDate: utc(2026, 6, 15),
    });

    expect(result.success).toBe(true);
  });

  it("allows booking when new endDate equals CONFIRMED startDate (AK-8 reverse)", async () => {
    const { findMany, create } = getMocks();
    findMany.mockResolvedValue([
      {
        id: "existing-1",
        startDate: utc(2026, 6, 15),
        endDate: utc(2026, 6, 20),
        status: BookingStatus.CONFIRMED,
      },
    ]);
    create.mockResolvedValue({ id: "new-booking" });

    const result = await createBooking("user-1", {
      startDate: utc(2026, 6, 10),
      endDate: utc(2026, 6, 15), // ends July 15 — adjacent
    });

    expect(result.success).toBe(true);
  });
});

describe("createBooking – PENDING overlap handling (FR-26)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("allows booking with overlapping PENDING and sets hasPendingConflicts=true (FR-26)", async () => {
    const { findMany, create } = getMocks();
    findMany.mockResolvedValue([
      {
        id: "pending-1",
        startDate: utc(2026, 6, 10),
        endDate: utc(2026, 6, 15),
        status: BookingStatus.PENDING,
      },
    ]);
    create.mockResolvedValue({ id: "new-booking" });

    const result = await createBooking("user-1", {
      startDate: utc(2026, 6, 12),
      endDate: utc(2026, 6, 17),
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.hasPendingConflicts).toBe(true);
  });

  it("creates booking with hasPendingConflicts=false when no overlaps at all", async () => {
    const { findMany, create } = getMocks();
    findMany.mockResolvedValue([]);
    create.mockResolvedValue({ id: "new-booking" });

    const result = await createBooking("user-1", {
      startDate: utc(2026, 6, 10),
      endDate: utc(2026, 6, 15),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.hasPendingConflicts).toBe(false);
      expect(result.bookingId).toBe("new-booking");
    }
  });

  it("returns the new bookingId on success", async () => {
    const { findMany, create } = getMocks();
    findMany.mockResolvedValue([]);
    create.mockResolvedValue({ id: "created-id-123" });

    const result = await createBooking("user-42", {
      startDate: utc(2026, 6, 10),
      endDate: utc(2026, 6, 15),
      title: "Sommerurlaub",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.bookingId).toBe("created-id-123");
  });
});

// ---------------------------------------------------------------------------
// updateBooking
// ---------------------------------------------------------------------------

describe("updateBooking – authorization (AK-10)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("refuses when regular user tries to edit another user's booking (AK-10)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "other-user" }));

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      memberSession("user-1")
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("eigenen Buchungen");
  });

  it("allows admin to edit another user's booking (FR-19)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "other-user" }));
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      adminSession()
    );

    expect(result.success).toBe(true);
  });
});

describe("updateBooking – status guard (FR-17)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("refuses when non-admin tries to edit a CONFIRMED booking (FR-17)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(
      makeBooking({ userId: "user-1", status: BookingStatus.CONFIRMED })
    );

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      memberSession("user-1")
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("PENDING");
  });

  it("allows admin to edit a CONFIRMED booking (FR-19)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(
      makeBooking({ userId: "other-user", status: BookingStatus.CONFIRMED })
    );
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      adminSession()
    );

    expect(result.success).toBe(true);
  });
});

describe("updateBooking – past-booking guard (BR-6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("refuses to edit a booking fully in the past", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(
      makeBooking({
        userId: "user-1",
        startDate: utc(2026, 0, 1),
        endDate: utc(2026, 0, 5), // fully past (today = Jun 13)
      })
    );

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 0, 1), endDate: utc(2026, 0, 5) },
      memberSession("user-1")
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("ergangen");
  });
});

describe("updateBooking – conflict detection on edit (AK-9, AK-7, AK-8)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("rejects update that creates overlap with CONFIRMED booking (AK-7)", async () => {
    const { findUnique, findMany } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "user-1" }));
    findMany.mockResolvedValue([
      {
        id: "other-confirmed",
        startDate: utc(2026, 6, 12),
        endDate: utc(2026, 6, 18),
        status: BookingStatus.CONFIRMED,
      },
    ]);

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      memberSession("user-1")
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("bestätigt gebucht");
  });

  it("allows update where new dates are adjacent to a CONFIRMED booking (AK-8)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "user-1" }));
    findMany.mockResolvedValue([
      {
        id: "confirmed-adjacent",
        startDate: utc(2026, 6, 15),
        endDate: utc(2026, 6, 20),
        status: BookingStatus.CONFIRMED,
      },
    ]);
    update.mockResolvedValue({});

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      memberSession("user-1")
    );

    expect(result.success).toBe(true);
  });

  it("returns hasPendingConflicts=true when updated dates overlap PENDING bookings", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "user-1" }));
    findMany.mockResolvedValue([
      {
        id: "other-pending",
        startDate: utc(2026, 6, 12),
        endDate: utc(2026, 6, 18),
        status: BookingStatus.PENDING,
      },
    ]);
    update.mockResolvedValue({});

    const result = await updateBooking(
      "booking-1",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      memberSession("user-1")
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.hasPendingConflicts).toBe(true);
  });
});

describe("updateBooking – not found", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error when booking does not exist", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(null);

    const result = await updateBooking(
      "non-existent",
      { startDate: utc(2026, 6, 10), endDate: utc(2026, 6, 15) },
      memberSession()
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("nicht gefunden");
  });
});

// ---------------------------------------------------------------------------
// cancelBooking
// ---------------------------------------------------------------------------

describe("cancelBooking – authorization (AK-10)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("refuses when regular user tries to cancel another user's booking (AK-10)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "other-user" }));

    const result = await cancelBooking("booking-1", memberSession("user-1"));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("eigenen Buchungen");
  });

  it("allows admin to cancel another user's booking (FR-19)", async () => {
    const { findUnique, update } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "other-user" }));
    update.mockResolvedValue({});

    const result = await cancelBooking("booking-1", adminSession());

    expect(result.success).toBe(true);
  });

  it("allows user to cancel their own booking", async () => {
    const { findUnique, update } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "user-1" }));
    update.mockResolvedValue({});

    const result = await cancelBooking("booking-1", memberSession("user-1"));

    expect(result.success).toBe(true);
  });
});

describe("cancelBooking – past-booking guard (BR-6, AK-11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("refuses to cancel a booking fully in the past (AK-11)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(
      makeBooking({
        userId: "user-1",
        startDate: utc(2026, 0, 1),
        endDate: utc(2026, 0, 5), // fully past
      })
    );

    const result = await cancelBooking("booking-1", memberSession("user-1"));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("ergangen");
  });

  it("admin also cannot cancel a fully past booking (BR-6 write-protection)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(
      makeBooking({
        userId: "other-user",
        startDate: utc(2026, 0, 1),
        endDate: utc(2026, 0, 5),
      })
    );

    const result = await cancelBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
  });
});

describe("cancelBooking – already-cancelled/rejected guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("refuses to cancel an already CANCELLED booking", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(
      makeBooking({ userId: "user-1", status: BookingStatus.CANCELLED })
    );

    const result = await cancelBooking("booking-1", memberSession("user-1"));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("storniert");
  });

  it("refuses to cancel an already REJECTED booking", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(
      makeBooking({ userId: "user-1", status: BookingStatus.REJECTED })
    );

    const result = await cancelBooking("booking-1", memberSession("user-1"));

    expect(result.success).toBe(false);
  });
});

describe("cancelBooking – not found", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error when booking does not exist", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(null);

    const result = await cancelBooking("non-existent", memberSession());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("nicht gefunden");
  });
});

describe("cancelBooking – soft delete verifies CANCELLED status is written (BR-4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("calls tx.booking.update with status=CANCELLED (not a hard delete, BR-4)", async () => {
    const { findUnique, update } = getMocks();
    findUnique.mockResolvedValue(makeBooking({ userId: "user-1" }));
    update.mockResolvedValue({});

    await cancelBooking("booking-1", memberSession("user-1"));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: { status: BookingStatus.CANCELLED },
      })
    );
  });
});
