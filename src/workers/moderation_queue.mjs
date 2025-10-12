// ABOUTME: Cloudflare Queue consumer for video content moderation
// ABOUTME: Integrates ProofMode verification, Sightengine AI detection, and generates NIP-1985 reports

/**
 * Queue Consumer Worker for Video Moderation
 * Triggered when videos are uploaded and need content analysis
 */
export default {
  async queue(batch, env) {
    console.log(`📋 Moderation Queue: Processing batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      try {
        await processModerationMessage(message.body, env);
        message.ack();
      } catch (error) {
        console.error('❌ Moderation failed:', error);

        // Retry logic
        if (message.attempts < 3) {
          console.log(`🔄 Retrying moderation (attempt ${message.attempts + 1}/3)`);
          message.retry();
        } else {
          console.error('❌ Max retries exceeded, acknowledging message');
          await logFailedModeration(message.body.sha256, error, env);
          message.ack();
        }
      }
    }
  }
};

/**
 * Process a single moderation message
 */
async function processModerationMessage(messageBody, env) {
  const { sha256, r2Key, uploadedBy, uploadedAt, metadata } = messageBody;

  console.log(`🔍 Moderating video: ${sha256}`);

  // Step 1: Check ProofMode verification status
  const proofModeResult = await checkProofModeStatus(sha256, env);
  console.log(`🔐 ProofMode status: ${proofModeResult.verified ? proofModeResult.level : 'unverified'}`);

  // Step 2: Call Sightengine API for content analysis
  const cdnDomain = env.STREAM_DOMAIN || env.CDN_DOMAIN || 'cdn.divine.video';
  const videoUrl = `https://${cdnDomain}/${sha256}.mp4`;

  const sightengineResult = await analyzeSightengine(videoUrl, env);

  if (sightengineResult.error) {
    console.error('❌ Sightengine analysis failed:', sightengineResult.error);
    throw new Error(`Sightengine failed: ${sightengineResult.error}`);
  }

  // Step 3: Classify content based on scores and ProofMode status
  const classification = classifyContent(sightengineResult.scores, proofModeResult);
  console.log(`📊 Classification: ${classification.action} (${classification.reason})`);

  // Step 4: Generate NIP-1985 report structure (don't publish yet)
  const report = generateNIP1985Report(sha256, classification, sightengineResult, proofModeResult);

  // Step 5: Update KV with moderation results
  await storeModerationResult(sha256, classification, sightengineResult, proofModeResult, report, env);

  // Step 6: Take action based on classification
  await handleModerationAction(sha256, classification, env);

  console.log(`✅ Moderation complete for ${sha256}: ${classification.action}`);
}

/**
 * Check ProofMode verification status from KV
 */
async function checkProofModeStatus(sha256, env) {
  try {
    const proofModeData = await env.MODERATION_KV?.get(`proofmode:${sha256}`);

    if (!proofModeData) {
      return {
        verified: false,
        level: 'unverified',
        reason: 'No ProofMode data found'
      };
    }

    const data = JSON.parse(proofModeData);
    return {
      verified: data.verified === true,
      level: data.level || 'unverified',
      timestamp: data.timestamp,
      deviceFingerprint: data.deviceFingerprint
    };
  } catch (error) {
    console.error('Error checking ProofMode:', error);
    return {
      verified: false,
      level: 'unverified',
      error: error.message
    };
  }
}

/**
 * Call Sightengine API for content moderation
 */
async function analyzeSightengine(videoUrl, env) {
  if (!env.SIGHTENGINE_USER || !env.SIGHTENGINE_SECRET) {
    console.warn('⚠️ Sightengine credentials not configured, skipping analysis');
    return {
      error: 'sightengine_not_configured',
      scores: {
        nudity: 0,
        violence: 0,
        ai_generated: 0,
        drugs: 0,
        offensive: 0
      }
    };
  }

  try {
    // Verify video exists before sending to Sightengine
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    if (!headResponse.ok) {
      return { error: 'video_not_found', message: `Video not accessible at ${videoUrl}` };
    }

    console.log(`🌐 Calling Sightengine for: ${videoUrl}`);

    const response = await fetch('https://api.sightengine.com/1.0/video/check.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'url': videoUrl,
        'models': 'nudity,violence,extremism,drugs,offensive,ai-generated',
        'api_user': env.SIGHTENGINE_USER,
        'api_secret': env.SIGHTENGINE_SECRET
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: 'sightengine_api_error', message: errorText };
    }

    const result = await response.json();

    // Parse scores from Sightengine response
    const scores = parseSightengineScores(result);

    return {
      success: true,
      scores,
      rawResult: result,
      flaggedFrames: extractFlaggedFrames(result)
    };

  } catch (error) {
    console.error('Sightengine API error:', error);
    return {
      error: 'sightengine_exception',
      message: error.message
    };
  }
}

/**
 * Parse Sightengine API response to extract max scores
 */
function parseSightengineScores(result) {
  const frames = result.data?.frames || [];

  if (frames.length === 0) {
    console.warn('⚠️ No frames in Sightengine response');
    return {
      nudity: 0,
      violence: 0,
      ai_generated: 0,
      drugs: 0,
      offensive: 0,
      extremism: 0
    };
  }

  // Extract maximum score across all frames for each category
  const scores = {
    nudity: Math.max(...frames.map(f => f.nudity?.prob || 0)),
    violence: Math.max(...frames.map(f => f.violence?.prob || 0)),
    ai_generated: Math.max(...frames.map(f => f.ai_generated?.prob || 0)),
    drugs: Math.max(...frames.map(f => f.drugs?.prob || 0)),
    offensive: Math.max(...frames.map(f => f.offensive?.prob || 0)),
    extremism: Math.max(...frames.map(f => f.extremism?.prob || 0))
  };

  return scores;
}

/**
 * Extract frames that triggered flags
 */
function extractFlaggedFrames(result) {
  const frames = result.data?.frames || [];
  const flagged = [];

  frames.forEach((frame, index) => {
    const frameFlags = [];

    if ((frame.nudity?.prob || 0) > 0.7) frameFlags.push('nudity');
    if ((frame.violence?.prob || 0) > 0.7) frameFlags.push('violence');
    if ((frame.ai_generated?.prob || 0) > 0.7) frameFlags.push('ai_generated');
    if ((frame.drugs?.prob || 0) > 0.7) frameFlags.push('drugs');
    if ((frame.offensive?.prob || 0) > 0.7) frameFlags.push('offensive');

    if (frameFlags.length > 0) {
      flagged.push({
        index,
        timestamp: frame.time || index,
        flags: frameFlags,
        scores: {
          nudity: frame.nudity?.prob || 0,
          violence: frame.violence?.prob || 0,
          ai_generated: frame.ai_generated?.prob || 0
        }
      });
    }
  });

  return flagged;
}

/**
 * Classify content based on Sightengine scores and ProofMode status
 *
 * Categories:
 * - BLOCKED: CSAM/illegal content
 * - AUTH_REQUIRED (adult): High nudity/violence scores
 * - AUTH_REQUIRED (ai_likely): No ProofMode OR high AI score
 * - SAFE: All checks pass with ProofMode
 * - REVIEW: Borderline scores
 */
function classifyContent(scores, proofModeResult) {
  // BLOCKED: Illegal content (CSAM detection would go here)
  // Note: Sightengine doesn't have a direct CSAM score - this would come from specialized services
  if (scores.extremism > 0.9) {
    return {
      action: 'BLOCKED',
      reason: 'illegal',
      severity: 'critical',
      labels: ['illegal-content', 'extremism']
    };
  }

  // AUTH_REQUIRED: High adult content scores
  if (scores.nudity > 0.9 || scores.violence > 0.9) {
    return {
      action: 'AUTH_REQUIRED',
      reason: 'adult',
      severity: 'high',
      labels: ['adult', scores.nudity > 0.9 ? 'nudity' : 'violence']
    };
  }

  // AUTH_REQUIRED: AI-likely content
  // Triggered if: No ProofMode verification OR high AI-generated score
  if (!proofModeResult.verified || scores.ai_generated > 0.7) {
    return {
      action: 'AUTH_REQUIRED',
      reason: 'ai_likely',
      severity: 'medium',
      labels: ['ai-generated', 'unverified'],
      proofModeStatus: proofModeResult.level
    };
  }

  // REVIEW: Borderline adult content scores
  if (scores.nudity > 0.7 || scores.violence > 0.7 || scores.drugs > 0.7) {
    return {
      action: 'REVIEW',
      reason: 'borderline',
      severity: 'medium',
      labels: ['pending-review'],
      borderlineScores: {
        nudity: scores.nudity,
        violence: scores.violence,
        drugs: scores.drugs
      }
    };
  }

  // SAFE: All checks pass with ProofMode verification
  return {
    action: 'SAFE',
    reason: 'verified',
    severity: 'none',
    labels: ['safe'],
    proofModeStatus: proofModeResult.level
  };
}

/**
 * Generate NIP-1985 moderation report structure
 * (Structure only - not published to relays yet)
 */
function generateNIP1985Report(sha256, classification, sightengineResult, proofModeResult) {
  const report = {
    kind: 1985,
    created_at: Math.floor(Date.now() / 1000),
    content: generateReportContent(classification, sightengineResult),
    tags: [
      // Event being reported (would need original event ID)
      // ["e", "{original_video_event_id}", "{relay_url}", "root"],

      // NIP-32 Content Labels
      ["L", "content-warning"],
      ...classification.labels.map(label => ["l", label, "content-warning"]),

      // Additional context
      ["summary", generateSummary(classification, sightengineResult)],
      ["confidence", determineConfidence(sightengineResult.scores)],
      ["action", classification.action.toLowerCase()],

      // ProofMode context
      ["proofmode-verified", proofModeResult.verified.toString()],
      ["proofmode-level", proofModeResult.level]
    ]
  };

  // Add AI-specific tags if relevant
  if (classification.reason === 'ai_likely') {
    report.tags.push(["ai-score", sightengineResult.scores.ai_generated.toFixed(2)]);
  }

  return report;
}

/**
 * Generate human-readable report content
 */
function generateReportContent(classification, sightengineResult) {
  const { reason, severity } = classification;
  const { scores } = sightengineResult;

  switch (reason) {
    case 'adult':
      return `Content flagged as adult material. Nudity: ${(scores.nudity * 100).toFixed(1)}%, Violence: ${(scores.violence * 100).toFixed(1)}%`;

    case 'ai_likely':
      return `Content likely AI-generated or unverified. AI score: ${(scores.ai_generated * 100).toFixed(1)}%, ProofMode verification not found.`;

    case 'illegal':
      return `Content blocked due to illegal material detection. Severity: ${severity}`;

    case 'borderline':
      return `Content flagged for manual review. Scores exceed review thresholds.`;

    case 'verified':
      return `Content passed all moderation checks with ProofMode verification.`;

    default:
      return `Content moderation result: ${reason}`;
  }
}

/**
 * Generate summary for report
 */
function generateSummary(classification, sightengineResult) {
  const scores = sightengineResult.scores;
  const highScores = Object.entries(scores)
    .filter(([_, value]) => value > 0.6)
    .map(([key, value]) => `${key}: ${(value * 100).toFixed(1)}%`)
    .join(', ');

  return `Automated moderation: ${classification.action} (${classification.reason}). ${highScores || 'No significant flags'}`;
}

/**
 * Determine confidence level for report
 */
function determineConfidence(scores) {
  const maxScore = Math.max(...Object.values(scores));

  if (maxScore > 0.9) return 'high';
  if (maxScore > 0.7) return 'medium';
  return 'low';
}

/**
 * Store moderation result in KV
 */
async function storeModerationResult(sha256, classification, sightengineResult, proofModeResult, report, env) {
  if (!env.MODERATION_KV) {
    console.warn('⚠️ MODERATION_KV not configured');
    return;
  }

  // Main moderation record
  const moderationData = {
    action: classification.action,
    reason: classification.reason,
    severity: classification.severity,
    labels: classification.labels,
    scores: sightengineResult.scores,
    proofmode: {
      verified: proofModeResult.verified,
      level: proofModeResult.level
    },
    flaggedFrames: sightengineResult.flaggedFrames || [],
    processedAt: Date.now(),
    reportEventId: null // Would be set after publishing to Nostr
  };

  await env.MODERATION_KV.put(
    `moderation:${sha256}`,
    JSON.stringify(moderationData)
  );

  // Store auth_required entries
  if (classification.action === 'AUTH_REQUIRED') {
    const authRequiredData = {
      reason: classification.reason, // 'adult' or 'ai_likely'
      labels: classification.labels,
      requiresPreference: classification.reason === 'adult' ? 'show_adult_content' : 'show_ai_content',
      timestamp: Date.now(),
      proofModeStatus: proofModeResult.level
    };

    await env.MODERATION_KV.put(
      `auth_required:${sha256}`,
      JSON.stringify(authRequiredData)
    );
  }

  // Store NIP-1985 report structure (for later publishing)
  await env.MODERATION_KV.put(
    `report:${sha256}`,
    JSON.stringify(report)
  );

  console.log(`💾 Stored moderation result for ${sha256}`);
}

/**
 * Handle moderation action
 */
async function handleModerationAction(sha256, classification, env) {
  switch (classification.action) {
    case 'BLOCKED':
      // Quarantine the content
      const { blockContent } = await import('../utils/content_blocking.mjs');
      await blockContent(sha256, env, {
        reason: `Automated moderation: ${classification.reason}`,
        category: classification.reason,
        severity: classification.severity,
        blockedBy: 'moderation_worker',
        appealable: false
      });
      console.log(`🚫 Blocked content: ${sha256}`);
      break;

    case 'AUTH_REQUIRED':
      // Content requires authentication/preference check
      console.log(`🔒 Auth required for ${sha256}: ${classification.reason}`);
      // WAF rules would be updated here in production
      break;

    case 'REVIEW':
      // Flag for manual review
      await env.MODERATION_KV?.put(
        `review:${sha256}`,
        JSON.stringify({
          status: 'pending_review',
          timestamp: Date.now(),
          classification
        })
      );
      console.log(`👀 Flagged for review: ${sha256}`);
      break;

    case 'SAFE':
      // No action needed
      console.log(`✅ Content safe: ${sha256}`);
      break;
  }
}

/**
 * Log failed moderation for debugging
 */
async function logFailedModeration(sha256, error, env) {
  try {
    await env.MODERATION_KV?.put(
      `failed:${sha256}`,
      JSON.stringify({
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
      }),
      { expirationTtl: 86400 } // Keep for 24 hours
    );
  } catch (err) {
    console.error('Failed to log moderation failure:', err);
  }
}
