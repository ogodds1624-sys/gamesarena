import { request } from "node:https";
import OpenAI from "openai";
import { createScanClient } from "./scan-analysis.server.ts";
import { scanErrorDiagnostics } from "./scan-jobs.server.ts";

function requestId(value: unknown) {
  return typeof value === "string" && /^req_[A-Za-z0-9_-]{1,100}$/.test(value) ? value : undefined;
}

export async function checkScanAuthentication(apiKey: string) {
  const body = {
    model: "gpt-4.1-mini",
    messages: [{ role: "user" as const, content: "Reply OK." }],
    max_completion_tokens: 1,
    store: false,
  };
  let sdk: {
    status: number;
    requestId?: string;
    diagnostics?: ReturnType<typeof scanErrorDiagnostics>;
  };
  try {
    const { response } = await createScanClient(apiKey)
      .chat.completions.create(body)
      .withResponse();
    sdk = { status: response.status, requestId: requestId(response.headers.get("x-request-id")) };
  } catch (error) {
    if (!(error instanceof OpenAI.APIError) || !error.status) throw error;
    sdk = {
      status: error.status,
      requestId: requestId(error.requestID),
      diagnostics: scanErrorDiagnostics(error),
    };
  }
  const https = await new Promise<{
    status: number;
    requestId?: string;
    diagnostics?: ReturnType<typeof scanErrorDiagnostics>;
  }>((resolve, reject) => {
    const req = request(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 20_000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          if (body.length + chunk.length > 8192) {
            response.destroy(new Error("Authentication response exceeded diagnostic limit."));
            return;
          }
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 0,
              requestId: requestId(response.headers["x-request-id"]),
              diagnostics:
                response.statusCode === 401
                  ? scanErrorDiagnostics(JSON.parse(body).error)
                  : undefined,
            });
          } catch {
            reject(new Error("Authentication response was not valid JSON."));
          }
        });
        response.on("error", () => reject(new Error("Authentication response transport failed.")));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Authentication check timed out.")));
    req.on("error", () => reject(new Error("Authentication request transport failed.")));
    req.end(JSON.stringify(body));
  });
  return { keyPresent: Boolean(apiKey), sdk, https };
}
