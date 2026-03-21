# AiBreaker — Real User Audit Results

Last updated: 2026-03-21 07:58 UTC

## Summary
| Metric | Value |
|--------|-------|
| Total audits | 10 |
| Errors / timeouts | 0 |
| Bot blocked | 1 |
| CAPTCHA hit | 0 |
| Avg score (non-blocked) | 71.2 |
| Classification accuracy | 0/7 |

## By Group
| Group | Runs | Bot blocked | CAPTCHA | Errors |
|-------|------|-------------|---------|--------|
| ecommerce | 5 | 0 | 0 | 0 |
| marketing | 2 | 0 | 0 | 0 |
| saas | 3 | 1 | 0 | 0 |

## Top Failure Patterns

| Pattern | Count |
|---------|-------|
| `action_resolution_failed` | 19 |
| `captcha_required` | 6 |
| `ecommerce / action_resolution_failed / add to cart button on listing page` | 6 |
| `ecommerce / action_resolution_failed / open dashboard` | 6 |
| `saas / action_resolution_failed / pricing page link` | 4 |

## Last 10 Runs
| Name | Group | Score | Duration | Bot | Failure |
|------|-------|-------|----------|-----|---------|
| Wayfair | ecommerce | 78 | 96s |  |  |
| BookDepository | ecommerce | 78 | 80s |  | action_resolution_failed |
| Webex | saas | 94 | 64s | 🚫 | blocked_by_bot_protection |
| Demoblaze | ecommerce | 88 | 122s |  | action_resolution_failed |
| AutoExercise | ecommerce | None | 192s |  |  |
| Loom | saas | 90 | 133s |  |  |
| Grammarly | saas | 94 | 106s |  | action_resolution_failed |
| Temporal | marketing | 0 | 181s |  |  |
| Planetscale | marketing | 94 | 74s |  |  |
| LiteCart | ecommerce | 48 | 75s |  | action_resolution_failed |