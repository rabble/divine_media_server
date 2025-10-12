# OpenVine CDN Migration & Moderation System Spec

## Executive Summary

This spec outlines the migration from custom Blossom implementation to the standards-based blossom-sdk-worker, combined with a comprehensive content moderation system for the OpenVine (Vine relaunch) platform. The system must handle viral scale (potential millions of users from Jack Dorsey announcement), enforce legal compliance (CSAM blocking), support composable moderation, and validate ProofMode authenticity proofs.

## Project Context

- **Platform**: OpenVine - Vine relaunch on Nostr
- **Current State**: Custom Blossom implementation working, pre-launch with beta testers
- **Scale Expectations**: Unknown (dozens to millions of users)
- **Critical Dependencies**: Jack Dorsey tweet announcement when ready
- **Content**: ~100k pre-published old Vines + new user uploads
- **Clients**: Flutter mobile app, React web app

## Goals

1. **Standards Compliance**: Migrate to blossom-sdk-worker for maintainability and bug fixes
2. **Video Streaming**: Support HTTP range requests for video seeking/streaming
3. **Content Moderation**: Block illegal content (CSAM), require auth for adult content
4. **Authenticity**: Validate ProofMode cryptographic proofs, flag likely AI content
5. **Composable Moderation**: Support Nostr NIP-1985 reports for client-side filtering
6. **Scale & Performance**: Leverage Cloudflare CDN, minimize worker costs at viral scale
7. **Legal Compliance**: Fast blocking of harmful content, preservation for legal requirements

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Flutter/Web)                      │
│  - Uploads with ProofMode data                                  │
│  - Sets preferences: show_adult_content, show_ai_content        │
│  - Validates Nostr signatures on requests                       │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare WAF / Firewall                     │
│  - Blocklist: CSAM/illegal → 451 Unavailable                   │
│  - Redirect list: Adult/AI content → Worker for auth check     │
│  - Everything else → Public R2 CDN (fast path)                  │
└────────────────┬────────────────────────────────────────────────┘
                 │
         ┌───────┴────────┐
         │                │
         ▼                ▼
┌──────────────┐  ┌──────────────────────────────────────────────┐
│   R2 Bucket  │  │        SDK Worker (blossom-sdk-worker)       │
│   (Public)   │  │  - GET/HEAD: Range requests, ETags           │
│              │  │  - PUT: ProofMode validation, upload to R2   │
│              │  │  - DELETE: Ownership verification            │
│              │  │  - Auth endpoint: Nostr signature validation │
└──────────────┘  │  - Restricted content: Auth + R2 proxy       │
                  └──────────┬───────────────────────────────────┘
                             │
                             │ Queue message
                             ▼
                  ┌────────────────────────────┐
                  │   Cloudflare Queue          │
                  │   (video-moderation-queue)  │
                  └──────────┬─────────────────┘
                             │
                             ▼
                  ┌────────────────────────────────────────────┐
                  │      Moderation Worker (Queue Consumer)    │
                  │  1. Check ProofMode presence/validation    │
                  │  2. Extract frames from video              │
                  │  3. Call Sightengine API                   │
                  │  4. Classify: BLOCKED / AUTH_REQUIRED / SAFE│
                  │  5. Generate NIP-1985 report (NIP-32 labels)│
                  │  6. Update KV + WAF rules via API          │
                  └──────────┬─────────────────────────────────┘
                             │
                             ▼
                  ┌────────────────────────────┐
                  │    Moderation KV Store     │
                  │  - moderation:{sha256}     │
                  │  - quarantine:{sha256}     │
                  │  - auth_required:{sha256}  │
                  │  - ai_likely:{sha256}      │
                  └────────────────────────────┘
                             ▲
                             │
                  ┌──────────┴─────────────────┐
                  │    Admin Dashboard         │
                  │  - Review flagged content  │
                  │  - View Sightengine scores │
                  │  - Approve/Block/Flag      │
                  │  - Publish NIP-1985 events │
                  │  - Update WAF rules        │
                  └────────────────────────────┘
```

## Feature Parity Requirements

### Missing Features from Original Implementation

Based on `blossom-sdk-worker/FEATURE_PARITY.md`:

#### 1. HTTP Range Requests (P0 - Critical)
**Requirement**: Video streaming with seek support
**Implementation**:
- Parse `Range` header: `bytes=start-end`
- Return 206 Partial Content with appropriate headers
- Support all range formats: `bytes=0-1023`, `bytes=1024-`, `bytes=-500`

```javascript
// In handleGetBlob()
const range = req.headers.get('range');
if (range && blob) {
  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : blob.size - 1;
  const chunksize = (end - start) + 1;

  return new Response(blob.body, {
    status: 206,
    headers: {
      'Content-Type': blob.type,
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize.toString(),
      'ETag': blob.etag || `"${sha256}"`
    }
  });
}
```

#### 2. ETag Headers (P1 - Important)
**Requirement**: Browser cache validation
**Implementation**: Return R2 object's ETag in all GET/HEAD responses

#### 3. Accept-Ranges Header (P1 - Important)
**Requirement**: Advertise range request support
**Implementation**: Include `Accept-Ranges: bytes` in HEAD responses

#### 4. R2 Custom Metadata (P2 - Nice to have)
**Requirement**: Self-describing objects for debugging
**Implementation**:
```javascript
customMetadata: {
  sha256: sha256,
  uploadedAt: new Date().toISOString(),
  owner: auth.pubkey,
  uid: uid,
  proofmode_verified: proofModeResult.verified
}
```

#### 5. File Extension Support (P2 - Nice to have)
**Requirement**: Better client compatibility
**Implementation**: Return URLs with appropriate extensions: `{sha256}.mp4`

## ProofMode Validation System

### What is ProofMode?

ProofMode provides cryptographic proof that videos were recorded by a real human on a real device without AI generation or manipulation. Critical for OpenVine's authenticity value proposition.

### Verification Levels

1. **verified_mobile** (Highest): Device attestation + manifest + PGP signature
2. **verified_web** (Medium): Manifest + PGP signature (no hardware attestation)
3. **basic_proof** (Low): Partial proof data present
4. **unverified** (None): No ProofMode data

### ProofMode Data Structure (in Nostr events)

```json
{
  "kind": 34236,
  "tags": [
    ["url", "https://cdn.divine.video/{sha256}.mp4"],
    ["m", "video/mp4"],
    ["x", "{sha256}"],
    ["size", "1048576"],

    // ProofMode tags
    ["proof-verification-level", "verified_mobile"],
    ["proof-manifest", "{base64_encoded_manifest}"],
    ["proof-device-attestation", "{base64_attestation_token}"],
    ["proof-pgp-fingerprint", "{fingerprint}"],
    ["proof-pgp-signature", "{signature}"]
  ]
}
```

### Server-Side Validation Requirements

**On Upload (PUT /upload):**

1. **Extract ProofMode data from request headers or multipart form**
   - `X-ProofMode-Manifest`: Base64-encoded JSON manifest
   - `X-ProofMode-Attestation`: Base64-encoded device attestation token
   - `X-ProofMode-Signature`: PGP signature of manifest

2. **Validate PGP Signature**
   - Parse manifest JSON
   - Verify signature matches manifest content
   - Check fingerprint against known/trusted keys (optional)

3. **Validate Device Attestation (if present)**
   - Verify attestation token with Apple DeviceCheck or Android SafetyNet
   - Check challenge nonce (prevent replay attacks)
   - Confirm device is legitimate hardware

4. **Validate Manifest Contents**
   - Check frame hashes are present (proves frames were captured)
   - Verify session data is complete
   - Confirm video hash in manifest matches uploaded file SHA256

5. **Store Validation Result**
   - Write to KV: `proofmode:{sha256}` → verification level
   - Include in R2 custom metadata
   - Return in upload response

**Validation Response:**

```json
{
  "sha256": "abc123...",
  "url": "https://cdn.divine.video/abc123.mp4",
  "proofmode": {
    "verified": true,
    "level": "verified_mobile",
    "device_fingerprint": "...",
    "timestamp": 1704067200000
  }
}
```

### Implementation Notes

- Use `openpgpjs` or similar for PGP validation
- Device attestation validation requires platform-specific APIs
- Invalid ProofMode doesn't block upload - just marks as unverified
- Store verification result for moderation pipeline

## Content Moderation System

### Moderation Categories

| Category | Trigger Conditions | Server Action | User Experience |
|----------|-------------------|---------------|-----------------|
| **BLOCKED** | Sightengine CSAM detected OR manual admin block | 451 Unavailable (WAF) | "Content unavailable due to legal compliance" |
| **ADULT** | Sightengine nudity >0.9 OR violence >0.9 | Auth required (preference check) | "Adult content - click to view" (if opted in) |
| **AI_LIKELY** | No ProofMode OR Sightengine AI >0.7 | Auth required (preference check) | "Likely AI-generated - click to view" |
| **SAFE** | All checks pass | Public CDN serve | Normal viewing |
| **REVIEW** | Borderline scores (0.7-0.9) | Queue for human review | Treated as SAFE until reviewed |

### Moderation Flow

```
Upload → R2 Storage → Queue Message → Moderation Worker
                                            │
                                            ├─ Check ProofMode (KV lookup)
                                            ├─ Extract 10 frames from video
                                            ├─ Call Sightengine API
                                            ├─ Classify content
                                            ├─ Generate NIP-1985 report
                                            ├─ Write to KV
                                            └─ Update WAF rules via API
```

### Sightengine Integration

**API Call:**
```javascript
const response = await fetch('https://api.sightengine.com/1.0/video/check.json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    'url': `https://cdn.divine.video/${sha256}.mp4`,
    'models': 'nudity,violence,extremism,drugs,offensive,ai-generated',
    'api_user': env.SIGHTENGINE_USER,
    'api_secret': env.SIGHTENGINE_SECRET
  })
});
```

**Response Processing:**
```javascript
const result = await response.json();
const classification = {
  nudity: Math.max(...result.frames.map(f => f.nudity?.score || 0)),
  violence: Math.max(...result.frames.map(f => f.violence?.score || 0)),
  ai_generated: Math.max(...result.frames.map(f => f.ai_generated?.score || 0)),
  // ... other scores
};
```

### Classification Logic

```javascript
function classifyContent(sightengineScores, proofModeVerified) {
  // BLOCKED: Illegal content
  if (sightengineScores.csam > 0.5) {
    return { action: 'BLOCKED', reason: 'illegal', severity: 'critical' };
  }

  // ADULT: High adult content scores
  if (sightengineScores.nudity > 0.9 || sightengineScores.violence > 0.9) {
    return { action: 'AUTH_REQUIRED', reason: 'adult', severity: 'high' };
  }

  // AI_LIKELY: No ProofMode or high AI score
  if (!proofModeVerified || sightengineScores.ai_generated > 0.7) {
    return { action: 'AUTH_REQUIRED', reason: 'ai_likely', severity: 'medium' };
  }

  // REVIEW: Borderline scores
  if (sightengineScores.nudity > 0.7 || sightengineScores.violence > 0.7) {
    return { action: 'REVIEW', reason: 'borderline', severity: 'medium' };
  }

  // SAFE: All checks pass
  return { action: 'SAFE', reason: 'verified', severity: 'none' };
}
```

### KV Storage Schema

**Key: `moderation:{sha256}`**
```json
{
  "action": "BLOCKED|AUTH_REQUIRED|SAFE|REVIEW",
  "reason": "illegal|adult|ai_likely|spam|verified",
  "severity": "critical|high|medium|low|none",
  "labels": ["adult", "nudity"],  // NIP-32 labels
  "scores": {
    "nudity": 0.92,
    "violence": 0.05,
    "ai_generated": 0.15
  },
  "proofmode": {
    "verified": false,
    "level": "unverified"
  },
  "flaggedFrames": [
    { "index": 5, "timestamp": 2.5, "nudity": 0.92 }
  ],
  "processedAt": 1704067200000,
  "reportEventId": "nostr:event:..." // NIP-1985 event
}
```

**Key: `quarantine:{sha256}`** (only for BLOCKED)
```json
{
  "reason": "CSAM detected",
  "timestamp": 1704067200000,
  "severity": "critical",
  "preserved": true  // Content preserved for legal compliance
}
```

**Key: `auth_required:{sha256}`** (for ADULT/AI_LIKELY)
```json
{
  "reason": "adult|ai_likely",
  "labels": ["adult", "nudity"],
  "requiresPreference": "show_adult_content|show_ai_content",
  "timestamp": 1704067200000
}
```

### NIP-1985 Moderation Reports

**Event Structure (Kind 1985):**
```json
{
  "kind": 1985,
  "pubkey": "{moderator_server_pubkey}",
  "created_at": 1704067200,
  "content": "Content flagged as adult material",
  "tags": [
    ["e", "{original_video_event_id}", "{relay_url}", "root"],
    ["p", "{uploader_pubkey}"],

    // NIP-32 Content Labels
    ["L", "content-warning"],
    ["l", "adult", "content-warning"],
    ["l", "nudity", "content-warning"],

    // Additional context
    ["summary", "High nudity score (0.92) detected by automated moderation"],
    ["confidence", "high"],
    ["action", "auth-required"]
  ],
  "sig": "..."
}
```

### WAF Integration

**Updating WAF Rules via Cloudflare API:**

```javascript
async function updateWAFRules(sha256, action, env) {
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  if (action === 'BLOCKED') {
    // Add to blocklist - return 451
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/firewall/rules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: {
          expression: `(http.request.uri.path contains "/${sha256}")`
        },
        action: 'block',
        description: `Block ${sha256} - CSAM/illegal content`
      })
    });
  } else if (action === 'AUTH_REQUIRED') {
    // Add to redirect list - send to worker
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/http_request_transform/entrypoint/rules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expression: `(http.request.uri.path contains "/${sha256}")`,
        action: 'route',
        action_parameters: {
          uri: {
            path: {
              value: `/restricted/${sha256}`
            }
          }
        },
        description: `Redirect ${sha256} - auth required`
      })
    });
  }
}
```

**WAF Rule Batching:**
- Update WAF rules in batches (every 5 minutes or 100 new flags)
- Avoids API rate limits
- Reduces latency for moderation actions

## User Authentication & Preferences

### Nostr Authentication

**Request Headers:**
```
Authorization: Nostr {base64_event}
```

**Event Structure (NIP-98 HTTP Auth):**
```json
{
  "kind": 27235,
  "created_at": 1704067200,
  "tags": [
    ["u", "https://cdn.divine.video/{sha256}.mp4"],
    ["method", "GET"]
  ],
  "content": "",
  "pubkey": "{user_pubkey}",
  "sig": "{signature}"
}
```

**Validation:**
1. Parse Authorization header
2. Verify event signature
3. Check event timestamp (must be within 60 seconds)
4. Verify URL matches request URL
5. Extract pubkey

### User Preferences (NIP-78 Application Data)

**Event Structure (Kind 30078):**
```json
{
  "kind": 30078,
  "pubkey": "{user_pubkey}",
  "tags": [
    ["d", "openvine/preferences"],
    ["show_adult_content", "true"],
    ["show_ai_content", "false"],
    ["adult_verified", "true"],  // Self-declared over 18
    ["adult_verified_at", "1704067200"]
  ],
  "content": "",
  "created_at": 1704067200,
  "sig": "..."
}
```

**Worker Preference Lookup:**
1. Extract pubkey from auth event
2. Query relay for user's preference event (kind 30078, d-tag: "openvine/preferences")
3. Parse preference tags
4. Cache in KV: `user_prefs:{pubkey}` (TTL: 1 hour)

### Restricted Content Serving

**Endpoint: `/restricted/{sha256}`**

**Flow:**
1. Parse Nostr auth header → validate signature → extract pubkey
2. Check KV: `auth_required:{sha256}` → determine required preference
3. Lookup user preferences (KV cache or relay query)
4. Verify user has required preference enabled:
   - `show_adult_content: true` for adult content
   - `show_ai_content: true` for AI-likely content
5. If authorized: Proxy from R2, return 200 with video
6. If not authorized: Return 403 with metadata

**Response (403 Forbidden):**
```json
{
  "error": "content_restricted",
  "content_flags": ["adult", "nudity"],
  "required_preference": "show_adult_content",
  "message": "This content is flagged as adult material and requires preference enabled",
  "report_event_id": "nostr:event:...",
  "enable_instructions": "Set show_adult_content:true in your profile (kind 30078)"
}
```

**Response (200 OK - Authorized):**
- Serve video from R2
- Include headers: `X-Content-Warning: adult`, `X-Report-Event: {event_id}`
- Support range requests

## Admin Dashboard

### Requirements

**View Flagged Content:**
- List videos pending review (action: REVIEW)
- Display thumbnail (extracted first frame)
- Show Sightengine scores
- Display ProofMode verification status
- Show uploader pubkey

**Take Actions:**
1. **Approve** → Mark as SAFE, remove from review queue
2. **Block** → Mark as BLOCKED, update WAF, publish 1985 report
3. **Flag as Adult** → Mark as AUTH_REQUIRED (adult), update WAF, publish report
4. **Flag as AI** → Mark as AUTH_REQUIRED (ai_likely), update WAF, publish report

**Publish NIP-1985 Reports:**
- Generate event with NIP-32 labels
- Sign with server's moderation key
- Publish to configured relays
- Store event ID in KV

**Admin API Endpoints:**

```
GET  /admin/review/pending → List pending reviews
GET  /admin/review/{sha256} → Get full moderation data + video
POST /admin/review/{sha256}/approve → Mark as safe
POST /admin/review/{sha256}/block → Block content
POST /admin/review/{sha256}/flag → Flag as adult/AI
GET  /admin/stats → Moderation statistics
```

**Authentication:**
- Admin API key in header: `X-Admin-Token: {token}`
- Nostr event signed by admin pubkey

### Dashboard UI (Basic HTML)

Simple HTML page served by worker:
- Table of flagged videos
- Thumbnail preview (via `<video>` tag with first frame)
- Scores display
- Action buttons
- No fancy framework needed - vanilla HTML/JS

## Deployment Architecture

### Cloudflare Workers

**1. SDK Worker (Main CDN)**
- **Routes**: `cdn.divine.video/*`
- **Functions**:
  - GET/HEAD: Serve content with range requests
  - PUT: Upload with ProofMode validation
  - DELETE: Remove content (ownership check)
  - POST /restricted/{sha256}: Auth-required content
- **Bindings**:
  - R2: `nostrvine-media` (public bucket)
  - KV: `MODERATION_KV`, `METADATA_KV`
  - Queue Producer: `MODERATION_QUEUE`

**2. Moderation Worker (Queue Consumer)**
- **Trigger**: Cloudflare Queue messages
- **Functions**:
  - Frame extraction
  - Sightengine API calls
  - Classification logic
  - KV writes
  - WAF API updates
  - NIP-1985 publishing
- **Bindings**:
  - R2: `nostrvine-media` (read)
  - KV: `MODERATION_KV`
  - Queue Consumer: `video-moderation-queue`

**3. Admin Dashboard Worker**
- **Routes**: `admin.divine.video/*`
- **Functions**:
  - List pending reviews
  - Display moderation data
  - Action handlers (approve/block/flag)
  - NIP-1985 event generation
- **Bindings**:
  - KV: `MODERATION_KV`
  - R2: `nostrvine-media` (read)

### Cloudflare Resources

**R2 Buckets:**
1. `nostrvine-media` - Main public bucket for all videos
2. `evidence-preservation` - Quarantined content (legal compliance)

**KV Namespaces:**
1. `MODERATION_KV` - Moderation results, quarantine flags
2. `METADATA_KV` - Blob metadata (existing from blossom-sdk-worker)
3. `USER_PREFS_CACHE` - Cached user preferences

**Queues:**
1. `video-moderation-queue` - Upload → Moderation worker

**WAF/Firewall:**
1. Blocklist ruleset - CSAM/illegal content
2. Redirect ruleset - Auth-required content

### Environment Variables

```toml
# wrangler.toml (SDK Worker)
[env.production.vars]
CDN_DOMAIN = "cdn.divine.video"
R2_DOMAIN = "r2.divine.video"
CONTENT_MODERATION_ENABLED = "true"
PROOFMODE_VALIDATION_ENABLED = "true"
ADMIN_PUBKEY = "{nostr_pubkey}"

# Secrets (wrangler secret put)
SIGHTENGINE_USER
SIGHTENGINE_SECRET
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ZONE_ID
MODERATION_ADMIN_TOKEN
NOSTR_MODERATION_NSEC  # For signing 1985 reports
```

## Migration Plan

### Phase 1: SDK Worker Feature Parity (Week 1)

**Tasks:**
1. Add HTTP range request support to blossom-sdk-worker
2. Add ETag and Accept-Ranges headers
3. Add R2 custom metadata
4. Add file extension support in URLs
5. Test video streaming with Flutter client
6. Deploy to staging environment

**Testing:**
- Video seek/scrubbing works in Flutter/web clients
- Range requests handle all formats correctly
- ETags enable browser caching
- All existing tests pass

### Phase 2: ProofMode Validation (Week 1-2)

**Tasks:**
1. Add ProofMode validation library (openpgpjs)
2. Implement validation logic in PUT handler
3. Store verification results in KV
4. Update upload response with verification status
5. Test with verified and unverified uploads

**Testing:**
- Valid ProofMode uploads marked as verified
- Invalid/missing ProofMode marked as unverified
- Verification level stored correctly

### Phase 3: Moderation Pipeline (Week 2)

**Tasks:**
1. Update moderation worker to check ProofMode from KV
2. Add AI-likely classification logic
3. Implement NIP-1985 report generation (NIP-32 labels)
4. Add auth_required KV keys
5. Publish 1985 events to relays

**Testing:**
- ProofMode-verified content skips AI flags
- Unverified content flagged as ai_likely
- 1985 events published correctly
- KV keys written properly

### Phase 4: WAF Integration (Week 2-3)

**Tasks:**
1. Implement Cloudflare API integration for WAF rules
2. Add WAF update logic to moderation worker
3. Batch WAF updates (5 min interval)
4. Test blocklist (451 responses)
5. Test redirect to /restricted endpoint

**Testing:**
- Blocked content returns 451
- Auth-required content redirects to worker
- WAF rules update correctly
- Batch updates work

### Phase 5: Auth & Preferences (Week 3)

**Tasks:**
1. Implement Nostr auth validation (NIP-98)
2. Implement preference lookup (NIP-78)
3. Build /restricted/{sha256} endpoint
4. Add KV caching for user preferences
5. Test with Flutter/web clients

**Testing:**
- Valid auth signatures accepted
- Preferences fetched from relays
- Restricted content serves with correct preferences
- 403 returns helpful metadata

### Phase 6: Admin Dashboard (Week 3-4)

**Tasks:**
1. Build simple HTML dashboard UI
2. Implement review queue API
3. Add action handlers (approve/block/flag)
4. Add 1985 report publishing UI
5. Add WAF manual override controls

**Testing:**
- Can view pending reviews
- Actions update KV correctly
- 1985 events publish successfully
- WAF rules update from dashboard

### Phase 7: Public R2 CDN (Week 4)

**Tasks:**
1. Enable public access on R2 bucket
2. Configure custom domain for R2
3. Update WAF to route unrestricted traffic to R2 directly
4. Test performance improvements
5. Monitor cost reduction

**Testing:**
- Public content serves from R2 CDN directly
- Restricted content still routes through worker
- Performance improvement measurable
- Worker invocations reduced

### Phase 8: Beta Testing & Launch Prep (Week 4-5)

**Tasks:**
1. Full end-to-end testing with beta users
2. Load testing (simulate viral traffic)
3. Monitor Sightengine API performance
4. Tune classification thresholds
5. Document operational procedures
6. Prepare monitoring dashboards
7. Set up alerting for CSAM detections

**Testing:**
- Beta testers upload ProofMode videos
- Adult content filtering works
- AI content filtering works
- Performance acceptable under load
- Moderation actions work correctly

## Success Criteria

### Before Launch (Jack's Tweet)

- [ ] Video streaming works perfectly (range requests, seeking)
- [ ] ProofMode validation working on all uploads
- [ ] CSAM auto-blocked within 15 seconds of upload
- [ ] Adult content requires preference to view
- [ ] AI-likely content requires preference to view
- [ ] NIP-1985 reports publishing correctly
- [ ] Admin dashboard functional for manual review
- [ ] WAF blocklist and redirects working
- [ ] Beta testers can upload and view content
- [ ] No major bugs or performance issues
- [ ] Monitoring and alerting in place

### Post-Launch Success Metrics

- Video streaming works at scale (>1M requests/day)
- Moderation latency <15 seconds (upload to classification)
- False positive rate <5%
- CSAM detection rate 100% (with Sightengine)
- Worker costs stay under budget at viral scale
- Composable moderation adopted by clients

## Cost Estimates

### Cloudflare Workers

- **SDK Worker**: $0.50/million requests
- **At 1M requests/day**: ~$15/month
- **With R2 CDN (Phase 7)**: ~$1-2/month (only restricted content hits worker)

### Sightengine

- **Video moderation**: ~$0.003 per 6-second video
- **At 10k uploads/day**: ~$30/day = $900/month
- **At 100k uploads/day**: ~$300/day = $9k/month

### Cloudflare R2

- **Storage**: $0.015/GB/month
- **100k videos @ 5MB avg**: ~$7.50/month storage
- **Egress via CDN**: FREE (Cloudflare's bandwidth alliance)

### Total Monthly Costs (at scale)

| Scale | Storage | Sightengine | Workers | Total/Month |
|-------|---------|-------------|---------|-------------|
| 10k videos | $1 | $900 | $15 | ~$916 |
| 100k videos | $8 | $9,000 | $15 | ~$9,023 |
| 1M videos | $75 | $90,000 | $15 | ~$90,090 |

**Note**: With R2 public CDN (Phase 7), worker costs drop to ~$1-2/month regardless of traffic volume.

## Risks & Mitigations

### Risk 1: Viral Traffic Spike (Jack's Tweet)

**Impact**: Millions of requests in hours, potential service degradation

**Mitigation**:
- Use R2 public CDN for non-restricted content (scales infinitely)
- WAF-based routing (not worker logic) for performance
- Cloudflare's global CDN handles DDoS automatically
- Queue-based moderation (auto-scales)

### Risk 2: Sightengine API Rate Limits

**Impact**: Moderation backlog, delayed classifications

**Mitigation**:
- Implement exponential backoff and retries
- Monitor queue depth, alert if >1000
- Have backup API keys ready
- Consider secondary moderation service (AWS Rekognition)

### Risk 3: False Positives (Legit Content Blocked)

**Impact**: User frustration, bad press

**Mitigation**:
- Borderline scores go to human review (not auto-block)
- Appeals process in admin dashboard
- Transparency: users see 1985 reports explaining flags
- Lower thresholds initially, tune based on false positive rate

### Risk 4: ProofMode Bypass / Spoofing

**Impact**: AI-generated content appears verified

**Mitigation**:
- Strict PGP signature validation
- Device attestation verification with challenge nonces
- Manifest frame hashes must match video
- Gradual rollout of ProofMode requirement

### Risk 5: CSAM Detection Failure

**Impact**: Legal liability, platform shutdown

**Mitigation**:
- Use multiple detection signals (Sightengine + hash databases)
- Conservative thresholds (block on suspicion)
- Immediate preservation to evidence bucket
- Automated reporting workflow
- Legal compliance documentation

### Risk 6: WAF Rule Limits

**Impact**: Can't block all content, WAF rules max out

**Mitigation**:
- Cloudflare WAF supports 1000s of rules per zone
- Use IP sets / lists for scalability
- Implement rule expiration (remove old blocks)
- Fallback to KV-based blocking in worker if WAF full

## Open Questions & Decisions Needed

1. **Relay Selection**: Which Nostr relays should moderation reports be published to?
2. **ProofMode Strictness**: Should unverified content be rejected, or just flagged?
3. **Moderation Key**: Generate new Nostr keypair for server moderation, or use existing?
4. **Appeals Process**: How should users appeal false positives? Manual review? Automated?
5. **Regional Blocking**: Implement geo-IP blocking (e.g., Nazi content in Germany/France)?
6. **Retention Policy**: How long to keep quarantined content in evidence bucket?
7. **User Reporting**: Allow users to report content for review?
8. **Batch Processing**: Process old Vine videos through moderation retroactively?

## Next Steps

1. **Review this spec** - Rabble approves approach and priorities
2. **Create GitHub repo** - Initialize repo, commit spec
3. **Set up project structure** - Fork blossom-sdk-worker, create folders
4. **Begin Phase 1** - Start implementing range requests
5. **Daily standups** - Quick check-ins on progress
6. **Weekly demos** - Show working features to beta testers

## References

- **Blossom SDK**: https://github.com/hzrd149/blossom
- **NIP-32 (Labels)**: https://github.com/nostr-protocol/nips/blob/master/32.md
- **NIP-98 (HTTP Auth)**: https://github.com/nostr-protocol/nips/blob/master/98.md
- **NIP-1985 (Reports)**: https://github.com/nostr-protocol/nips/blob/master/1985.md
- **Sightengine API**: https://sightengine.com/docs/video-moderation
- **Cloudflare WAF API**: https://developers.cloudflare.com/api/operations/firewall-rules-create-firewall-rules

---

**Document Version**: 1.0
**Last Updated**: 2025-10-12
**Author**: Claude (with Rabble)
**Status**: Ready for Review
