// ABOUTME: KV metadata store adapter for blossom-server-sdk
// ABOUTME: Implements IBlobMetadataStore interface using Cloudflare KV

/**
 * KV metadata store adapter for Blossom blobs
 * Implements the IBlobMetadataStore interface from blossom-server-sdk
 */
export class KVMetadataStore {
  constructor(kvNamespace) {
    this.kv = kvNamespace;
  }

  async setup() {
    // KV doesn't require setup
    return;
  }

  async hasBlob(sha256) {
    // Try new format first
    const blob = await this.kv.get(`blob:${sha256}`);
    if (blob !== null) return true;

    // Fallback to old format for backward compatibility
    const oldIndex = await this.kv.get(`idx:sha256:${sha256}`);
    return oldIndex !== null;
  }

  async getBlob(sha256) {
    // Try new format first
    const data = await this.kv.get(`blob:${sha256}`);
    if (data) return JSON.parse(data);

    // Fallback to old format for backward compatibility
    const oldIndex = await this.kv.get(`idx:sha256:${sha256}`);
    if (oldIndex) {
      const { uid } = JSON.parse(oldIndex);
      const videoData = await this.kv.get(`video:${uid}`);
      if (videoData) {
        const video = JSON.parse(videoData);
        // Convert old format to new format
        return {
          sha256: video.sha256 || sha256,
          size: video.size || 0,
          type: video.contentType || 'video/mp4',
          uploaded: Math.floor((video.createdAt || Date.now()) / 1000)
        };
      }
    }

    return null;
  }

  async addBlob(blob) {
    const { sha256, size, type, uploaded } = blob;

    // Store blob metadata
    await this.kv.put(`blob:${sha256}`, JSON.stringify({
      sha256,
      size,
      type,
      uploaded
    }));

    return true;
  }

  async removeBlob(sha256) {
    await this.kv.delete(`blob:${sha256}`);
    return true;
  }

  async addBlobOwner(sha256, pubkey) {
    // Store owner relationship
    await this.kv.put(`owner:${sha256}:${pubkey}`, '1');
    await this.kv.put(`pubkey:${pubkey}:${sha256}`, '1');
    return true;
  }

  async removeBlobOwner(sha256, pubkey) {
    await this.kv.delete(`owner:${sha256}:${pubkey}`);
    await this.kv.delete(`pubkey:${pubkey}:${sha256}`);
    return true;
  }

  async hasBlobOwner(sha256, pubkey) {
    const owner = await this.kv.get(`owner:${sha256}:${pubkey}`);
    return owner !== null;
  }

  async getBlobOwners(sha256) {
    const list = await this.kv.list({ prefix: `owner:${sha256}:` });
    return list.keys.map(key => {
      const parts = key.name.split(':');
      return parts[2]; // Extract pubkey
    });
  }

  async getBlobsForPubkey(pubkey) {
    const blobs = [];

    // Get blobs from new format
    const newList = await this.kv.list({ prefix: `pubkey:${pubkey}:` });
    for (const key of newList.keys) {
      const sha256 = key.name.split(':')[2];
      const blob = await this.getBlob(sha256);
      if (blob) {
        blobs.push(blob);
      }
    }

    // Get blobs from old format for backward compatibility
    const oldList = await this.kv.list({ prefix: `idx:pubkey:${pubkey}:` });
    for (const key of oldList.keys) {
      const uid = key.name.split(':').pop();
      const videoData = await this.kv.get(`video:${uid}`);
      if (videoData) {
        const video = JSON.parse(videoData);
        if (video.sha256) {
          // Check if we already added this blob from new format
          const exists = blobs.some(b => b.sha256 === video.sha256);
          if (!exists) {
            blobs.push({
              sha256: video.sha256,
              size: video.size || 0,
              type: video.contentType || 'video/mp4',
              uploaded: Math.floor((video.createdAt || Date.now()) / 1000)
            });
          }
        }
      }
    }

    return blobs;
  }
}
