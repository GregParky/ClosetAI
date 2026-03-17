# Firestore Rules Verification Results

Date: 2026-03-10
Method: Local Firestore Emulator + scripted checks (`scripts/firestore_emulator_checks.mjs`)
Result: **20 passed, 0 failed**

## Line-by-line Status
- [x] Closet create fails without required `userId`
- [x] Closet create succeeds with required fields + owner match
- [x] Closet update fails when `userId` change attempted
- [x] Public closet doc is readable by another signed-in user
- [x] Public closet doc is readable by unauthenticated user
- [x] Private closet doc is not readable by another signed-in user
- [x] Private closet doc is not readable by unauthenticated user
- [x] Preferences owner write succeeds with valid boolean fields
- [x] Preferences write fails with invalid field type
- [x] Notifications owner-read behavior verified (owner can read, other user denied)
- [x] Thread create succeeds when current user in `participantIds`
- [x] Thread create fails when current user missing from `participantIds`
- [x] Thread update fails when `participantIds` change attempted
- [x] Thread message create succeeds for participant with matching `senderId`
- [x] Thread message create fails when `senderId` mismatches auth user
- [x] Thread message create fails when text is empty

## Command Used
```bash
firebase emulators:exec --only firestore "node scripts/firestore_emulator_checks.mjs"
```

## Notes
- In this agent environment, emulator commands required elevated permissions for localhost port binding.
- Owner-seeded notification doc was used to validate notification read rules.
