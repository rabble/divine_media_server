// ABOUTME: Deprecated handler - Stream removed, use Blossom upload endpoint instead
// ABOUTME: Returns deprecation notice directing clients to /upload endpoint

import { json } from "../router.mjs";

export async function createVideo(req, env, deps) {
  // This endpoint is deprecated - we now use R2 storage exclusively via Blossom protocol
  // Clients should use the Blossom upload endpoint at /upload instead

  return json(410, {
    error: "deprecated",
    reason: "stream_removed",
    message: "Cloudflare Stream has been removed. Please use the Blossom upload endpoint at /upload for video uploads.",
    alternative_endpoint: "/upload",
    documentation: "https://github.com/hzrd149/blossom",
    note: "All videos are now stored directly in R2 for cost efficiency"
  });
}