# Changelog

## [2025-01-28] - Fix CDN HTTP 500 Status Errors

### Fixed
- **CDN 500 errors** - Videos were returning HTTP 500 status codes while still serving data
- **Immutable headers error** - `addMonitoringHeaders` function now safely handles immutable headers
- **Response status codes** - All successful video/image responses now explicitly return HTTP 200

### Technical Details
- Wrapped header modifications in try-catch to handle Cloudflare's immutable cached responses
- Removed async cache operations after response creation (Cloudflare Workers limitation)
- Explicitly set status 200 for all successful R2 content responses
- Videos now properly work with both `/{sha256}` and `/{sha256}.mp4` URL patterns

### Root Cause
- Cloudflare Workers doesn't allow async operations after returning a response
- Cache operations were throwing errors after response was already being streamed
- Runtime would return 500 status even though video data was successfully served

## [2025-01-27] - Remove HLS/DASH Support After Stream Removal

### BREAKING CHANGES
- **Removed HLS (.m3u8) URL generation** - No longer generating HLS manifest URLs
- **Removed DASH (.mpd) URL generation** - No longer generating DASH manifest URLs
- **HLS requests return HTTP 410** - CDN now returns "Gone" status for manifest requests

### Changed
- **stream_urls.mjs** - Removed hlsUrl, dashUrl, iframeUrl, and webmUrl from URL generation
- **CDN proxy** - Returns HTTP 410 for `/manifest/video.m3u8` and `/manifest/video.mpd` requests
- **Blossom handler** - Redirects to MP4 URLs instead of HLS manifests
- **Video serving** - All videos now served exclusively as MP4 files from R2

### Impact
- **iOS compatibility** - iOS devices must use MP4 URLs directly (no adaptive streaming)
- **Nostr events** - Should only include MP4 URLs in imeta tags, not HLS URLs
- **Bandwidth usage** - No adaptive bitrate streaming, full MP4 files must be downloaded

## [2025-01-26] - Remove Cloudflare Stream and Migrate to R2-Only Storage

### BREAKING CHANGES
- **Removed Cloudflare Stream integration** - All video processing now uses R2 storage exclusively
- **Deprecated `/v1/videos` endpoint** - Returns HTTP 410 with deprecation notice
- **Stream configuration removed** - STREAM_ACCOUNT_ID and STREAM_API_TOKEN no longer needed

### Changed
- **Video storage** - All videos now stored directly in R2 bucket without Stream processing
- **Cost model** - Eliminated Stream charges ($5/1000 minutes), now only R2 storage costs ($0.015/GB/month)
- **Bandwidth** - Using R2's free egress bandwidth instead of Stream delivery charges
- **Configuration** - Replaced USE_R2_FALLBACK with R2_ONLY_MODE flag

### Preserved Functionality
- **Thumbnail generation** - Still works via Cloudflare Media Transformations API
- **Content moderation** - Sightengine integration unchanged
- **Content blocking** - Manual blocking system fully operational
- **CDN serving** - All existing videos continue to work via cdn.divine.video

### Technical Details
- Created `DEPRECATED_STREAM_CODE_BACKUP.mjs` with all removed Stream code for reference
- Removed Stream webhook handler (no longer needed)
- Simplified video upload flow to direct R2 storage
- Eliminated enable-downloads functionality (not needed with R2)

### Migration Impact
- **No action required** - All existing videos continue to work
- **Cost savings** - Immediate reduction in Stream charges
- **Performance** - Similar or better performance with R2 direct serving
- **Uploads** - New uploads should use Blossom `/upload` endpoint

### Files Modified
- `src/handlers/videos.mjs` - Now returns deprecation notice
- `src/handlers/blossom.mjs` - Simplified without Stream fallback
- `src/handlers/webhook.mjs` - Stream webhook code removed
- `src/utils/dual_storage.mjs` - Stream upload function removed
- `src/utils/auto_enable_downloads.mjs` - Updated for R2-only mode
- `wrangler.toml` - Removed Stream configuration variables
- `cdn-proxy-wrangler.toml` - Removed Stream account ID

## [2025-01-21] - Blossom Protocol Support

### Added
- **Blossom protocol compatibility** - Full implementation of Blossom blob storage protocol
  - `GET /<sha256>` - Retrieve blob by SHA-256 hash (redirects to Stream playback URL)
  - `HEAD /<sha256>` - Check if blob exists
  - `PUT /upload` - Upload blob with Blossom-compatible response format
  - `GET /list/<pubkey>` - List user's blobs
  - `DELETE /<sha256>` - Delete blob by hash with ownership verification

- **Blossom authentication** - Support for kind 24242 authorization events
  - `/src/auth/blossom.mjs` - Blossom auth verification with NIP-98 fallback
  - Event validation for method, URL, and expiration
  - Compatible with existing NIP-98 authentication

- **Comprehensive test coverage** - 42 new tests for Blossom functionality
  - Blob retrieval, upload, listing, and deletion tests
  - Authentication and authorization tests
  - Edge case and error handling tests
  - Integration tests with existing video infrastructure

### Technical Implementation
- **Dual protocol support** - Maintains existing `/v1/*` video API while adding Blossom endpoints
- **SHA-256 addressing** - Leverages existing `idx:sha256` KV indexing for content addressing
- **Ownership enforcement** - Uses existing pubkey-based ownership for blob operations
- **Stream integration** - Blossom blob retrieval redirects to Cloudflare Stream URLs
- **Mock mode support** - Works with existing `MOCK_STREAM_API` for testing

### Blossom Protocol Features
- **Content-addressable storage** - Files identified by SHA-256 hash
- **Nostr authentication** - Uses Nostr public/private keys for identity
- **Multi-server compatibility** - Clients can query multiple Blossom servers
- **File extension support** - Handles URLs like `/<hash>.mp4`
- **Ownership verification** - Only file owners can delete their blobs

### API Compatibility
- **Backward compatible** - All existing video service endpoints unchanged
- **Authentication interop** - Supports both NIP-98 and Blossom auth methods
- **Response format** - Blossom endpoints return spec-compliant responses
- **Error handling** - Proper HTTP status codes and error messages

### Files Added
- `/src/handlers/blossom.mjs` - Core Blossom protocol handlers
- `/src/auth/blossom.mjs` - Blossom authentication and event templates
- `/tests/blossom.test.mjs` - Comprehensive Blossom handler tests
- `/tests/blossom_auth.test.mjs` - Authentication and authorization tests

## [2025-08-22] - Major Updates

### Added
- **Automatic MP4 download enabling** during video migration
  - Videos migrated to Cloudflare Stream now automatically have MP4 downloads enabled
  - Added 15-second wait after Stream copy API to ensure video is fully processed
  - Download status included in migration response
  
- **Enable downloads endpoints** for existing videos
  - `POST /v1/enable-downloads/{uid}` - Enable downloads for a single video
  - `POST /v1/enable-downloads-batch` - Enable downloads for multiple videos
  
- **CDN proxy worker** with MP4 download support
  - Supports both inline playback and forced downloads
  - Add `?download=true` to force browser download
  - Proper Content-Disposition and Content-Type headers
  - CORS headers for cross-origin access

- **Comprehensive documentation**
  - MP4_DOWNLOAD_GUIDE.md - Complete guide for MP4 downloads
  - COMPLETE_MIGRATION_REPUBLISH_GUIDE.md - Full migration and Nostr republishing guide
  - NOSTR_VIDEO_KINDS_EXPLAINED.md - Nostr kind 32222 event documentation
  - NOSTRVINE_KIND_32222_MIGRATION.md - Replaceable event migration guide
  - HLS_EXPLAINED.md - HLS streaming documentation

### Fixed
- **KV storage namespace** - Fixed from `env.UPLOADS` to `env.MEDIA_KV`
- **CDN proxy 500 errors** - Fixed request header and body handling
- **OpenVine URL format** - Corrected to use `api.openvine.co/media/{id}` instead of non-existent cdn.openvine.co
- **Stream subdomain** - Updated to correct customer subdomain
- **MP4 downloads returning 404** - Added `downloadable: true` flag and separate enable downloads API call
- **Nostr event kinds** - Corrected all documentation to use kind 32222 (custom replaceable) instead of incorrect kinds

### Changed
- **Migration flow** simplified to use Stream copy API directly (more reliable than direct upload)
- **Download enabling** requires 15-second wait after video copy for Stream processing
- **Nostr event structure** updated to use kind 32222 with d-tags for replaceable events
- **Environment variables** added CLOUDFLARE_ACCOUNT_ID for consistency

### Technical Details
- Cloudflare Stream requires explicit POST to `/downloads` endpoint after video creation
- Stream needs 10-15 seconds after copy API returns before accepting download requests
- Kind 32222 events use d-tags to make them replaceable without creating duplicates
- All migrations now include downloadable flag and automatic download enabling

### Migration Notes
- Existing videos (150k) migrated before this update need manual download enabling
- Use batch endpoint to enable downloads for existing videos
- New migrations automatically have downloads enabled
- MP4 files take ~30 seconds to be ready after enabling

### API Changes
- Migration response now includes `downloadStatus` field
- All Stream URLs use custom domain `cdn.divine.video`
- R2 URLs use custom domain `r2.divine.video`

### Known Issues
- Videos migrated before this update don't have MP4 downloads enabled
- Need to run batch job or re-migrate to enable downloads for existing videos

### Testing
- Verified MP4 downloads work after 15-second wait
- Tested with multiple video IDs
- Confirmed HLS streaming continues to work
- Validated Nostr event structure with kind 32222