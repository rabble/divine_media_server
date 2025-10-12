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
    const blob = await this.kv.get(`blob:${sha256}`);
    return blob !== null;
  }

  async getBlob(sha256) {
    const data = await this.kv.get(`blob:${sha256}`);
    if (!data) return null;
    return JSON.parse(data);
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
    const list = await this.kv.list({ prefix: `pubkey:${pubkey}:` });
    const blobs = [];

    for (const key of list.keys) {
      const sha256 = key.name.split(':')[2];
      const blob = await this.getBlob(sha256);
      if (blob) {
        blobs.push(blob);
      }
    }

    return blobs;
  }
}
