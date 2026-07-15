# AGENTS.md

## Cursor Cloud specific instructions

This is an **Expo (SDK 54) + React Native + TypeScript** mobile app ("Futsal Amas Lega"). There is a single `package.json` at the repo root (not a monorepo). Package manager is **npm** (`package-lock.json` present).

### Services / how to run
- Only local service is the **Expo/Metro dev server**. Scripts live in `package.json`: `npm start` (`expo start`), `npm run web` (`expo start --web`), `npm run android`/`npm run ios` (require Android SDK / Xcode, not available here).
- On a headless VM the practical way to launch and inspect the app is **`npm run web`** (renders via `react-native-web` in a browser at `http://localhost:8081`). Use `CI=1 npx expo start --web` to disable the interactive watch/TTY prompts.
- The app is **offline-first**: storage defaults to `local` (AsyncStorage / browser storage). It runs fully standalone with no backend.
- Cloud sync is optional and points at a hosted **Google Apps Script + Google Sheets/Drive** backend (URLs hardcoded in `src/services/googleSheetsService.ts`). It cannot be run locally and is non-blocking for core testing.

### Lint / test / typecheck
- There is **no ESLint config and no automated test suite** in this repo.
- There is no committed `tsconfig.json` by default; Expo auto-generates one (`{ "extends": "expo/tsconfig.base" }`) on first `expo start`. Typecheck with `npx tsc --noEmit` once a `tsconfig.json` exists.

### Gotchas
- Web needs `react-dom`, `react-native-web`, and `@expo/metro-runtime` installed (the `web` script exists but these deps must be present). Install with `npx expo install react-dom react-native-web @expo/metro-runtime`.
- Expo prints package-version "expected version" warnings on startup; they are non-fatal and the app bundles/runs fine.
- App flow: `SelectorEquipo` (choose team + season) → main `MENU` → sub-screens like `Plantilla` (squad), `Partidos` (matches), etc.
