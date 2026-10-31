# FRIDGEPAGO (냉파고) — Firestore Zero-Trust Security Specification

## 1. Data Invariants & Relational Mapping
1. **Default-Deny Safety Net**: Any path not explicitly matched under `/users/{userId}` and its eleven documented subcollections is unconditionally denied (`allow read, write: if false;`).
2. **Exclusive Verified Owner Mandate**: Every read and write operation requires `request.auth != null`, `request.auth.token.email_verified == true`, AND `request.auth.token.email == 'jseongho92@gmail.com'`. Unverified emails, anonymous tokens, and third-party Google accounts are strictly rejected.
3. **Master Gate (Parent Relational Sync)**: `/users/{userId}` is the Master Source of Truth. No subcollection document (`ingredients`, `recipes`, `shoppingItems`, `expenses`, `wastes`, `recipeUsages`, `monthlySummaries`, `storeRecommendations`, `lifecycleEvents`, `wasteAnalyses`, `gameProgress`) can be retrieved (`get`), created, updated, or deleted unless `/users/$(userId)` exists and `get(/databases/$(database)/documents/users/$(userId)).data.userId == request.auth.uid`.
4. **No PII Exposure & Zero Blanket Reads**: No collection stores raw user PII (`email`, `phone`, `address`), `/users` has `allow list: if false;`, and single-document `get` on `/users/{userId}` is strictly limited to `isOwner(userId)`.
5. **Query Enforcer (Cost-Optimized List Security)**: All subcollection `allow list` rules forbid `get()`/`exists()` O(n) reads and explicitly enforce `isOwner(userId) && existing().userId == request.auth.uid`.
6. **Strict Schema Blueprint & Anti-Update-Gap**: Every `create` and `update` calls `isValid[Entity](incoming())` enforcing `keys().hasAll(...)` + `keys().hasOnly(...)`, exact types, regex patterns, string `.size()` bounds, bounded list sizes, and first-element type validation. Every `update` wraps action branches in `isValid[Entity](incoming())` and restricts mutated keys via `incoming().diff(existing()).affectedKeys().hasOnly(...)`.
7. **Temporal & Identity Immutability**: `createdAt` must equal `request.time` on `create` and remain immutable (`incoming().createdAt == existing().createdAt`) on `update`. `updatedAt` must equal `request.time` on both `create` and `update`. `id`, `month` (where primary key), and `userId` are immutable once created.

---

## 2. Example Payloads for the Eight Pillars & The "Dirty Dozen" Attack Payloads

### Dirty Dozen Adversarial Payloads (All MUST return `PERMISSION_DENIED`)
1. **Payload 1 — Unverified Owner Email Spoof (Identity)**: Authenticated user `uid_owner` with `email: "jseongho92@gmail.com"` and `email_verified: false` attempting `create` on `/users/uid_owner`.
2. **Payload 2 — Unauthorized Third-Party Google Account Registration & Cross-Tenant Spoofing (Exclusive Owner Lock)**: Verified non-owner user `uid_mallory` (`email: "mallory@example.com"`, `email_verified: true`) attempting `create` on `/users/uid_mallory` OR `/users/uid_owner/ingredients/ing_1`.
3. **Payload 3 — Orphaned Subcollection Write Bypassing Master Gate (Relational Sync)**: Verified owner `uid_owner_fresh` attempting `create` on `/users/uid_owner_fresh/ingredients/ing_1` BEFORE `/users/uid_owner_fresh` profile document exists.
4. **Payload 4 — Shadow / Ghost Field Injection on Create (Schema Integrity)**: Verified owner `uid_owner` sending valid `IngredientItem` plus `"isAdmin": true` on `create`.
5. **Payload 5 — Shadow Field Injection on Update (Anti-Update-Gap)**: Verified owner `uid_owner` updating `IngredientItem` with `"role": "admin"` alongside `quantity`.
6. **Payload 6 — Value Poisoning on Whitelisted Update Key (Type/Boundary Safety)**: Verified owner `uid_owner` updating whitelisted key `quantity` to `-50` on `/users/uid_owner/ingredients/ing_valid`.
7. **Payload 7 — Path Variable ID Poisoning (Denial of Wallet)**: Verified owner `uid_owner` creating `/users/uid_owner/ingredients/bad$id!` violating `^[a-zA-Z0-9_\-]+$`.
8. **Payload 8 — String Oversize Resource Exhaustion (Denial of Wallet)**: Verified owner `uid_owner` creating `IngredientItem` with a 5,000-character `memo` string (exceeding `maxLength: 300`).
9. **Payload 9 — Unbounded Array & Element Type Poisoning (Total Array Guard)**: Verified owner `uid_owner` updating `UserProfile.allergiesAndDislikes` with 45 items (exceeding limit 30).
10. **Payload 10 — Forged Client Timestamp (Temporal Integrity)**: Verified owner `uid_owner` creating `ExpenseEntry` with `createdAt` set to a past client `Timestamp` instead of `serverTimestamp()` (`request.time`).
11. **Payload 11 — Immutable Field Tampering on Update (Immortal Field)**: Verified owner `uid_owner` attempting to mutate `userId` during an update on `/users/uid_owner/shoppingItems/shop_1`.
12. **Payload 12 — Unauthorized Cross-User List / Profile Scraping (Query Enforcer & PII Guard)**: Verified non-owner `uid_mallory` attempting `get` on `/users/uid_owner` or `list` on `/users/uid_owner/ingredients`.

