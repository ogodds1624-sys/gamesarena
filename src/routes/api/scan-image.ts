import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scan-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { scanImage } = await import("@/lib/image-scan.server");
          return await scanImage(request);
        } catch (error: unknown) {
          console.error("[image-scan] Request failed", {
            type: error instanceof Error ? error.name : "UnknownError",
          });
          return Response.json(
            { error: "Could not process the scan. Retry the same request to check its result." },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
