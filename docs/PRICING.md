# DevFlow plans

This file is the product and API source of truth for the current access tiers. Quotas are enforced by API/storage code; hiding UI controls does not grant access.

| Tier | Run quota | History | Delete runs | Other supported features |
|---|---:|---|---|---|
| Demo | 10 per signed session and IP in its 24 hour lifetime | Temporary user and run records are removed lazily after expiry | No | Max concurrency 2; max duration 10 seconds |
| Free | 15 lifetime runs | Saved until normal retention policy applies | No | Standard targets, reports, history, and comparisons |
| Pro (`paid`) | 10,000 lifetime runs by default; configurable with `PAID_RUN_QUOTA` | Saved history and comparisons | Own runs | Benchmark campaigns and test duration up to the server's configured ceiling |
| Admin | No per-user lifetime/daily quota | Platform aggregates plus normal scoped history | Any saved run | User/plan management and all Pro features |

Paid plans are represented by the user `tier` and `plan` fields and can currently be changed by an administrator. No payment processor is connected. Stripe/Razorpay checkout, billing webhooks, cancellation, and subscription renewal are future work. Active worker capacity and server-wide execution limits still apply to every account.

## Pre-pilot monetization hypothesis

This is a draft for user interviews, **not a validated pricing decision or an available hosted offer**. Phase 4 pilot feedback has not been collected, so no price, launch date, conversion estimate, or willingness-to-pay claim is set here.

| Possible offer | Hypothesized scope | Status |
|---|---|---|
| Free self-hosted core | Local or self-managed runner, HTTP workloads, CLI/GitHub Action, and run history under operator-configured limits | The open-source platform exists; current account quotas are listed above |
| Hosted team service | Managed history retention, shared team workspace, and CI regression alerts | Interview hypothesis only; hosting, alerts, and commercial terms are not being offered |

During the pilot, ask participating teams which parts they actually used, what they would keep self-hosted, whether shared history or alerts solve a recurring problem, and whether they would pay for a hosted option. Record answers verbatim with permission. Revisit this section only after those interviews; do not infer willingness to pay from repository usage alone.

The current `plan` and `tier` fields plus administrator tier controls already provide a basic access-plan stub. They do not represent a subscription, entitlement contract, or payment flow. No billing integration is authorized by this draft.

OAuth requires configured GitHub or Google client credentials. If the verified provider email already belongs to a password account, DevFlow returns a conflict and requires the user to sign in with the existing method; it never silently links accounts. A dedicated user-confirmed linking flow is not currently provided.
