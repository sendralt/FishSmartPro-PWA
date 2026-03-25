# 📋 FishSmart Pro: The Complete Publication TO-DO List

This document outlines every step needed to transition **FishSmart Pro** from its current state to a live app in the Google Play Store.

---

## ✅ Phase 1: Preparation (Completed)
- [x] **Review App Logic**: Analyzed 'Bite Score' and AI integration.
- [x] **Generate 'About' Page**: Created `ABOUT.md` for scientific/feature disclosure.
- [x] **Generate Privacy Policy**: Created `PRIVACY.md` for Store compliance.
- [x] **Capture Screenshots**: Generated `screenshot_mobile.png` and `screenshot_desktop.png` from the live site.
- [x] **Configure TWA**: Generated `twa-manifest.json` for Bubblewrap.
- [x] **Prepare Digital Asset Links**: Created `.well-known/assetlinks.json` (with placeholder fingerprint).

## 🚀 Phase 2: Deployment & Final Tweaks (Immediate Next Steps)
- [ ] **Sync to Live Server**: Upload the new files (`ABOUT.md`, `PRIVACY.md`, `assetlinks.json`, and `screenshots/`) to your Render.com environment.
- [ ] **Verify Public Access**: 
    - Confirm `https://fishsmartpro-pwa.onrender.com/.well-known/assetlinks.json` is visible.
    - Confirm `https://fishsmartpro-pwa.onrender.com/PRIVACY.md` is accessible.
- [ ] **Update Web Manifest**: Add the generated screenshots to the `screenshots` array in `public/manifest.json` to enable the 'Rich Install UI' for users visiting the site directly.

## 📦 Phase 3: Android Build (Packaging the PWA)
- [x] **Install Bubblewrap**: `npm install -g @bubblewrap/cli` on your local development machine.
- [x] **Initialize Android Project**: Run `bubblewrap init --manifest twa-manifest.json` in your project root.
- [x] **Generate Signing Key**: Create a keystore during the `init` process (keep the password safe!).
- [x] **Build App Bundle**: Run `bubblewrap build` to create your `app-release.aab` file.
- [x] **Retrieve Fingerprint**: Run `bubblewrap fingerprint` to get your **SHA-256 certificate fingerprint**.

## 🔑 Phase 4: Final Verification
- [x] **Update Asset Links**: Replace the placeholder in `public/.well-known/assetlinks.json` with the real SHA-256 fingerprint from Phase 3.
- [x] **Redeploy**: Push the updated `assetlinks.json` to the live server.
- [ ] **Test Native Experience**: Install the app. If the browser address bar is gone, verification was successful.

## 🏛️ Phase 5: Google Play Console Submission
- [ ] **Create Developer Account**: Register and pay the $25 fee at [play.google.com/console](https://play.google.com/console).
- [ ] **Create App Listing**: 
    - Upload the `app-release.aab` bundle.
    - Upload the **Screenshots** (`screenshot_mobile.png`, `screenshot_desktop.png`).
    - Provide the **Privacy Policy** URL or text.
    - Set up **Store Categories** and **Rating Questionnaires**.
- [ ] **Submit for Review**: Send the app to Google's review team (takes 1-7 days).

---
*Last Updated: 2026-03-24*
