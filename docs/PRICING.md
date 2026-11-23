# DevFlow plans

This file is the product and API source of truth for the current access tiers. Quotas are enforced by API/storage code; hiding UI controls does not grant access.

| Tier | Run quota | History | Delete runs | Other supported features |
|---|---:|---|---|---|
| Demo | 10 per signed session and IP in its 24 hour lifetime | Temporary user and run records are removed lazily after expiry | No | Max concurrency 2; max duration 10 seconds |
| Free | 15 lifetime runs | Saved until normal retention policy applies | No | Standard targets, reports, history, and comparisons |
| Pro (`paid`) | 10,000 lifetime runs by default; configurable with `PAID_RUN_QUOTA` | Saved history and comparisons | Own runs | Benchmark campaigns and test duration up to the server's configured ceiling |
| Admin | No per-user lifetime/daily quota | Platform aggregates plus normal scoped history | Any saved run | User/plan management and all Pro features |

Razorpay Standard Checkout is integrated for a one-time Pro tier purchase when the operator configures server-side credentials and `UPGRADE_PLAN_PRICE_INR` (default example: ₹199). The server converts the configured INR price to paise, verifies the checkout signature, and confirms the captured payment, order amount, and account ownership with Razorpay before granting Pro. This is not recurring billing: subscriptions, renewal, cancellation, refunds, and payment webhooks are not implemented. Existing worker capacity and server-wide execution limits still apply to every account.

For local Razorpay test mode, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `UPGRADE_PLAN_PRICE_INR` in the ignored `.env` file. `RAZORPAY_PRO_AMOUNT_PAISE` remains available as a legacy fallback when the INR setting is absent. Keep the key secret server-side. Rotate any secret that has been pasted into chat, logs, or source control before using it.

The Billing & Plans page displays the supplied UPI QR as a manual payment option alongside Standard Checkout. QR scans do not currently create a verifiable DevFlow order or automatically activate Pro; an administrator must confirm the payment and update the account. Use Standard Checkout for automated verification and activation.

## Pre-pilot monetization hypothesis

This is a draft for user interviews, **not a validated pricing decision or an available hosted offer**. Phase 4 pilot feedback has not been collected, so no price, launch date, conversion estimate, or willingness-to-pay claim is set here.

| Possible offer | Hypothesized scope | Status |
|---|---|---|
| Free self-hosted core | Local or self-managed runner, HTTP workloads, CLI/GitHub Action, and run history under operator-configured limits | The open-source platform exists; current account quotas are listed above |
| Hosted team service | Managed history retention, shared team workspace, and CI regression alerts | Interview hypothesis only; hosting, alerts, and commercial terms are not being offered |

During the pilot, ask participating teams which parts they actually used, what they would keep self-hosted, whether shared history or alerts solve a recurring problem, and whether they would pay for a hosted option. Record answers verbatim with permission. Revisit this section only after those interviews; do not infer willingness to pay from repository usage alone.

The current `plan` and `tier` fields plus administrator tier controls provide the access model. Razorpay grants the existing Pro tier after a verified one-time payment; it does not provide subscription lifecycle management or establish a validated hosted-service offer.

OAuth requires configured GitHub or Google client credentials. If the verified provider email already belongs to a password account, DevFlow returns a conflict and requires the user to sign in with the existing method; it never silently links accounts. A dedicated user-confirmed linking flow is not currently provided.
