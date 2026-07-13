# AGENTS.md

## Cursor Cloud specific instructions

This repo (`futsal-lega-v3`, "Futsal Amas Lega") is an **Expo / React Native (TypeScript)** mobile app whose real targets are Android/iOS. Data is stored on-device via AsyncStorage; a Google Apps Script + Google Sheets/Drive backend is **optional** cloud sync (hardcoded in `src/services/googleSheetsService.ts`, no env vars/secrets needed).

Package manager is **npm** (`package-lock.json`). Dev commands live in `package.json` (`start`, `android`, `ios`, `web`).

Non-obvious caveats for this headless cloud environment:

- **How to run it here:** the cloud VM has no device/emulator, so run the app on **web**: `npx expo start --web --port 8081` (serves on http://localhost:8081). On web, AsyncStorage maps to `localStorage`, so squad/match data persists in the browser.
- **Web runtime deps** (`react-dom`, `react-native-web`, `@expo/metro-runtime`) are required for `expo start --web` and are already in `package.json`; a plain `npm install` restores them.
- Add `CI=1` before `npx expo start` to disable interactive watch/reload prompts (useful for non-interactive shells). Metro's first web bundle takes ~10-20s; wait before loading the page.
- **No lint step is configured** and there was originally no `tsconfig.json` (Expo auto-generates one on `expo start`). `npx tsc --noEmit` reports **pre-existing** type errors in `src/services/googleSheetsService.ts`; these are not part of any configured check — do not treat them as regressions.
- Native-only features (camera, calendar, image picker, expo-av) may be no-ops or limited on web; core flows (squad/Plantilla, matches, stats, timer) work on web for verification.
