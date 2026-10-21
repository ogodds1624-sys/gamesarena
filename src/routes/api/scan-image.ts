import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/scan-image")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => {
        return handle(request);
      },
    },
  },
});

async function handle(request: Request) {
  try {
    const { scanImage } = await import("@/lib/image-scan.server");
    return await scanImage(request);
  } catch (error: unknown) {
    console.error("[image-scan] Request failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Could not complete the request. Refresh scan history before retrying an upload." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
