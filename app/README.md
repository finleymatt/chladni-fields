# Chladni Fields · iOS app

The site one folder up, bundled as a native iPhone app with [Capacitor](https://capacitorjs.com). The web pages are copied into `www/` at build time (`build-www.js`), fonts are self-hosted so the app works offline, and a small native layer (`native/`) handles the status bar, safe areas, external links and the microphone copy.

Nothing here needs a Mac on your desk: GitHub builds, signs and uploads the app on a macOS runner (`.github/workflows/ios.yml`).

## One-time setup on Apple's side (about 15 minutes)

1. **Agreements.** [App Store Connect → Business](https://appstoreconnect.apple.com/business): accept the latest Paid Apps / Developer Program License Agreement if one is pending. Builds cannot upload while an agreement is outstanding.
2. **API key.** [Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) → **Generate API Key**. Name it `github-actions`, access **Admin** (cloud signing needs Admin). Download the `.p8` file once — Apple never shows it again. Note the **Key ID** and the **Issuer ID** on that page.
3. **Team ID.** [developer.apple.com/account → Membership details](https://developer.apple.com/account) → the 10-character Team ID.
4. **App record.** [App Store Connect → My Apps → +](https://appstoreconnect.apple.com/apps) → New App: platform iOS, name **Chladni Fields**, primary language English (U.S.), bundle ID **lol.iamra.chladni** (choose "register a new one" if it isn't in the list yet: it appears after the first build, or register it at developer.apple.com → Identifiers → + → App IDs, explicit, `lol.iamra.chladni`, no capabilities), SKU `chladni-fields-ios`, full access.
5. **GitHub secrets.** In the repo: Settings → Secrets and variables → Actions → New repository secret, four times:

   | Secret | Value |
   |---|---|
   | `APPLE_TEAM_ID` | the Team ID |
   | `ASC_KEY_ID` | the Key ID |
   | `ASC_ISSUER_ID` | the Issuer ID |
   | `ASC_KEY_P8` | the whole text of the `.p8` file, `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----` |

## Shipping a build

Actions → **iOS · build and upload** → Run workflow. About 15 minutes later the build shows in App Store Connect → TestFlight; Apple's processing adds 5–20 minutes. The build number is the workflow run number; the version comes from `package.json` (or the box on the Run workflow form).

Then in App Store Connect → the app → **1.0 Prepare for Submission**: paste the copy from `store/listing.md`, upload `store/screenshots/*.png`, pick the build, fill the privacy answers (no data collected), and **Add for Review**. First reviews take 1–3 days.

### If the archive step fails with a signing error

Cloud-managed distribution certificates need the API key to have the Admin role and the Account Holder to have accepted the current agreement. If your team can't use cloud signing, make a classic certificate once and add it as a secret:

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout dist.key -out dist.csr -subj "/CN=Chladni Fields/emailAddress=you@example.com"
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
npm run screenshots    # five App Store screenshots → store/screenshots
npm run fonts          # re-download the self-hosted fonts
```

## What differs from the website

- Fonts ship in the bundle; everything works offline.
- Microphone permission is the app's own (Settings → Chladni Fields → Microphone). The web-only "open in Safari" advice is not shown.
- Outside links open in an in-app Safari sheet with a Done button.
- The page keeps clear of the status bar and home indicator; the status-bar text follows the theme.
- iPhone only, portrait only. iPad support would need iPad screenshots and a landscape pass.
