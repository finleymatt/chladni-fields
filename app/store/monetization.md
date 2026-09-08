# Free, Plus and the tip jar

The decisions, the Apple rules that shaped them, and the exact things to create in App Store Connect.

## The two rules that decide the shape

1. **Sign-in cannot be required.** App Review guideline 5.1.1(v): an app without significant account-based features must be usable without a login. Chladni Fields plays tones and draws plates; nothing in it needs an account, so a mandatory sign-in is a guaranteed rejection. Sign-in is therefore **optional**, lives in the You tab, and is framed honestly as "attaches your mixes and settings to you". Guideline 4.8: because Google sign-in is offered, **Sign in with Apple must be offered too** (it is, and it's listed first). Guideline 5.1.1(v) also requires an in-app way to delete the account: **Delete my data** in the You tab.
2. **Money for digital things goes through Apple.** Guideline 3.1.1: subscriptions, unlocks and tips to the developer are in-app purchases, never Stripe or PayPal links. Purchases are done with StoreKit 2 directly (no RevenueCat account needed); Apple takes 15% under the Small Business Program (enrol at developer.apple.com → Small Business Program once the Paid Apps agreement is active).

The consequence worth knowing: the Plus unlock is tied to the buyer's **Apple ID**, not to the optional account. That's the normal iOS model (Restore purchases brings it to another iPhone), and it's why Plus works even for people who never sign in.

## Tiers

| | Free | Chladni Plus |
|---|---|---|
| All 20 figures, both plates, microphone, Resonance Room, Law of One | ✓ | ✓ |
| All sleep sounds (rain, ocean, stream, wind, fire, summer night, fan, brown and pink noise), layered with any tone | ✓ | ✓ |
| Plays while the app is open; fade-out timers to 90 min | ✓ | ✓ |
| **Sleep mode:** keeps playing with the screen locked, lock-screen controls, timers to 8 h | – | ✓ |
| **Saved mixes** | 1 | unlimited |
| **Share plate stills** | with a small iamra.lol mark | clean |
| Supporter mark in You | – | ✓ |

Why these: sleep sounds are the one thing people leave running for hours, and nobody falls asleep with the screen on, so "keeps playing with the screen off" is the feature worth a dollar. The sounds themselves stay free so the app is genuinely useful (and reviewable) without paying: a free user hears rain for as long as the phone is awake, then the fade-out on lock is the honest nudge to Plus. The free tier stays exactly as generous as the website so nobody feels cheated; shares stay free because a watermarked share is marketing.

**The free trial lock.** A free user's first screen lock while sounds play hands the mix to the native player for up to 20 minutes (`cf:sleepTrial` records it); on return a sheet explains what just happened and offers Plus. After that, free fades out on lock and a toast offers Plus. The paywall carries a "Try it first" row until the trial is used.

**Products only reach the app once each one is "Ready to Submit".** StoreKit (sandbox and TestFlight included) returns nothing for a product in "Missing Metadata", and the usual missing piece is the App Review screenshot. `tools/asc-upload.js review-shots` uploads one to every product through the API.

### Prices and product IDs (create these in App Store Connect → the app → Subscriptions / In-App Purchases)

| Product | Type | Reference name | Product ID | Price |
|---|---|---|---|---|
| Plus monthly | Auto-renewable, group "Chladni Plus" | Plus Monthly | `lol.iamra.chladni.plus.monthly` | $0.99 / month |
| Plus yearly | Auto-renewable, same group, higher rank | Plus Yearly | `lol.iamra.chladni.plus.yearly` | $7.99 / year |
| Plus lifetime | Non-consumable | Plus Lifetime | `lol.iamra.chladni.plus.lifetime` | $14.99 |
| Tip · coffee | Consumable | Tip Small | `lol.iamra.chladni.tip.small` | $0.99 |
| Tip · lunch | Consumable | Tip Medium | `lol.iamra.chladni.tip.medium` | $2.99 |
| Tip · dinner | Consumable | Tip Large | `lol.iamra.chladni.tip.large` | $9.99 |

Each needs a display name and a one-line description (used in Apple's purchase sheet), and a review screenshot (any screenshot of the paywall). Optional: a 7-day free trial on the yearly plan as an introductory offer; the paywall shows it automatically.

Display names / descriptions to paste:
- Plus Monthly — "Chladni Plus" / "Sleep mode, unlimited saved mixes, clean shares."
- Plus Yearly — "Chladni Plus (yearly)" / same.
- Plus Lifetime — "Chladni Plus, forever" / same.
- Tips — "A coffee for the plates" / "A one-off thank-you. Nothing unlocks."

### Other one-time setup

- App Store Connect → Business → **Paid Apps Agreement**: sign it and enter bank + tax details. Nothing sells until it's active.
- developer.apple.com → Identifiers → the App ID → enable **Sign in with Apple** (the entitlement is in the project; automatic signing turns the capability on, but check it here if the archive complains).
- For Google sign-in: Google Cloud Console → Credentials → **OAuth client ID, type iOS**, bundle ID `lol.iamra.chladni` → copy the client ID (`xxxx.apps.googleusercontent.com`) into the GitHub secret `GOOGLE_IOS_CLIENT_ID`. Without it the app simply hides the Google button and offers Apple only.
- Test purchases with a **Sandbox tester** (App Store Connect → Users and Access → Sandbox) on a real iPhone via TestFlight before submitting.

## Ideas kept for later

- **Family Sharing** on the yearly and lifetime products (a checkbox in App Store Connect; the plugin already honours shared entitlements).
- **Sync**: the account is wired; a small backend (Supabase or CloudKit) would let mixes follow the user across devices and to the website.
- **Widgets / Live Activity** for the Resonance Room timer, **Shortcuts** ("Hey Siri, play my Wind down mix").
- **Plate video export** (a 10-second clip of the plate settling) as a Plus perk.
- A **pay-what-you-want** feel: the three tip sizes already do this without a slider, which Apple's purchase sheet can't show.
