# POS Terminal Security

How RedBox stops a cashier signing in from a phone or a home PC.

## The model

Two things must line up before a sale can be rung:

| Layer | Question it answers | Who holds it |
|---|---|---|
| Device token | Which register is this? | The **computer**, in `localStorage` |
| Cashier sub-account | Who is on shift? | The **cashier**, username + password |

A manager or admin signs the machine in; the device token proves *which register*
the request came from. Registers do not have accounts of their own — that was tried
and removed, because it meant creating an email-backed Clerk account per store to
serve no purpose but to satisfy the auth provider.

A cashier only ever holds the second row. Their credentials do nothing on a device
that has no device token, so there is nothing to take home.

**Trade-off.** Because a person signs the machine in, the till holds whatever
privileges that account has. Sign registers in with a low-privilege account, not a
manager's, and use kiosk mode so nobody can navigate away from the POS.

## Enrolling a register

1. Manager opens **Branch → POS Terminals → Register Terminal**.
2. Enters a name (`Lane 1`) and the BIR terminal number (`01`), and generates a code.
3. Signed in on the register itself, open `/pos` and type the 8-character code.
4. The device stores a 256-bit token, issued once and never returned again.

Codes are single use and expire after 15 minutes. Redeeming one also requires a
valid staff session — a person is present anyway, so there is no reason for it to
be open.

Revoking a terminal from the same screen locks that device out immediately: its next
session request is refused and it falls back to the enrollment screen.

## Rolling it out without downtime

Device binding is gated behind an environment variable so registers can be enrolled
one at a time:

```
POS_REQUIRE_TERMINAL=true
```

Set it on the **Convex deployment** (Settings → Environment Variables), not in
`.env.local` — the check runs in Convex functions.

Order of operations:

1. Deploy. Binding is off. Unenrolled registers show the enrollment screen with a
   **Skip for now** button, so they keep trading while you work through the estate.
2. Enroll each register from Branch → POS Terminals.
3. Confirm each one shows a **Last used** timestamp.
4. Set `POS_REQUIRE_TERMINAL=true`. The skip button disappears and unenrolled devices
   are refused.

Skipping step 3 will take unenrolled lanes offline the moment step 4 lands.

While the flag is off, an *unrecognised* token is still rejected — only a *missing*
token is tolerated. A revoked device can never fall back to working.

## Cashier accounts

Cashiers must **not** have their own Clerk logins. They get a `cashierAccounts`
record — username and password, no email, no Clerk identity — created under
Branch → Cashiers. It only works at the ShiftGate, on an enrolled register.

If you have existing cashier Clerk accounts for real people, deactivate them. While
they exist, a cashier can sign in from anywhere and the model is bypassed.

## Kiosk mode (Windows Assigned Access)

Device binding stores its token in `localStorage`, which someone with access to the
browser's developer tools could read and copy. Kiosk mode removes that access, and
takes about 30 minutes per machine.

**Setup:**

1. Create a dedicated local Windows account on the register (e.g. `POS`), standard
   user, no admin rights.
2. **Settings → Accounts → Other users → Set up a kiosk**.
3. Choose the browser, and set the start URL to the POS address.
4. Sign in as that account. Windows boots straight into the POS full screen — no
   desktop, no address bar, no other apps.

**Also do:**

- Set the register to auto-sign-in to the `POS` account on boot, so a power cut
  brings the lane back without a manager.
- Keep the Windows admin password with the manager, never on the floor.
- Disable USB storage via Group Policy if the machine is unattended.

**Exiting kiosk mode:** Ctrl+Alt+Del → sign out → sign in as the admin account.

## What is deliberately not enforced

- **IP allowlisting.** Branch internet connections use dynamic IPs that change on
  every modem reboot, so this locks out cashiers mid-shift while stopping nobody who
  is already inside the store. Session IPs are worth logging for audit; they are not
  worth blocking on.
- **GPS geofencing.** Desktop PCs have no GPS and locate by IP, often wrongly by tens
  of kilometres. The permission can also simply be denied.

## Related security properties

- Cashier passwords use PBKDF2-SHA512 (210,000 iterations). Accounts created before
  this are upgraded from the old SHA-256 hash automatically on next login — no reset
  needed.
- Five failed logins lock an account for 15 minutes. A manager password reset clears
  the lockout immediately.
- `verifyCashierLogin` requires an authenticated staff session and derives the branch
  from it. The branch is never accepted from the client.
- Shifts record `terminalId`, so every transaction traces to a physical register.
