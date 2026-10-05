# Bellisima mobile app

Fresh Expo / React Native companion for the Bellisima storefront on iOS and Android.

## Google account setup

Mobile Google sign-in is wired to the website's `POST /auth/mobile/google` endpoint. It validates the Google ID token and saves the Google subject to the same `public.users` record as website sign-in, then returns a bearer session. Add the iOS and Android OAuth client IDs to both this app's `.env` and the website server's environment (`GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID`). Keep the website's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for browser sign-in. Restart the website server after setting the native IDs.

For Android, register an OAuth client with package `com.bellisima.shop` and the SHA-1 certificate fingerprint used by your build. For iOS, use bundle ID `com.bellisima.shop`. A user's first website and app sign-ins must use the same Google account.

The website's cart is still stored in browser `localStorage`; product and shared-cart API routes are not implemented yet. The account login will work once the website server has the native IDs configured, but cart sync needs the separate cart backend work described in [api-contract.md](api-contract.md).

Create `.env` in this project:

```env
EXPO_PUBLIC_API_URL=https://your-store.example.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
```

Set `EXPO_PUBLIC_API_URL` to the reachable website server origin. On a physical device, use your computer's LAN IP for local development; `localhost` points to the phone itself.

## Start the app

```sh
npm install
npm start
```

The start script opens an Expo tunnel. Scan the QR code with Expo Go. Native Google sign-in callbacks need a development build on a physical device:

```sh
npx expo run:ios
npx expo run:android
```

## Download an Android APK

Pushing to `main` runs the [Android APK workflow](.github/workflows/android-apk.yml). When it finishes, the APK is published at the repository's `android-latest` release. To enable Google sign-in in that APK, add `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` as GitHub Actions repository variables before the build runs. The website server also needs the matching `GOOGLE_ANDROID_CLIENT_ID` value.

iOS builds require macOS and Xcode. Android builds require Android Studio and the Android SDK. The configured app scheme is `bellisima`.

## Account and bag behavior

The app stores its bearer session in the phone's secure storage, checks it against `/auth/me` on startup, and clears it on sign-out. Cart reads and writes are always scoped by the authenticated server session. The app refreshes its bag about once per second while signed in so changes from the website appear promptly; both clients must write to the same server cart for that to work.
