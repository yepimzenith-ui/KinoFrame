# KinoFrame Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **User Profile Isolation (PII Protection)**:
   - `/users/{userId}` stores `uid`, `displayName`, `email`, `photoURL`, optional `username`, `createdAt`, `updatedAt`.
   - Only the authenticated, email-verified user whose `request.auth.uid == userId` may `get`, `create`, `update`, or `delete` their own profile.
   - `allow list` on `/users` is strictly forbidden (`false`) to prevent account enumeration or PII scraping.
   - `uid` and `createdAt` are immutable after creation; timestamps must equal `request.time`.
   - Whenever a non-empty `username` is set or changed on `/users/{userId}`, rules verify `existsAfter` and `getAfter` against `/usernames/{username}` to guarantee atomic unique ownership.
2. **Unique Username Registry (Collision-Free, Zero-PII)**:
   - `/usernames/{username}` stores ONLY non-PII ownership claim fields: `username`, `ownerId`, `createdAt`, `updatedAt`.
   - Document ID `{username}` MUST match `^[a-z0-9_\\-]+$` (3–24 lowercase characters) and equal `incoming().username`.
   - `allow list` on `/usernames` is strictly forbidden (`false`) to prevent username scraping.
   - `allow get` permits single-document availability lookup by exact ID (`isValidUsername(username)`).
   - `allow create` requires `isVerifiedUser()`, `!exists(...)`, `incoming().ownerId == request.auth.uid`, and server timestamps.
   - `allow update` is `false` (immutable claims); `allow delete` is strictly restricted to `existing().ownerId == request.auth.uid` so username changes execute atomically inside `runTransaction`.
3. **Project Ownership & Query Enforcement**:
   - `/projects/{projectId}` stores `id`, `ownerId`, `name`, `mode`, `sequenceAspect`, `beatBpm`, `activeAssetId`, `previewAssetId`, `clipCount`, `totalDuration`, `clips`, `globalOverlays`, `audioClips`, `photoEdits`, `createdAt`, `updatedAt`.
   - Only an authenticated, email-verified user whose `request.auth.uid == existing().ownerId` (and `== incoming().ownerId` on create) may read, list, create, update, or delete projects.
   - `allow list` explicitly checks `resource.data.ownerId == request.auth.uid`, forcing client queries to include `where('ownerId', '==', user.uid)`.
   - `id`, `ownerId`, and `createdAt` are immutable after creation; `id` must match the `{projectId}` path parameter and match `^[a-zA-Z0-9_\\-]+$`.
4. **Bounded Payloads & Type Safety**:
   - `clips.size() <= 60`, `globalOverlays.size() <= 40`, `audioClips.size() <= 20`, `photoEdits.size() <= 30`.
   - Every string enforces explicit min/max `.size()` bounds. No shadow/ghost keys allowed (`keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update).

## 2. Adversarial "Dirty Dozen+" Payloads (Expected: `PERMISSION_DENIED`)
1. Unauthenticated read of `/users/userA` or `/projects/proj1`.
2. Authenticated userB attempting `get` or `list` on `/projects` without `ownerId == userB` filter.
3. Authenticated userB attempting `get` on `/users/userA` (PII leak test).
4. Authenticated user attempting `list` on `/users` or `list` on `/usernames` (enumeration test).
5. Unverified email (`email_verified == false`) attempting `create` on `/projects/proj1` or `/usernames/alexcuts`.
6. UserB attempting `create` on `/usernames/alexcuts` when it already exists (Username Hijack / Collision test).
7. UserB attempting `delete` or `update` on `/usernames/alexcuts` owned by UserA (Ownership Spoof test).
8. UserA attempting `create` on `/usernames/BadCaps!` or `/usernames/ab` (invalid format/length) or `email` field in `/usernames/alexcuts` (PII / Ghost Field test).
9. UserA attempting `update` on `/users/userA` with `username: "taken_handle"` without claiming `/usernames/taken_handle` in the same atomic transaction (`existsAfter`/`getAfter` bypass attempt).
10. UserB attempting `create` on `/projects/proj1` with `ownerId: "userA"` (Identity Spoofing).
11. UserA attempting `create` on `/projects/proj1` with `id: "mismatched-id"`, forged `createdAt` != `request.time`, or extra ghost field `isAdmin: true`.
12. UserA attempting `update` on `/projects/proj1` changing `ownerId` or `createdAt`, setting `name` > 100 chars, `beatBpm: 999`, or `clips` > 60 items.
