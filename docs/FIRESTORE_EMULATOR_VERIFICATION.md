# Firestore Emulator Verification (Free)

This project is configured to run Firestore Emulator locally on port `8080` with Emulator UI on `4000`.

## Start Emulator
```bash
npx firebase-tools emulators:start --only firestore
```

## Open Emulator UI
- http://127.0.0.1:4000

## Manual Rule Checks
Use Emulator UI to create/read/update documents and verify rule behavior.

### Closets
- Create doc in `closets` with missing `userId` or `imageUrl` should fail.
- Create doc with valid fields and matching authenticated `userId` should pass.
- Update should fail if trying to change `userId`.

### Preferences
- Read/write only for signed-in owner path `preferences/{userId}`.
- Non-boolean values for `avoidDenimOnDenim` or `preferCasual` should fail.

### Notifications
- Read only when `resource.data.userId` matches current user.
- Writes should fail from client app.

### Threads and Messages
- Thread create requires `participantIds` list containing current user and size 2..20.
- Thread update cannot change `participantIds`.
- Message create requires `senderId == auth.uid` and non-empty `text` (<=2000 chars).

## Deploy Rules
```bash
npx firebase-tools deploy --only firestore:rules --project closetai-5188c
```
