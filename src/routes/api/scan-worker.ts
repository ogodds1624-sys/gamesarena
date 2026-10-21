import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scan-worker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { runScanWorker } = await import("@/lib/image-scan.server");
          return await runScanWorker(request);
        } catch (error: unknown) {
          console.error("[scan-worker] Invocation failed", {
            type: error instanceof Error ? error.name : "UnknownError",
          });
          return Response.json(
            { error: "Worker failed; queued scans will be retried." },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
