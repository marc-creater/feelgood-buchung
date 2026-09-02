import { describe, it, expect } from "vitest";
import { freeSlots, isSlotFree } from "./availability";
import { atLocal, makeLocal, localParts, fmtTime } from "./time";

const rules = [
  { weekday: 2, startTime: "09:00", endTime: "13:00", staff: null }, // Dienstag
];
const tue = "2026-09-08"; // ein Dienstag
const now = atLocal("2026-09-01", "08:00");

describe("Zeit-Helfer", () => {
  it("baut lokale Berliner Zeit DST-sicher", () => {
    const sommer = makeLocal(2026, 7, 1, 12, 0); // MESZ = UTC+2
    expect(sommer.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    const winter = makeLocal(2026, 12, 1, 12, 0); // MEZ = UTC+1
    expect(winter.toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(localParts(sommer).hh).toBe(12);
    expect(fmtTime(winter)).toBe("12:00");
  });
});

describe("freeSlots", () => {
  it("liefert Slots im 30-min-Raster, Puffer wird eingerechnet", () => {
    const s = freeSlots({ dateKey: tue, durationMin: 60, bufferMin: 15, staff: "Heike", rules, busy: [], now });
    const times = s.map((x) => fmtTime(x.start));
    // 9:00 … letzter Start, bei dem 60+15 min noch vor 13:00 enden: 11:30 (endet 12:45); 12:00 würde 13:15 enden
    expect(times).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
    expect(fmtTime(s[0].end)).toBe("10:00"); // Ende = Leistung ohne Puffer
  });

  it("spart belegte Zeiten inkl. Puffer aus", () => {
    const busy = [{ start: atLocal(tue, "10:00"), end: atLocal(tue, "11:15") }]; // Termin 10:00–11:00 + 15 Puffer
    const s = freeSlots({ dateKey: tue, durationMin: 30, bufferMin: 15, staff: "Heike", rules, busy, now });
    const times = s.map((x) => fmtTime(x.start));
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).not.toContain("09:30"); // 09:30 + 45 = 10:15 überlappt
    expect(times).toContain("09:00");
    expect(times).toContain("11:30"); // erst nach dem Puffer wieder frei
  });

  it("respektiert den Mindestvorlauf", () => {
    const lateNow = atLocal(tue, "09:30");
    const s = freeSlots({ dateKey: tue, durationMin: 30, bufferMin: 0, staff: "Heike", rules, busy: [], now: lateNow, leadMin: 120 });
    expect(s.map((x) => fmtTime(x.start))[0]).toBe("11:30");
  });

  it("gibt an Tagen ohne Regel nichts zurück", () => {
    expect(freeSlots({ dateKey: "2026-09-07", durationMin: 30, bufferMin: 0, staff: "Heike", rules, busy: [], now })).toHaveLength(0);
  });

  it("filtert nach Anbieter:in", () => {
    const r = [{ weekday: 2, startTime: "09:00", endTime: "10:00", staff: "Carlos" }];
    expect(freeSlots({ dateKey: tue, durationMin: 30, bufferMin: 0, staff: "Heike", rules: r, busy: [], now })).toHaveLength(0);
    expect(freeSlots({ dateKey: tue, durationMin: 30, bufferMin: 0, staff: "Carlos", rules: r, busy: [], now })).toHaveLength(2);
  });

  it("isSlotFree prüft konkrete Startzeit", () => {
    const base = { dateKey: tue, durationMin: 30, bufferMin: 0, staff: "Heike", rules, busy: [], now };
    expect(isSlotFree({ ...base, start: atLocal(tue, "09:00") })).toBe(true);
    expect(isSlotFree({ ...base, start: atLocal(tue, "09:15") })).toBe(false); // nicht im Raster
    expect(isSlotFree({ ...base, start: atLocal(tue, "13:00") })).toBe(false);
  });
});
