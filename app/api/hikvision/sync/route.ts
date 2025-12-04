// app/api/hikvision/sync/route.ts
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import HikvisionEvent from "@/models/HikvisionEvent";

// Use same pattern as your working Node script
// @ts-ignore
const DigestFetch =
  require("digest-fetch").default || require("digest-fetch");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ========== Types ==========
interface HikvisionInfoLog {
  time: string;
  minor: number;
  employeeNoString?: string;
  employeeNo?: string | number;
  name?: string;
  cardNo?: string | number;
  [key: string]: any;
}

interface HikvisionResponse {
  AcsEvent?: {
    InfoList?: HikvisionInfoLog[];
  };
}

// ========== ENV CONFIG ==========
const HIKVISION_IP = process.env.HIKVISION_IP;
const HIKVISION_USERNAME = process.env.HIKVISION_USERNAME;
const HIKVISION_PASSWORD = process.env.HIKVISION_PASSWORD;
const HIKVISION_START_TIME =
  process.env.HIKVISION_START_TIME || "2025-11-03T00:00:00+05:30";

function ensureEnv() {
  if (!HIKVISION_IP || !HIKVISION_USERNAME || !HIKVISION_PASSWORD) {
    throw new Error(
      "Hikvision env variables missing. Please set HIKVISION_IP, HIKVISION_USERNAME, HIKVISION_PASSWORD."
    );
  }
}

// Current time in IST, no milliseconds, suitable for Hikvision API
function getCurrentTimeIST(): string {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  return istDate.toISOString().replace("Z", "").slice(0, 19) + "+05:30";
}

function getOperationName(minor: number): string {
  const codes: Record<number, string> = {
    1: "Alarm",
    75: "Door Unlocked",
    76: "Door Locked",
    34: "Face Authentication Pass",
    38: "Face Authentication Fail",
    8: "Card Swiped",
  };
  return codes[minor] || "Unknown Event";
}

// ========== FETCH FROM HIKVISION ==========

async function fetchHikvisionEvents(): Promise<HikvisionInfoLog[]> {
  ensureEnv();

  const client = new DigestFetch(HIKVISION_USERNAME, HIKVISION_PASSWORD);
  const url = `http://${HIKVISION_IP}/ISAPI/AccessControl/AcsEvent?format=json`;

  const endTimeSafe = getCurrentTimeIST();

  console.log("HIKVISION CONFIG ::", {
    ip: HIKVISION_IP,
    username: HIKVISION_USERNAME,
    passwordLength: HIKVISION_PASSWORD?.length,
    startTime: HIKVISION_START_TIME,
    endTime: endTimeSafe,
  });

  let allRecords: HikvisionInfoLog[] = [];
  let searchPosition = 0;
  let hasMoreData = true;

  // Safety cap: avoid infinite hammering, adjust if needed
  const MAX_PAGES = 50; // 50 * 30 = 1500 logs max per run
  let page = 0;

  while (hasMoreData && page < MAX_PAGES) {
    page++;

    const payload = {
      AcsEventCond: {
        searchID: "1",
        searchResultPosition: searchPosition,
        maxResults: 30,
        major: 0,
        minor: 0,
        startTime: HIKVISION_START_TIME,
        endTime: endTimeSafe,
      },
    };

    const response = await client.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");

      // 👉 If we already have some data, and then get 401,
      // treat as "device stopped giving more", not full failure.
      if (response.status === 401 && allRecords.length > 0) {
        console.warn(
          `Received 401 after fetching ${allRecords.length} logs, returning partial data.`
        );
        hasMoreData = false;
        break;
      }

      console.error(
        `Hikvision HTTP error: ${response.status} ${response.statusText} :: ${text}`
      );
      // First request itself failing -> real auth issue
      throw new Error(
        `Hikvision Error ${response.status} - ${response.statusText} :: ${text}`
      );
    }

    const data: HikvisionResponse = await response.json();
    const batchLogs = data.AcsEvent?.InfoList || [];

    if (batchLogs.length === 0) {
      hasMoreData = false;
      break;
    }

    allRecords = allRecords.concat(batchLogs);

    console.log(
      `Fetched batch: ${searchPosition + 1} to ${
        searchPosition + batchLogs.length
      } (size: ${batchLogs.length})`
    );

    searchPosition += batchLogs.length;
    if (batchLogs.length < 30) {
      hasMoreData = false;
    }
  }

  console.log(`TOTAL logs fetched from Hikvision: ${allRecords.length}`);
  return allRecords.reverse(); // newest first
}

// ========== SAVE TO DATABASE ==========

async function saveEventsToDB(logs: HikvisionInfoLog[]) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const log of logs) {
    const cleanTimeStr = log.time.replace("T", " ").slice(0, 19);
    const deviceTime = new Date(cleanTimeStr);

    const employeeId = (log.employeeNoString || log.employeeNo || "").toString();
    const name = log.name || "";
    const cardNo = (log.cardNo || "").toString();
    const minor = Number(log.minor);
    const operation = getOperationName(minor);

    const filter = {
      employeeId,
      deviceTime,
      eventTypeMinor: minor,
    };

    const update = {
      $set: {
        employeeId,
        name,
        cardNo,
        deviceTime,
        eventTypeMinor: minor,
        operation,
        raw: log,
      },
    };

    try {
      const res = await HikvisionEvent.updateOne(filter, update, {
        upsert: true,
      });

      if (res.upsertedCount && res.upsertedCount > 0) {
        inserted++;
      } else if (res.modifiedCount && res.modifiedCount > 0) {
        updated++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        skipped++;
      } else {
        console.error("DB error saving Hikvision event:", err?.message || err);
      }
    }
  }

  return {
    inserted,
    updated,
    skipped,
    total: logs.length,
  };
}

// ========== API HANDLER ==========

export async function POST() {
  try {
    await connectDB();

    const logs = await fetchHikvisionEvents();
    const result = await saveEventsToDB(logs);

    return NextResponse.json(
      {
        success: true,
        message: "Hikvision logs synced successfully.",
        ...result,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Hikvision sync error:", error?.message || error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to sync Hikvision logs.",
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
    