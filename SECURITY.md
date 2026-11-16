# Security

## Reporting a problem

Found a security problem in Ledgro? Please email **getledgro@gmail.com** with what you found and how to reproduce it.
Do not post it in a public issue. We read every report and will reply as soon as we can.

Useful in a report: the screen or request involved, the steps, and what you expected to happen.

## What is protected

- **Sign-in is required.** Google sign-in, or username and password. The website signs people out after 3 days. The Android app stays signed in until you sign out.
- **Each shop's data is separate.** Firestore rules only let members of a shop read or write that shop's data, and rules limit what each role can do.
- **Bills keep a trail.** Invoice numbers must be the next number in sequence and are saved with the bill in one step. Voids, returns, discounts, payment changes, deletions, and price and stock edits are written to an activity log that nobody can edit. Only the owner can read it.
- **Input is checked on the server.** The rules check the shape and size of what is written, and list queries are limited in size.
- **Data in transit and at rest is encrypted** by the hosting and database provider.
- **Photos are cleaned.** Product photos are redrawn and saved as small images, so location and camera data from the phone are not kept.
- **The Android app** is signed with one release key, and Android backup of its data is turned off.
- **The build is guarded.** GitHub Actions are pinned to exact versions, signing secrets are never stored in the repository, and a manual build only runs on `main`.

## What is not protected (known limits)

We would rather say this plainly:

- **Staff can do a lot by design.** A member can change most of the shop's records. The activity log shows the owner what changed, but the rules do not stop it. Examples: a refunded amount on a bill and the day totals behind the Dashboard are not recomputed by the rules.
- **App Check is not enforced.** Requests to the database are limited by sign-in and rules, not by proof that they come from the official app.
- **Billing needs the internet.** It also reads the server's clock, so changing the phone's clock does not change a bill's time.
- **Anyone with a shop's invite code can join once.** Keep codes private, and remove members you no longer trust.

## Keeping your shop safe

- Use Google sign-in for the owner account where you can.
- Give staff their own sign-in. Do not share one login.
- Check the Activity log now and then.
- Keep the phone's screen lock on.
