# ClosetAI Free Pre-Launch Checklist

## 1) Core Product Flow (No Paid Services Required)
- [ ] Sign up, login, logout with email/password
- [ ] Add clothing items from photo library
- [ ] Move items between closet sections
- [ ] Delete items
- [ ] Discover feed loads, filters, refreshes, and paginates
- [ ] Outfit suggestions load from real closet data
- [x] Inbox empty state and list rendering behavior

## 2) Stability and UX
- [x] Every screen has loading, empty, and error states
- [x] No dead tabs/placeholders in bottom navigation
- [x] Improve actionable error copy for auth/data failures
- [x] Add guardrails for unsupported flows in Expo Go

## 3) Firebase Data and Rules
- [x] Verify Firestore rules for closets/preferences/inbox/threads
- [x] Confirm users can only read/write their own private docs
- [x] Confirm public discover docs are readable
- [x] Validate fallback behavior when optional collections are missing
- [x] Test all critical reads/writes against local Firestore emulator

## 4) Data Quality and App Logic
- [ ] Normalize category/type values consistently
- [x] Prevent invalid writes (missing userId, imageUrl)
- [ ] Ensure feed and outfit generators handle sparse data safely
- [ ] Add deterministic fallback behavior for low-content states

## 5) Performance (Free)
- [ ] Ensure large lists use FlatList/SectionList
- [ ] Avoid unnecessary rerenders for expensive transforms
- [ ] Keep image-heavy screens responsive while loading

## 6) Launch Readiness Artifacts (Free)
- [ ] App icon and splash are final
- [ ] Draft privacy policy and terms
- [ ] App Store copy draft (title, subtitle, description, keywords)
- [ ] Screenshot shot-list and feature descriptions

## 7) Paid-Gated Final Checks (Do Last)
- [ ] Google sign-in on physical iPhone dev build
- [ ] TestFlight smoke test
- [ ] Final production EAS build and store submission checks

## Suggested Execution Order
1. Finish all core flow and rules work in Expo Go + emulator.
2. Lock UX copy/error handling and empty states.
3. Prepare launch artifacts.
4. Only then pay for Apple Developer and run physical iOS OAuth/build tests.
