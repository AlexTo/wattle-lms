# Issue #110 progress: adaptive-bitrate HLS via MediaConvert

Working notes for picking this back up on another machine. Full issue:
https://github.com/AlexTo/wattle-lms/issues/110

## Status

- **PR1 — done, pushed, not yet opened as a PR.** Branch `feat/content-item-status`.
- **PR2 — not started.** MediaConvert pipeline (infra + 2 Lambdas).
- **PR3 — not started.** hls.js player swap.

Ships as 3 separate PRs, each independently reviewable/buildable on the last.

## Scope decisions (confirmed, don't re-litigate these)

- **Student-portal viewer is explicitly out of scope.** Student-portal has no
  lesson-viewing route or player at all today — only instructor-portal has a
  preview player (`attach-lesson-video-dialog.tsx`). This work stays scoped
  to infra + the existing instructor-portal preview; student playback is a
  separate issue.
- No production data exists yet, so no migration/backfill concerns for any
  of the schema/key-format changes below.

## Key design decisions

1. **Two separate S3 buckets, not one bucket with prefixes.**
   - **`LessonMediaUploadBucket`** (new, not built yet): plain private
     `Bucket` — no CloudFront, no signing, no WAF. Receives the
     presigned-PUT raw upload, gets an S3 `ObjectCreated` event notification
     wired to the transcode-trigger Lambda, read by the MediaConvert role.
     Nothing else ever reads from it.
   - **`LessonMediaBucket`** (exists today, from Tier 1 — unchanged):
     becomes purely the serving bucket. MediaConvert writes HLS output
     here; CloudFront + the signing key group serve it. No event
     notification wired to it, so there's no self-triggering risk (a
     single-bucket-with-prefixes design would need to guard against
     MediaConvert's own output re-triggering the upload event).
   - Why split: once transcoding ships, the raw upload is never served
     directly (see status gating below), so it has no reason to ever sit
     behind CloudFront/signing at all. Splitting also avoids provisioning
     a second CloudFront distribution/signing key group just for uploads.

2. **Object key format** (already implemented in PR1), labeled/hierarchical
   instead of the old flat `lessons/${lessonId}/${contentItemId}.${ext}`:
   - Upload (will live in `LessonMediaUploadBucket` once PR2 lands):
     `courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/${contentItemId}.${ext}`
   - HLS output (will live in `LessonMediaBucket`):
     `courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/content-items/${contentItemId}/master.m3u8`
     + segments alongside it — same path shape, mirrored into the other bucket.
   - Why: lets the transcode-trigger Lambda and the MediaConvert
     completion-callback Lambda parse all 4 DynamoDB key fields straight out
     of the S3 key / MediaConvert `UserMetadata`, with no GSI or lookup step
     needed anywhere in the pipeline.

3. **`contentItem.status` and bucket selection.**
   - New entity field `status: 'pending' | 'ready' | 'failed'`, default
     `'ready'` (so `text`, and any future non-video type, need zero code
     changes — only video's create path overrides it to `'pending'`).
   - `contentItem.s3Key` is repointed to the manifest key on successful
     transcode, not stored in a separate field — its only reader
     (`createContentItemVideoUrl`) just needs to know which bucket to read
     from, and that's derived from `status`: `status !== 'ready'` → object
     is in `LessonMediaUploadBucket`; `status === 'ready'` → it's in
     `LessonMediaBucket`. No key-pattern-sniffing needed.
   - On successful transcode, the raw upload is deleted (the whole point of
     the issue is no single file left to "Save As"). On failure, it's left
     in place and `status` becomes `'failed'` so the instructor can retry.
   - `updateContentItemVideo` resets `status` back to `'pending'` whenever
     the underlying file is replaced (found this gap while implementing
     PR1 — without it, a previously-`ready` item would keep reporting
     `ready` immediately after a replacement, before the new file has even
     been transcoded).

4. **Playback: signed-URL wildcard policy + hls.js `xhrSetup`, not signed
   cookies.** HLS needs the player to fetch a manifest plus many
   segment/variant files, so today's single-object signed URL doesn't work
   as-is. Signed cookies would be the "transparent" fix, but the CloudFront
   distribution has no custom domain (`*.cloudfront.net`, different
   registrable domain than the portal), so the cookie is third-party from
   the player's perspective and gets blocked by Safari and others by
   default. Instead: `getSignedCloudFrontUrl` needs a variant that signs a
   **custom policy with a wildcard resource**
   (`https://${domain}/courses/.../content-items/<id>/*`) instead of a
   single-object canned policy — the same `Policy`/`Signature`/`Key-Pair-Id`
   query params are then valid for every file under that prefix, and
   hls.js's `xhrSetup` callback appends them to every request it makes. No
   cookies, no new response-header plumbing needed in the tRPC handler.
   **Not yet verified**: exact `@aws-sdk/cloudfront-signer` custom-policy
   parameter shape — check its README when implementing PR3.

5. **MediaConvert renditions via a CDK-provisioned `CfnJobTemplate`**, not
   settings inlined in the trigger Lambda. `AWS::MediaConvert::JobTemplate`
   is a first-class CDK L1 resource, no custom-resource machinery needed.
   Starting ladder: 3 rungs, 1080p (~5Mbps) / 720p (~3Mbps) / 480p
   (~1.2Mbps), H.264/AVC for broad compatibility.

## PR1 — done

Branch `feat/content-item-status`, pushed, no PR opened yet. Commit:
"feat(core-table,instructor-api,core-api): add contentItem status field for
async video transcoding".

Changed:
- `packages/databases/core-table/src/entities/content-item.ts` — added
  `status` field (see decision 3).
- `packages/apis/instructor-api/src/procedures/content-item-video.ts`:
  - New object key format everywhere it's built/validated
    (`createContentItemVideoUploadUrl`, `createContentItemVideo`,
    `updateContentItemVideo`).
  - `createContentItemVideo` sets `status: 'pending'`.
  - `createContentItemVideoUrl` refuses (`NOT_FOUND`) unless
    `status === 'ready'`.
  - `updateContentItemVideo` resets `status` to `'pending'` when the file
    is replaced.
- Zod schemas updated in both `packages/apis/instructor-api/src/schema/content-item.ts`
  and `packages/apis/core-api/src/schema/course.ts` (shared
  `ContentItemBaseSchema` in each) to expose `status`.
- Test files updated/extended for all of the above:
  `content-item-video.test.ts`, `content-item-shared.test.ts`,
  `content-item-text.test.ts`, core-api's `course.test.ts`.

Verified: `core-table`, `instructor-api`, `core-api` all compile, lint
(biome), and test clean (108 + 31 tests passing) as of this commit.

## PR2 — not started: MediaConvert pipeline

**New constructs:**
- `UploadBucket` (generic, base class) at
  `packages/common/constructs/src/core/upload-bucket.ts` — plain `Bucket`,
  same KMS/CORS/block-public-access shape `MediaBucket` already uses
  (`media-bucket.ts:99-117`), no CloudFront/KeyGroup/WAF. Exposes
  `grantPut`/`grantRead`/`grantDelete` and
  `notifyOnObjectCreated(destination, ...filters)`.
- `LessonMediaUploadBucket` (thin wrapper) at
  `packages/common/constructs/src/app/s3/lesson-media-upload-bucket.ts`,
  mirroring how `LessonMediaBucket` wraps `MediaBucket`.
- New pipeline construct, e.g.
  `packages/common/constructs/src/app/media-convert/video-transcode-pipeline.ts`:
  `CfnJobTemplate` (ABR ladder), a `mediaconvert.amazonaws.com` IAM role
  (`lessonMediaUploadBucket.grantRead`, `lessonMediaBucket.grantPut`, plus
  `kms:Decrypt`/`kms:GenerateDataKey` on both buckets' KMS keys — same
  gotcha as the existing CloudFront `kms:Decrypt` grant at
  `media-bucket.ts:150-169`), the S3→Lambda event notification wiring, and
  an EventBridge rule for `aws.mediaconvert` `COMPLETE`/`ERROR` → the
  callback Lambda.
- `createContentItemVideoUploadUrl` needs to switch its presigned-PUT
  target from `resolveLessonMediaBucketName()` to a new
  `resolveLessonMediaUploadBucketName()`. Grants in `application-stack.ts`
  move/duplicate accordingly (delete grants need to cover *both* buckets
  now, since which bucket a given delete targets depends on `status`).

**New Lambda 1 — transcode trigger**
(`packages/events/src/media/transcode-video.ts`, same shape as
`packages/events/src/cognito/post-confirmation.ts` + its construct +
`application-stack.ts:95-118` wiring): S3 `ObjectCreated` on
`LessonMediaUploadBucket` → parse the 4 ids straight out of the key → submit
a MediaConvert `CreateJob` referencing the `CfnJobTemplate`, output
destination in `LessonMediaBucket`, `UserMetadata` carrying the 4 ids for
the callback. No DynamoDB read needed. Note: the DynamoDB record may not
exist yet at this point (client PUTs to S3, *then* calls
`createContentItemVideo`) — harmless, the callback tolerates a missing
record.

**New Lambda 2 — transcode completion callback**
(`packages/events/src/media/transcode-complete.ts`): EventBridge
`MediaConvert Job State Change` event → read ids from
`detail.userMetadata` → on `COMPLETE`, patch `status: 'ready'` +
`s3Key: <manifest path>` and best-effort-delete the raw object from
`LessonMediaUploadBucket`; on `ERROR`, patch `status: 'failed'` and leave
the raw object in place. Swallow/log a missing `.patch()` target rather
than erroring.

## PR3 — not started: hls.js player swap

- Add `hls.js` dependency (new pnpm-catalog entry).
- `createContentItemVideoUrl`'s output likely stays `{ url }` — confirm
  exact param propagation for the wildcard-signed-URL approach (decision 4)
  when implementing.
- `attach-lesson-video-dialog.tsx:289-297`: swap the plain `<video src>` for
  an `Hls.js` instance, falling back to native playback via
  `video.canPlayType('application/vnd.apple.mpegurl')` for Safari. Keep the
  existing lockdown attributes (`controlsList`, `disablePictureInPicture`,
  `onContextMenu` prevention).
- Add "processing" (`status === 'pending'`) and "failed" (`status === 'failed'`)
  states to the dialog, reusing the portal's existing `Spinner`/`Alert`
  components. No polling pattern exists in the repo yet — use React Query
  `refetchInterval` while pending, simplest option, new to this repo.
- No shared `common/shadcn` player component for now — only one consumer
  today (instructor-portal); revisit if/when the student viewer gets built.

## Verification (once PR2/PR3 land)

- PR2: `pnpm nx run @wattle/infra:build` to confirm synth; deploy to
  `wattle-development`, upload a test video, confirm a MediaConvert job
  fires, `courses/.../content-items/<id>/master.m3u8` appears in
  `LessonMediaBucket`, `status` flips to `ready`, raw upload is deleted
  from `LessonMediaUploadBucket`. Test a corrupt upload → `status` should
  flip to `failed`, raw object left in place.
- PR3: `pnpm dev`, manually verify adaptive bitrate switching (throttle
  network in devtools), the processing spinner appears/clears correctly,
  and Safari's native-HLS fallback path is exercised.

## Also discussed but not yet acted on (future issues, not #110)

- If lessons ever need image/file/audio attachments beyond video: reuse
  `LessonMediaBucket` directly for anything that doesn't need async
  processing (upload straight there, `status: 'ready'` immediately, same
  as `text` today) — only route through `LessonMediaUploadBucket` if a
  future type also needs a worker before it's usable. Don't provision a
  bucket per content-item type.
- Profile photos (unrelated to lesson media, different trust domain): don't
  reuse `LessonMediaBucket`. If/when built, prefer a fully public
  (unsigned) CloudFront read path with a deterministic key
  (`users/{userId}/profile-photo.{ext}`) and cache-busting via a version
  query param, rather than signed URLs — avatars don't need the same
  protection as gated lesson content, and per-request signing would be
  wasteful for something rendered dozens of times per page.
