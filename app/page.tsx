"use client";

import React, { useState } from "react";

export default function HikvisionSyncPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    success: boolean;
    message: string;
    inserted?: number;
    updated?: number;
    skipped?: number;
    total?: number;
    error?: string;
  }>(null);

  const handleSync = async () => {
    try {
      setLoading(true);
      setResult(null);

      const res = await fetch("/api/hikvision/sync", {
        method: "POST",
      });

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        success: false,
        message: "Request failed",
        error: err?.message || "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <div className="max-w-md w-full border rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-4">Hikvision Log Sync</h1>
        <p className="text-sm text-gray-600 mb-4">
          Click the button below to fetch logs from the Hikvision device and
          store them in the database.
        </p>

        <button
          onClick={handleSync}
          disabled={loading}
          className="w-full py-2 rounded-md border text-sm font-medium disabled:opacity-60"
        >
          {loading ? "Syncing..." : "Sync Now"}
        </button>

        {result && (
          <div className="mt-4 text-sm">
            <p className={`font-medium ${result.success ? "text-green-600" : "text-red-600"}`}>
              {result.message}
            </p>

            {typeof result.total !== "undefined" && (
              <ul className="mt-2 space-y-1">
                <li>Total fetched: {result.total}</li>
                <li>Inserted: {result.inserted}</li>
                <li>Updated: {result.updated}</li>
                <li>Skipped: {result.skipped}</li>
              </ul>
            )}

            {result.error && (
              <p className="mt-2 text-red-500">Error: {result.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
