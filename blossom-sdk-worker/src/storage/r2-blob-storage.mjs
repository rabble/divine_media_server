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
      const obj = await this.r2.head(`blobs/${sha256}`);
      return obj !== null;
    } catch {
      return false;
    }
  }

  async writeBlob(sha256, stream, mimeType) {
    const key = `blobs/${sha256}`;

    await this.r2.put(key, stream, {
      httpMetadata: {
        contentType: mimeType || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable'
      },
      customMetadata: {
        sha256: sha256,
        uploadedAt: new Date().toISOString()
      }
    });

    return true;
  }

  async readBlob(sha256) {
    const key = `blobs/${sha256}`;
    const obj = await this.r2.get(key);

    if (!obj) {
      return null;
    }

    return {
      body: obj.body,
      size: obj.size,
      type: obj.httpMetadata?.contentType || 'application/octet-stream'
    };
  }

  async removeBlob(sha256) {
    const key = `blobs/${sha256}`;
    await this.r2.delete(key);
    return true;
  }
}
