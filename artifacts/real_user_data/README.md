# AiBreaker — Real User Audit Results

Last updated: 2026-03-21 06:10 UTC

## Summary
| Metric | Value |
|--------|-------|
| Total audits | 10 |
| Errors / timeouts | 0 |
| Bot blocked | 1 |
| CAPTCHA hit | 0 |
| Avg score (non-blocked) | 69.8 |
| Classification accuracy | 0/7 |

## By Group
| Group | Runs | Bot blocked | CAPTCHA | Errors |
|-------|------|-------------|---------|--------|
| ecommerce | 2 | 1 | 0 | 0 |
| marketing | 5 | 0 | 0 | 0 |
| saas | 3 | 0 | 0 | 0 |

## Top Failure Patterns

| Pattern | Count |
|---------|-------|
| `action_resolution_failed` | 19 |
| `captcha_required` | 6 |
| `ecommerce / action_resolution_failed / add to cart button on listing page` | 4 |
| `blocked_by_bot_protection` | 3 |
| `ecommerce / action_resolution_failed / open dashboard` | 3 |

## Last 10 Runs
| Name | Group | Score | Duration | Bot | Failure |
|------|-------|-------|----------|-----|---------|
| TLDraw | marketing | 94 | 74s |  | action_resolution_failed |
| Railway | marketing | 0 | 184s |  |  |
| Sephora | ecommerce | 90 | 69s | 🚫 | blocked_by_bot_protection |
| Tailwind | marketing | 100 | 85s |  | action_resolution_failed |
| Airtable | saas | 90 | 121s |  |  |
| Zapier | saas | 90 | 138s |  |  |
| Webflow | marketing | 0 | 185s |  |  |
| Planetscale | marketing | 90 | 74s |  |  |
| Mailchimp | saas | None | 205s |  |  |
| SauceDemo | ecommerce | 94 | 79s |  | action_resolution_failed |