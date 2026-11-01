import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../api/client";
import {
  refreshStatus,
  syncNow,
  useQueueStatus,
  type SyncClient,
} from "./queue";

/** The API, as the offline queue needs it. */
export const apiSyncClient: SyncClient = {
  createSample: (body) =>
    api.post<{ id: string; number: number }>("/samples", body),
  uploadPhoto: (sampleId, form) =>
    api.upload(`/samples/${sampleId}/batches`, form),
};

/**
 * Keeps the device queue moving: uploads when the app opens, when the
 * connection comes back, and every 30 seconds while anything waits.
 */
export function useOfflineSync() {
  const qc = useQueryClient();
  const status = useQueueStatus();
  const waiting = status.samples + status.photos - status.refused;

  useEffect(() => {
    const run = () => {
      if (!navigator.onLine) return;
      void syncNow(apiSyncClient)
        .then((r) => {
          if (r.uploaded > 0) {
            void qc.invalidateQueries({ queryKey: ["samples"] });
            void qc.invalidateQueries({ queryKey: ["sample"] });
          }
        })
        .catch(() => undefined);
    };
    void refreshStatus().then(run);
    addEventListener("online", run);
    return () => removeEventListener("online", run);
  }, [qc]);

  useEffect(() => {
    if (waiting <= 0) return;
    const timer = setInterval(() => {
      if (navigator.onLine) void syncNow(apiSyncClient).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(timer);
  }, [waiting]);
}

/** Whether an upload failed for lack of a connection (not a refusal by the server). */
export const isNetworkError = (err: unknown) =>
  err instanceof TypeError || !navigator.onLine;
