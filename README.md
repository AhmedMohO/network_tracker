# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

### Family tracking setup

To enable family tracking (parent-child device sync), you need a Supabase project. The app's `app.json` includes placeholder values for the Supabase URL and anon key. The **anon key is a public client credential and is safe to commit** — it grants nothing without a valid pair token. However, the **service-role key must never enter this repository**. Before family sync features will work, apply `docs/family-schema.sql` in the Supabase SQL editor and schedule the `family_prune()` function to run daily.

## Privacy

Nothing leaves a device unless it is explicitly paired with another one (Settings → Family sharing). Pairing is opt-in on both sides — a parent shares a link or QR code, a child accepts it — and unpairing at any point deletes everything, from either side.

The two lists below are quoted **verbatim** from what the app itself ships — `family.whatIsShared` / `family.whatNeverLeaves` in `src/i18n/en.ts` — not paraphrased, and not from the original plan doc (`docs/plans/2026-08-19-family-tracking.md`'s own §Privacy list, which predates several fields the running code now sends and is out of date against it). If the two ever disagree, the strings in `src/i18n/en.ts` are correct and this section should be updated to match them — not the other way around.

**What is shared**, once a device is paired as a child (shown in-app on that device via the persistent, non-dismissible sharing banner → "Details", and in Settings under "Family sharing"):

> What is shared, once a day and a few times more often for today so far: the pairing code this device joined with, this device's id and label, and the day each set of figures covers; for every app that used data, its name, its Android package name, the id Android assigned it, and its download and upload byte totals, with everything past the 50 largest folded into a single combined total; the same figures again split into a mobile-data list and a Wi-Fi list; the coverage window Android reported them over when it differs from the one asked for; and — with each of today's more frequent updates — the time of that check-in, the package name of the app most recently in the foreground, this device's battery percentage, and whether it was on mobile data, Wi-Fi, or neither; and, when this device asks to raise its own local data alert level, the amount it asked for and the time of the request — and, once the paired device answers, the amount granted, which is zero when declined, and the time of that answer.

**What never leaves the device:**

> What never leaves this device: your location, Wi-Fi network name, browsing content, message content, and screen contents.

A few things that list implies but doesn't spell out:

- **No enforcement.** Nothing in this feature can block, pause, restrict, or otherwise limit another device's data use. A "data alert level" raised by a parent only changes when the *child's own device* chooses to warn *itself* — it is not a remote control.
- **No live monitoring.** Every figure the parent sees carries the check-in time it was true as of; nothing is a live feed, and a missing check-in is shown as "no check-in", never silently as zero usage.
- **Who can read the shared data:** anyone holding the pair token, a bearer secret sent once over the OS share sheet (or a scanned QR code) — treat it like a password. Unpairing rotates the token rather than merely forgetting it locally, so an old link stops working.
- **Retention:** shared rows are pruned automatically after 90 days. "Stop sharing and delete my data" (available from either side of a pairing) hard-deletes every row for that pairing immediately, not just locally.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
