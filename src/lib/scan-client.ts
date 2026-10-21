import { getBearerToken } from "@/lib/auth/client";
import { jobsSchema, type ScanJob } from "./image-scan";

export function scanHeaders() {
  const headers = new Headers();
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
function parseResponse(data: unknown, ok: boolean): ScanJob[] {
  if (!ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Scanner request failed. Refresh history before retrying.";
    throw new Error(message);
  }
  return jobsSchema.parse(data).jobs;
}
export async function scanRequest(query = "", process = false) {
  const response = await fetch(`/api/scan-image${query}`, {
    method: process ? "POST" : "GET",
    credentials: "same-origin",
    headers: scanHeaders(),
  });
  return parseResponse(await response.json(), response.ok);
}
export function uploadScan(
  file: File,
  id: string,
  progress: (percent: number) => void,
): Promise<ScanJob[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/scan-image");
    xhr.withCredentials = true;
    xhr.timeout = 60_000;
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("X-Scan-Id", id);
    scanHeaders().forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      try {
        resolve(parseResponse(JSON.parse(xhr.responseText), xhr.status >= 200 && xhr.status < 300));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload connection lost. Retry this upload or check history before starting another.",
        ),
      );
    xhr.ontimeout = () =>
      reject(
        new Error("Upload timed out. Retry this upload or check history before starting another."),
      );
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}
