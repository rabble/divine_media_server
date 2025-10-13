// ABOUTME: R2 blob storage adapter for blossom-server-sdk
// ABOUTME: Implements IBlobStorage interface using Cloudflare R2

/**
 * R2 storage adapter for Blossom blobs
 * Implements the IBlobStorage interface from blossom-server-sdk
 */
export class R2BlobStorage {
  constructor(r2Bucket) {
    this.r2 = r2Bucket;
  }

  async setup() {
    // R2 doesn't require setup
    return;
  }

  async hasBlob(sha256) {
    try {
      // Check new path first
      const obj = await this.r2.head(`blobs/${sha256}`);
      if (obj !== null) return true;
    } catch {}

    try {
      // Fallback to old path for backward compatibility
      const oldObj = await this.r2.head(`videos/${sha256}.mp4`);
      return oldObj !== null;
    } catch {
      return false;
    }
  }

  async writeBlob(sha256, stream, mimeType, owner = '', uid = '', proofModeVerified = null) {
    const key = `blobs/${sha256}`;

    const customMetadata = {
      sha256: sha256,
      uploadedAt: new Date().toISOString(),
      owner: owner,
      uid: uid
    };

    // Add ProofMode verification metadata if available
    if (proofModeVerified) {
      customMetadata.proofmode_verified = proofModeVerified.verified ? 'true' : 'false';
      customMetadata.proofmode_level = proofModeVerified.level || 'unverified';
      if (proofModeVerified.deviceFingerprint) {
        customMetadata.proofmode_fingerprint = proofModeVerified.deviceFingerprint;
      }
    }

    await this.r2.put(key, stream, {
      httpMetadata: {
        contentType: mimeType || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable'
      },
      customMetadata
    });

    return true;
  }

  async readBlob(sha256) {
    // Try new path first
    let obj = await this.r2.get(`blobs/${sha256}`);

    // Fallback to old path for backward compatibility
    if (!obj) {
      obj = await this.r2.get(`videos/${sha256}.mp4`);
    }

    if (!obj) {
      return null;
    }

    return {
      body: obj.body,
      size: obj.size,
      type: obj.httpMetadata?.contentType || 'application/octet-stream',
      etag: obj.etag
    };
  }

  async removeBlob(sha256) {
    const key = `blobs/${sha256}`;
    await this.r2.delete(key);
    return true;
  }
}
