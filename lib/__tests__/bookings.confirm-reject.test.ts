/**
 * Unit tests for confirmBooking and rejectBooking in lib/bookings.ts.
 *
 * Strategy is identical to bookings.test.ts: Prisma is mocked via vi.mock(),
 * and prisma.$transaction immediately invokes the callback with a fake tx
 * object assembled inside the factory closure.
 *
 * Covers:
 *  - AK-14: non-admin session → immediate error, no DB access
 *  - FR-23: only PENDING bookings may be confirmed or rejected
 *  - AK-12: successful confirmBooking sets status=CONFIRMED, decidedById, decidedAt
 *  - AK-13 / FR-22: confirmBooking detects conflict with existing CONFIRMED booking
 *  - rejectBooking: sets status=REJECTED with decidedBy fields
 *  - Not-found cases for both functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BookingStatus, Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock @/lib/db — must be registered before importing bookings.ts
// vi.mock() is hoisted; factory must not reference outer-scope let/const.
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
import { confirmBooking, rejectBooking } from "../bookings";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Typed mock accessor (same pattern as bookings.test.ts)
// ---------------------------------------------------------------------------

function getMocks() {
  const b = (prisma as unknown as { booking: Record<string, ReturnType<typeof vi.fn>> }).booking;
  return {
    $transaction: (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction,
    findMany:  b.findMany  as ReturnType<typeof vi.fn>,
    findUnique: b.findUnique as ReturnType<typeof vi.fn>,
    create:    b.create    as ReturnType<typeof vi.fn>,
    update:    b.update    as ReturnType<typeof vi.fn>,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UTC-midnight Date, month is 0-based */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Minimal admin SessionPayload */
function adminSession(userId = "admin-1") {
  return {
    userId,
    email: "admin@example.com",
    name: "Admin",
    role: Role.ADMIN,
    mustChangePassword: false,
  };
}

/** Minimal member SessionPayload */
function memberSession(userId = "user-1") {
  return {
    userId,
    email: "member@example.com",
    name: "Member",
    role: Role.MEMBER,
    mustChangePassword: false,
  };
}

/** A minimal PENDING booking DB record */
function pendingBooking(overrides: Partial<{
  id: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
}> = {}) {
  return {
    id: "booking-1",
    status: BookingStatus.PENDING,
    startDate: utc(2026, 6, 10), // future (today pinned to Jun 13 where needed)
    endDate:   utc(2026, 6, 15),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// confirmBooking – AK-14: non-admin guard
// ---------------------------------------------------------------------------

describe("confirmBooking – non-admin guard (AK-14)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error immediately for a MEMBER session without touching the DB (AK-14)", async () => {
    const { $transaction } = getMocks();

    const result = await confirmBooking("booking-1", memberSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Administratoren");
    }
    expect($transaction).not.toHaveBeenCalled();
  });

  it("error message mentions that only admins may confirm (AK-14)", async () => {
    const result = await confirmBooking("booking-1", memberSession("some-user"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Administrator/i);
    }
  });
});

// ---------------------------------------------------------------------------
// confirmBooking – FR-23: only PENDING bookings can be confirmed
// ---------------------------------------------------------------------------

describe("confirmBooking – status guard (FR-23)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error when trying to confirm an already CONFIRMED booking (FR-23)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({ status: BookingStatus.CONFIRMED }));

    const result = await confirmBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("PENDING");
    }
  });

  it("returns error when trying to confirm a REJECTED booking (FR-23)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({ status: BookingStatus.REJECTED }));

    const result = await confirmBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("PENDING");
    }
  });

  it("returns error when trying to confirm a CANCELLED booking (FR-23)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({ status: BookingStatus.CANCELLED }));

    const result = await confirmBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("PENDING");
    }
  });
});

// ---------------------------------------------------------------------------
// confirmBooking – AK-12: successful confirmation
// ---------------------------------------------------------------------------

describe("confirmBooking – successful confirmation (AK-12)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns success=true and the bookingId on a clean confirmation (AK-12)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    findMany.mockResolvedValue([]); // no conflicting confirmed bookings
    update.mockResolvedValue({});

    const result = await confirmBooking("booking-1", adminSession());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.bookingId).toBe("booking-1");
    }
  });

  it("calls tx.booking.update with status=CONFIRMED (AK-12)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});

    await confirmBooking("booking-1", adminSession("admin-42"));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: expect.objectContaining({
          status: BookingStatus.CONFIRMED,
        }),
      })
    );
  });

  it("sets decidedById to the admin's userId (AK-12)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});

    await confirmBooking("booking-1", adminSession("admin-42"));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decidedById: "admin-42",
        }),
      })
    );
  });

  it("sets decidedAt to a Date (AK-12)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});

    await confirmBooking("booking-1", adminSession());

    const callArgs = update.mock.calls[0][0] as { data: { decidedAt?: unknown } };
    expect(callArgs.data.decidedAt).toBeInstanceOf(Date);
  });

  it("admin can confirm their own booking (BR-9)", async () => {
    const { findUnique, findMany, update } = getMocks();
    // Booking belongs to the admin themselves (userId = "admin-1")
    findUnique.mockResolvedValue({ ...pendingBooking(), userId: "admin-1" });
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});

    const result = await confirmBooking("booking-1", adminSession("admin-1"));

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// confirmBooking – AK-13 / FR-22: conflict check at confirmation time
// ---------------------------------------------------------------------------

describe("confirmBooking – conflict detection (AK-13 / FR-22)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error when an overlapping CONFIRMED booking exists at confirmation time (AK-13, FR-22)", async () => {
    const { findUnique, findMany } = getMocks();
    // Booking to confirm: Jul 10–15
    findUnique.mockResolvedValue(pendingBooking({
      startDate: utc(2026, 6, 10),
      endDate:   utc(2026, 6, 15),
    }));
    // Conflicting confirmed booking overlaps: Jul 12–18
    findMany.mockResolvedValue([
      {
        id: "confirmed-other",
        startDate: utc(2026, 6, 12),
        endDate:   utc(2026, 6, 18),
      },
    ]);

    const result = await confirmBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("überschneidet");
    }
  });

  it("does not call update when a conflict is detected (AK-13)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({
      startDate: utc(2026, 6, 10),
      endDate:   utc(2026, 6, 15),
    }));
    findMany.mockResolvedValue([
      {
        id: "confirmed-other",
        startDate: utc(2026, 6, 12),
        endDate:   utc(2026, 6, 18),
      },
    ]);

    await confirmBooking("booking-1", adminSession());

    expect(update).not.toHaveBeenCalled();
  });

  it("allows confirmation when adjacent CONFIRMED booking ends where this one starts (AK-8)", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({
      startDate: utc(2026, 6, 15),
      endDate:   utc(2026, 6, 20),
    }));
    findMany.mockResolvedValue([
      {
        id: "confirmed-adjacent",
        startDate: utc(2026, 6, 10),
        endDate:   utc(2026, 6, 15), // ends exactly where the new booking starts
      },
    ]);
    update.mockResolvedValue({});

    const result = await confirmBooking("booking-1", adminSession());

    expect(result.success).toBe(true);
  });

  it("allows confirmation when no other confirmed bookings exist", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    findMany.mockResolvedValue([]);
    update.mockResolvedValue({});

    const result = await confirmBooking("booking-1", adminSession());

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// confirmBooking – not found
// ---------------------------------------------------------------------------

describe("confirmBooking – not found", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error when the booking does not exist", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(null);

    const result = await confirmBooking("non-existent", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("nicht gefunden");
    }
  });
});

// ---------------------------------------------------------------------------
// rejectBooking – AK-14: non-admin guard
// ---------------------------------------------------------------------------

describe("rejectBooking – non-admin guard (AK-14)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error immediately for a MEMBER session without touching the DB (AK-14)", async () => {
    const { $transaction } = getMocks();

    const result = await rejectBooking("booking-1", memberSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Administratoren");
    }
    expect($transaction).not.toHaveBeenCalled();
  });

  it("error message mentions that only admins may reject (AK-14)", async () => {
    const result = await rejectBooking("booking-1", memberSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Administrator/i);
    }
  });
});

// ---------------------------------------------------------------------------
// rejectBooking – FR-23: only PENDING bookings can be rejected
// ---------------------------------------------------------------------------

describe("rejectBooking – status guard (FR-23)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error when trying to reject an already CONFIRMED booking (FR-23)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({ status: BookingStatus.CONFIRMED }));

    const result = await rejectBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("PENDING");
    }
  });

  it("returns error when trying to reject an already REJECTED booking (FR-23)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({ status: BookingStatus.REJECTED }));

    const result = await rejectBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("PENDING");
    }
  });

  it("returns error when trying to reject a CANCELLED booking (FR-23)", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(pendingBooking({ status: BookingStatus.CANCELLED }));

    const result = await rejectBooking("booking-1", adminSession());

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rejectBooking – successful rejection
// ---------------------------------------------------------------------------

describe("rejectBooking – successful rejection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns success=true and the bookingId", async () => {
    const { findUnique, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    update.mockResolvedValue({});

    const result = await rejectBooking("booking-1", adminSession());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.bookingId).toBe("booking-1");
    }
  });

  it("calls tx.booking.update with status=REJECTED", async () => {
    const { findUnique, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    update.mockResolvedValue({});

    await rejectBooking("booking-1", adminSession("admin-99"));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: expect.objectContaining({
          status: BookingStatus.REJECTED,
        }),
      })
    );
  });

  it("sets decidedById to the admin's userId", async () => {
    const { findUnique, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    update.mockResolvedValue({});

    await rejectBooking("booking-1", adminSession("admin-99"));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decidedById: "admin-99",
        }),
      })
    );
  });

  it("sets decidedAt to a Date", async () => {
    const { findUnique, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    update.mockResolvedValue({});

    await rejectBooking("booking-1", adminSession());

    const callArgs = update.mock.calls[0][0] as { data: { decidedAt?: unknown } };
    expect(callArgs.data.decidedAt).toBeInstanceOf(Date);
  });

  it("does not perform any conflict check before rejecting", async () => {
    const { findUnique, findMany, update } = getMocks();
    findUnique.mockResolvedValue(pendingBooking());
    update.mockResolvedValue({});

    await rejectBooking("booking-1", adminSession());

    // rejectBooking should NOT query confirmed bookings — only confirmBooking needs that
    expect(findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// rejectBooking – not found
// ---------------------------------------------------------------------------

describe("rejectBooking – not found", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("returns error when the booking does not exist", async () => {
    const { findUnique } = getMocks();
    findUnique.mockResolvedValue(null);

    const result = await rejectBooking("non-existent", adminSession());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("nicht gefunden");
    }
  });
});
