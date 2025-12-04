import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import HikvisionEvent from "@/models/HikvisionEvent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();

    const events = await HikvisionEvent.find({})
      .sort({ deviceTime: -1 })
      .limit(200)
      .lean();

    return NextResponse.json(
      {
        success: true,
        events,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching events:", error?.message || error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch events",
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
