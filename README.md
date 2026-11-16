<div align="center">
  <img src="public/pwa-512x512.png" alt="Ledgro logo" width="96"/>

  <h1>Ledgro</h1>

  <p><b>Billing, ledger, stock and expenses for footwear shops. Works in the browser and as an Android app.</b></p>
</div>

---

## Overview

Ledgro is a point-of-sale and bookkeeping app for footwear shops: billing, ledger, expenses, products, stock and staff accounts. It runs as a web app (installable PWA) and as a signed Android app.

Live app: <https://ledgro-app.pages.dev>

> [!NOTE]
> Billing needs an internet connection by design. A bill is only shown as saved after the server has accepted it.

---

## Table of Contents

- [Features](#features)
- [Install](#install)
- [Printing receipts](#printing-receipts)
- [Security](#security)
- [Build from source](#build-from-source)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Contributing](#contributing)

---

## Features

<details>
<summary><b>Billing</b></summary>
<br>

- Checkout with Cash, UPI or Split payments, and a final-total override for discounts.
- **Processing and success screens**, then the bill preview. The bill is real and server-confirmed before success shows.
- **Share or save the receipt** as PNG or PDF. In the Android app this opens the phone's own share sheet.
- **Hold and resume** a cart, and edit or void a past bill.
- **Returns and exchanges** against an old bill.
- **Sequential invoice numbers** per financial year, enforced by the database rules.

</details>

<details>
<summary><b>Products and stock</b></summary>
<br>

- **Variants** for size and colour, with one photo per colour shared by all its sizes.
- **Photos**: take or pick, then move, zoom and rotate to crop. Saved as a small square image with location and camera data removed.
- **Stock counts**, low-stock alerts, and stock moved between shops (transfers).
- **Import and export** the catalog as a file.

</details>

<details>
<summary><b>Money and reports</b></summary>
<br>

- **Dashboard** with net earnings, sales, expenses, bill count, a 7-day chart, expected cash and UPI.
- **Close the register** by counting the drawer.
- **Expenses** by category, and **staff cash** (advances and settling up).
- **Statistics** by day, week or month, as PDF.
- **Reports** as PDF: best sellers (by product, colour or size), stock that is not selling, stock value, staff sales and returns.

</details>

<details>
<summary><b>Team and control</b></summary>
<br>

- **Owner and staff** accounts, joined with a one-time invite code.
- **Activity log** (owner only): voids, returns, discounts, payment changes, deletions, and price and stock edits. Entries cannot be edited. Searchable, filterable and exportable as PDF.
- **Dark and light themes**, set during first-time setup.

</details>

<details>
<summary><b>Android app</b></summary>
<br>

- Native Google sign-in, Android Back button that closes sheets before leaving a screen, and a splash screen.
- Stays signed in until you sign out (the website signs out after 3 days).
- Camera permission is asked once when you take a product photo.

</details>

---

## Install

**Android:** download the latest signed APK from the [Releases page](https://github.com/ledgro/Ledgro-app/releases/latest). Android may show a Play Protect scan prompt for apps installed outside the Play Store. Choose "Install without scanning" if you trust the source.

**Web or iPhone:** open <https://ledgro-app.pages.dev> in the browser and use "Add to Home Screen".

---

## Printing receipts

Ledgro does not talk to printers directly. Install the free **RawBT** app, pair your Bluetooth (or USB, or Wi-Fi) thermal printer in it, then use Share on the receipt and pick RawBT.

---

## Security

Sign-in is required and Firestore rules separate each shop's data. [SECURITY.md](SECURITY.md) lists what the rules and the app do, what they do not, and how to report a problem.

---

## Build from source

You need Node 22 or newer.

```bash
git clone https://github.com/ledgro/Ledgro-app.git
cd Ledgro-app
npm ci
npm run dev        # local web app
npm test           # unit tests
npm run build      # production build into dist/
```

Firestore rules tests need the Firebase emulator and run in CI:

```bash
npm run test:rules
```

<details>
<summary><b>Android app</b></summary>
<br>

The Android app is a [Capacitor](https://capacitorjs.com) project in `android/`. It is built by GitHub Actions (`.github/workflows/release-android.yml`):

- Push a tag such as `v5.0.1` to build a signed APK and attach it to a GitHub Release.
- Or run the workflow by hand on `main` for a 7-day APK download.

The build needs these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `GOOGLE_SERVICES_JSON_BASE64` (the Firebase config for Google sign-in). None of them are stored in the repository.

To build locally you also need the Android SDK and JDK 21:

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

</details>

---

## Tech stack

- **App:** React, Vite, Tailwind CSS v4, React Router, Framer Motion
- **Backend:** Firebase Authentication and Cloud Firestore, with security rules in `firestore.rules`
- **Android:** Capacitor 8
- **Hosting:** Cloudflare Pages
- **PDF:** jsPDF (loaded only when you export)
- **Tests:** Vitest

---

## Project layout

```
src/pages        one file per screen
src/components   shared UI (sheets, cards, crop and photo preview)
src/lib          business logic: stats, reports, audit log, native helpers
src/context      sign-in and shop state
firestore.rules  database access rules
android/         Capacitor Android project
.github          CI, rules deploy and APK release workflows
```

---

## Contributing

Open an issue before a large change. Run `npm test` and `npm run build` before opening a pull request. For security problems, do not open a public issue: see [SECURITY.md](SECURITY.md).
