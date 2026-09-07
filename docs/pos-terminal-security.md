# POS Terminal Security

How RedBox stops a cashier signing in from a phone or a home PC.

## The model

Two things must line up before a sale can be rung:

| Layer | Question it answers | Who holds it |
|---|---|---|
| Device token | Which register is this? | The **computer**, in `localStorage` |
| Cashier sub-account | Who is on shift? | The **cashier**, username + password |

**Nobody ever types an email address at the till.** The register's Clerk session is
obtained from its device token, not from a person. `TerminalSessionGate` exchanges
the token for a short-lived Clerk sign-in ticket and redeems it silently, on first
boot and every time the session later lapses — so a lane comes back on its own after
a reboot or a power cut.

A cashier only ever holds the second row. Their credentials do nothing on a device
that has no device token, so there is nothing to take home.

## Enrolling a register

**Prerequisite:** one Clerk account per register, created by an admin under
Admin → Users with role `cashier` and assigned to the branch (e.g. "Lane 1 — Makati").
The register signs in as this account by itself. No person needs its password.

1. Manager opens **Branch → POS Terminals → Register Terminal**.
2. Enters a name (`Lane 1`), the BIR terminal number (`01`), and picks which account
   the register signs in as.
3. On the register itself, open `/pos`. With no session and no token it shows the
   enrollment screen. Type the 8-character code.
4. The device stores a 256-bit token and signs itself in immediately. The token is
   issued once and never returned again.

Codes are single use and expire after 15 minutes. The code is the only credential
needed at step 3 — that is deliberate, since a fresh register has no session yet.

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

## Terminal accounts vs cashier accounts

Cashiers must **not** have their own Clerk logins. Each register gets one Clerk
account, and nobody ever signs into it by hand:

| | Clerk account | Cashier sub-account |
|---|---|---|
| Belongs to | The register | The person |
| Example | `lane1.makati@…` | `jdelacruz` |
| Signed in by | The device token, automatically | The cashier, each shift |
| Signs out | Never | End of every shift |
| Managed in | Admin → Users | Branch → Cashiers |

Because the register authenticates from its device token, the terminal account's
password is never typed on the shop floor. Set a long random one, store it in a
password manager, and do not enable Google sign-in for it — the account must belong
to the business, not to an employee.

If you have existing cashier Clerk accounts for real people, deactivate them once
their branch is on terminal accounts. While they exist, a cashier can still sign in
from anywhere and the whole model is bypassed.

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

## Why `/pos` is a public route in middleware

`middleware.ts` lets `/pos` through without a session, because a register must be
able to reach the enrollment and self-sign-in screens before it has one. This does
not weaken access control — middleware is routing-only by design in this codebase
(see the comment in `middleware.ts`), and every POS Convex function still runs
`requireRole` / `withBranchScope` plus terminal binding. The layout also redirects
any signed-in user whose role is not a POS role.

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
