import { describe, expect, test } from "bun:test";
import {
  createDonorDriveClient,
  getDonorDriveEventId,
  resolveFundraisingTotal,
} from "./donorDrive";
import {
  getCollectionSpec,
  normalizeCollection,
  validateCollection,
} from "./content/collections";

const campaignPage = (id: number) =>
  `<body data-page-context="&#x7b;&quot;eventID&quot;&#x3a;${id}&#x7d;">`;

function fakeDonorDrive(total: unknown = 10) {
  const urls: string[] = [];
  const state = { total, fail: false };
  const fetchPage: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (state.fail) return new Response("Unavailable", { status: 503 });
    return url.includes("/api/events/")
      ? Response.json({ eventID: 5101, sumDonations: state.total })
      : new Response(campaignPage(5101));
  };
  return { fetchPage, state, urls };
}

describe("fundraising admin totals", () => {
  const spec = getCollectionSpec("fundraising")!;
  const base = {
    currentYear: 2027,
    goalTotal: 15000,
    donorDriveLink: "https://fourdiamonds.donordrive.com/gmhsmt",
    history: [{ year: 2026, total: 15380.34 }],
  };

  test("blank totals remain automatic through saving and subsequent reads", () => {
    for (const currentTotal of ["", "  ", null, undefined]) {
      const saved = validateCollection(spec, { ...base, currentTotal });
      expect(saved.issues).toEqual([]);
      expect(saved.value).toMatchObject({ currentTotal: null });
      expect(normalizeCollection(spec, saved.value)).toMatchObject({
        currentTotal: null,
      });
    }
  });

  test("zero and existing totals remain manual overrides", () => {
    for (const currentTotal of [0, "0", 15380.34, "15380.34"]) {
      const saved = validateCollection(spec, { ...base, currentTotal });
      expect(saved.issues).toEqual([]);
      expect(saved.value).toMatchObject({ currentTotal: Number(currentTotal) });
    }
  });

  test("invalid totals are rejected and required amounts still require values", () => {
    for (const currentTotal of [-1, "invalid", Infinity]) {
      expect(
        validateCollection(spec, { ...base, currentTotal }).issues.some(
          (issue) => issue.path === "currentTotal",
        ),
      ).toBe(true);
    }
    expect(
      validateCollection(spec, {
        ...base,
        currentTotal: null,
        goalTotal: "",
      }).issues.some((issue) => issue.path === "goalTotal"),
    ).toBe(true);
  });
});

describe("DonorDrive totals", () => {
  test("reads encoded campaign IDs and follows future campaign rollovers", () => {
    expect(getDonorDriveEventId(campaignPage(5101))).toBe(5101);
    expect(getDonorDriveEventId(campaignPage(6102))).toBe(6102);
    expect(() => getDonorDriveEventId("<body>")).toThrow();
    expect(() => getDonorDriveEventId(campaignPage(-1))).toThrow();
  });

  test("manual amounts including zero skip DonorDrive completely", async () => {
    for (const currentTotal of [0, 12345.67]) {
      const result = await resolveFundraisingTotal(
        { currentTotal },
        async () => {
          throw new Error("Manual overrides must not fetch DonorDrive.");
        },
      );
      expect(result).toEqual({ currentTotal, totalSource: "manual" });
    }
  });

  test("automatic mode uses the API total and preserves a real zero", async () => {
    for (const total of [0, 10, 1234.56]) {
      const fake = fakeDonorDrive(total);
      const result = await resolveFundraisingTotal(
        { currentTotal: null },
        createDonorDriveClient(fake.fetchPage),
      );
      expect(result).toEqual({
        currentTotal: total,
        totalSource: "donordrive",
      });
      expect(fake.urls).toEqual([
        "https://fourdiamonds.donordrive.com/gmhsmt",
        "https://fourdiamonds.donordrive.com/api/events/5101",
      ]);
    }
  });

  test("concurrent requests share a fetch and the cache refreshes after one minute", async () => {
    const fake = fakeDonorDrive();
    let time = 0;
    const read = createDonorDriveClient(fake.fetchPage, () => time);
    expect(await Promise.all([read(), read(), read()])).toEqual([10, 10, 10]);
    expect(fake.urls).toHaveLength(2);
    fake.state.total = 20;
    expect(await read()).toBe(10);
    time = 60_001;
    expect(await read()).toBe(20);
    expect(fake.urls).toHaveLength(4);
  });

  test("outages retain recent totals, back off retries, and expire stale totals", async () => {
    const fake = fakeDonorDrive();
    let time = 0;
    const read = createDonorDriveClient(fake.fetchPage, () => time);
    expect(await read()).toBe(10);
    fake.state.fail = true;
    time = 60_001;
    expect(await read()).toBe(10);
    expect(await read()).toBe(10);
    expect(fake.urls).toHaveLength(3);
    time = 15 * 60_000 + 1;
    expect(await read()).toBeNull();
    expect(await resolveFundraisingTotal({ currentTotal: null }, read)).toEqual(
      {
        currentTotal: null,
        totalSource: "unavailable",
      },
    );
  });

  test("invalid API totals are unavailable instead of reported as zero", async () => {
    for (const total of [null, "10", -1]) {
      const fake = fakeDonorDrive(total);
      expect(await createDonorDriveClient(fake.fetchPage)()).toBeNull();
    }
  });

  test("network failures keep automatic totals unavailable", async () => {
    const fetchPage: typeof fetch = async () => {
      throw new Error("Timeout");
    };
    expect(await createDonorDriveClient(fetchPage)()).toBeNull();
  });
});
