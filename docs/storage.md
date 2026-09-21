# Storage and Images

## Buckets

- Private commission storage contains design-request references, message
  images, and draft previews.
- Private portfolio storage contains draft and published marketing images with
  alt text; published bytes are served through a controlled signed redirect.
- Final private file delivery can be added later; the MVP also supports a
  gated approved HTTPS link.

Database rows store object paths and verified metadata rather than permanent
signed URLs.

## Upload process

1. Authenticate and authorize the upload purpose.
2. Enforce item count and body-size limits.
3. Detect JPEG, PNG, or WebP from file bytes.
4. Decode the image and validate dimensions.
5. Normalize to WebP and strip unnecessary metadata.
6. Generate a non-guessable object path unrelated to the original filename.
7. Upload to the correct bucket.
8. Persist sanitized display name, MIME, size, dimensions, hash, uploader, and
   timestamps.
9. Remove the object if finalization or database persistence fails.

Authenticated browser clients have read-only access where RLS permits; they
cannot mutate Storage objects or attachment/media metadata directly. All
writes pass through the authorized server route. The current host-safe image
limit is 4 MiB.

Current central limits are defined in `src/config/limits.ts`. They must remain
below current host and provider request limits.

On Vercel, `/api/*` is excluded from the Next.js Proxy matcher. API routes
perform their own authentication and authorization. This keeps image uploads
away from Vercel Routing Middleware's 4 MB body limit while the upload Route
Handler remains below the Vercel Function 4.5 MB request limit, including the
bounded multipart overhead. Images are not uploaded through Server Actions;
their separate 1 MB limit remains unchanged.

## Downloads

Private references and drafts are opened through an authenticated route. The
route verifies the related customer or administrator before generating a
short-lived signed URL. It returns a no-store redirect and never includes the
object path in a denied response.

## Portfolio images

Portfolio objects remain in a private bucket. Public metadata is readable only
for published parent projects, and image bytes are opened through
`/api/portfolio-media/[id]/open`, which rechecks publication before creating a
short-lived signed URL. Draft and archived media cannot be listed or opened
anonymously.

Published portfolio images require meaningful alternative text. Decorative
abstract artwork uses empty alt text. Do not upload scraped, unlicensed, or
customer-confidential images.

## External final deliverables

Raw external URLs live in a private database schema. Administrator registration
uses a protected RPC; customer reads cannot query the secret.

The open endpoint:

- Authenticates the requester.
- Verifies commission ownership.
- Requires a released deliverable and succeeded final payment.
- Validates commission state.
- Validates HTTPS and the configured hostname allowlist.
- Records access before resolving the secret.

Third-party shared links remain bearer links after disclosure. For stronger
revocation, use future private Supabase file storage with short-lived signed
URLs.

## Retention

Retention periods require a business decision before production. Accepted
commercial and financial history should be anonymized rather than
inconsistently cascade-deleted. Unattached temporary objects and rejected
uploads should be cleaned promptly.
