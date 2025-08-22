# Changelog

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