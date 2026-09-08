# Slowtide · iOS app

The site one folder up, bundled as a native iPhone app with [Capacitor](https://capacitorjs.com). The web pages are copied into `www/` at build time (`build-www.js`), fonts are self-hosted so the app works offline, and a small native layer (`native/`) handles the status bar, safe areas, external links and the microphone copy.

Nothing here needs a Mac on your desk: GitHub builds, signs and uploads the app on a macOS runner (`.github/workflows/ios.yml`).

## One-time setup on Apple's side (about 15 minutes)

1. **Agreements.** [App Store Connect → Business](https://appstoreconnect.apple.com/business): accept the latest Paid Apps / Developer Program License Agreement if one is pending. Builds cannot upload while an agreement is outstanding.
2. **API key.** [Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) → **Generate API Key**. Name it `github-actions`, access **Admin** (cloud signing needs Admin). Download the `.p8` file once — Apple never shows it again. Note the **Key ID** and the **Issuer ID** on that page.
3. **Team ID.** [developer.apple.com/account → Membership details](https://developer.apple.com/account) → the 10-character Team ID.
4. **App record.** [App Store Connect → My Apps → +](https://appstoreconnect.apple.com/apps) → New App: platform iOS, name **Slowtide**, primary language English (U.S.), bundle ID **lol.iamra.chladni** (choose "register a new one" if it isn't in the list yet: it appears after the first build, or register it at developer.apple.com → Identifiers → + → App IDs, explicit, `lol.iamra.chladni`, no capabilities), SKU `chladni-fields-ios`, full access.
5. **GitHub secrets.** In the repo: Settings → Secrets and variables → Actions → New repository secret, four times:

   | Secret | Value |
   |---|---|
   | `APPLE_TEAM_ID` | the Team ID |
   | `ASC_KEY_ID` | the Key ID |
   | `ASC_ISSUER_ID` | the Issuer ID |
   | `ASC_KEY_P8` | the whole text of the `.p8` file, `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----` |

6. **Products.** App Store Connect → the app → Subscriptions and In-App Purchases: create the six products in [store/monetization.md](store/monetization.md) (exact IDs matter), and sign the **Paid Apps Agreement** under Business. Optional: a Google OAuth iOS client ID as the secret `GOOGLE_IOS_CLIENT_ID` turns on "Continue with Google"; without it the app offers Sign in with Apple only.

## Checking it compiles (no Apple account needed)

Every push that touches `app/` runs a **compile check** on GitHub's Mac runner: the project is built for the iOS Simulator with signing off. Actions → iOS · build and upload → Run workflow → mode `compile-check` runs it on demand. Green means the Swift, the plugins and the package resolution are fine; the only things it can't prove are signing and StoreKit.

## Shipping a build

Actions → **iOS · build and upload** → Run workflow. About 15 minutes later the build shows in App Store Connect → TestFlight; Apple's processing adds 5–20 minutes. The build number is the workflow run number; the version comes from `package.json` (or the box on the Run workflow form).

Then in App Store Connect → the app → **1.0 Prepare for Submission**: paste the copy from `store/listing.md`, upload `store/screenshots/*.png`, pick the build, fill the privacy answers (no data collected), and **Add for Review**. First reviews take 1–3 days.

### If the archive step fails with a signing error

Cloud-managed distribution certificates need the API key to have the Admin role and the Account Holder to have accepted the current agreement. If your team can't use cloud signing, make a classic certificate once and add it as a secret:

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout dist.key -out dist.csr -subj "/CN=Slowtide/emailAddress=you@example.com"
# developer.apple.com → Certificates → + → Apple Distribution → upload dist.csr → download distribution.cer
openssl x509 -in distribution.cer -inform DER -out distribution.pem
openssl pkcs12 -export -inkey dist.key -in distribution.pem -out dist.p12 -passout pass:choose-a-password
base64 -w0 dist.p12   # → secret IOS_P12_BASE64; the password → IOS_P12_PASSWORD
```

## Working locally

```bash
npm ci
npm run build          # site → www/
npx cap sync ios       # www/ → ios/App/App/public, plugins → Package.swift
```

Regenerating art (needs a Chromium with `--remote-debugging-port=9333`, e.g. headless Edge on Windows):

```bash
npm run assets         # app icon + launch image → ios/App/App/Assets.xcassets
npm run screenshots    # eight App Store screenshots → store/screenshots (PNG without alpha; asc-upload.js pushes them to ASC)
npm run fonts          # re-download the self-hosted fonts
```

## Widgets and signing

The `ChladniWidgets` target (WidgetKit, iOS 17+) reads presets and saved mixes from the App Group `group.lol.iamra.chladni` and deep-links into the app (`chladni://play?preset=rain`, `chladni://play?mix=<id>`). It has its own bundle ID (`lol.iamra.chladni.widgets`) and App Store profile; `node tools/asc-widgets-signing.js --key … --out <signing dir>` (re)creates both profiles with the existing distribution certificate. The App Group itself is created and assigned to both App IDs in developer.apple.com (no API). Secrets: `IOS_PROFILE_BASE64` and `IOS_PROFILE_WIDGET_BASE64`. Any capability change on an App ID invalidates its profile: re-run the script and update the secrets.

## What differs from the website

- **Feels like an iPhone app:** bottom tab bar (Plates · Resonance · Law of One · You), dialogs as bottom sheets with a grabber and flick-down to dismiss, instant pressed states, 44pt hit targets, haptics on figure changes, mic start, presets and purchases, edge-swipe back on pushed pages, cross-fade between sections, a three-line welcome on first launch.
- **Audio like a music app:** plays through the ring/silent switch (AVAudioSession playback), background audio mode, lock-screen Now Playing with pause for the Resonance Room.
- Fonts ship in the bundle; everything works offline.
- Microphone permission is the app's own (Settings → Slowtide → Microphone). The web-only "open in Safari" advice is not shown.
- Outside links open in an in-app Safari sheet with a Done button.
- The page keeps clear of the status bar and home indicator; the status-bar text follows the theme.
- **You tab:** optional Sign in with Apple / Google, Slowtide Plus (StoreKit 2 in `ios/App/App/PurchasesPlugin.swift`), tip jar, saved mixes, restore purchases, delete my data. Free vs Plus is in [store/monetization.md](store/monetization.md); the gating lives in `native/native.js` (timers, sleep mode, mixes, share watermark).
- iPhone only, portrait only. iPad support would need iPad screenshots and a landscape pass.

## Testing purchases and sign-in

Purchases and sign-in only work on a real device: install a TestFlight build, sign out of the App Store on the phone, and use a **Sandbox tester** (App Store Connect → Users and Access → Sandbox). Sandbox subscriptions renew every few minutes so you can watch expiry and restore. The plates, mic, mixes and sheets can be checked in the simulator.
