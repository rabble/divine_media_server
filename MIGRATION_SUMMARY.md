# Migration System Summary

## Current Status

✅ **Infrastructure Ready**:
- Cloudflare Stream service deployed at `https://cf-stream-service-prod.protestnet.workers.dev`
- Custom CDN domain working at `https://cdn.divine.video`
- R2 storage accessible at `https://r2.divine.video`
- CDN proxy workers deployed and functioning

## Migration Endpoints

### 1. OpenVine Migration (NEW)
Migrate videos from api.openvine.co to Cloudflare Stream:

```bash
# Single video migration
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/openvine/migrate" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "{actual_video_id_from_openvine}",
    "vineId": "unique_identifier",
    "nip98Auth": "Nostr {base64_event}"  // Optional, for authenticated endpoints
  }'

# Batch migration
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/openvine/migrate-batch" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "videoIds": ["id1", "id2", "id3"],
    "limit": 10
  }'
```

### 2. R2 Migration
Migrate videos from R2 bucket to Stream:

```bash
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/r2/migrate" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "r2Key": "uploads/video.mp4",
    "vineId": "unique_identifier"
  }'
```

### 3. URL Migration
Migrate from any public URL:

```bash
curl -X POST "https://cf-stream-service-prod.protestnet.workers.dev/v1/migrate" \
  -H "Authorization: Bearer 823d4485677c393b51fbb8555b8f5d39777e266c22e30b4190586f701eea5a8c" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://example.com/video.mp4",
    "vineId": "unique_identifier"
  }'
```

## Important Notes

### About OpenVine URLs
- OpenVine media is served from `api.openvine.co/media/{fileId}` NOT `cdn.openvine.co`
- Most api.openvine.co endpoints require NIP-98 authentication
- The video IDs from analytics may not correspond to actual file IDs

### Stream API Limitations
- The Stream API token needs proper permissions (Edit access)
- URL imports may fail with standard tokens
- Manual upload through dashboard may be required for some videos

### After Migration
Each migrated video will have:
- **HLS Stream**: `https://cdn.divine.video/{uid}/manifest/video.m3u8`
- **DASH Stream**: `https://cdn.divine.video/{uid}/manifest/video.mpd`
- **Thumbnail**: `https://cdn.divine.video/{uid}/thumbnails/thumbnail.jpg`
- **MP4 Download**: `https://cdn.divine.video/{uid}/downloads/default.mp4`

## To Get Started

1. **Find actual video IDs** from api.openvine.co that exist
2. **Create NIP-98 auth** if accessing protected endpoints
3. **Test migration** with a single video first
4. **Verify playback** at cdn.divine.video
5. **Scale up** to batch processing for 150k videos

## Current Issues

⚠️ **Need to resolve**:
- Get actual video file IDs from api.openvine.co (the analytics IDs don't map to files)
- Stream API token may need to be recreated with proper permissions
- May need to implement TUS protocol for proper video uploads

## Next Steps

1. Get a list of actual video file IDs from the OpenVine system
2. Test migration with a real video that exists
3. Implement proper TUS upload protocol if direct upload fails
4. Set up batch processing with Cloudflare Queues for 150k videos