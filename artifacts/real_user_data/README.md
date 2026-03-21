# AiBreaker — Real User Audit Results

Last updated: 2026-03-21 00:33 UTC

## Summary
| Metric | Value |
|--------|-------|
| Total audits | 10 |
| Errors / timeouts | 1 |
| Bot blocked | 1 |
| CAPTCHA hit | 0 |
| Avg score (non-blocked) | 46.2 |
| Classification accuracy | 0/5 |

## By Group
| Group | Runs | Bot blocked | CAPTCHA | Errors |
|-------|------|-------------|---------|--------|
| ecommerce | 2 | 0 | 0 | 0 |
| marketing | 4 | 0 | 0 | 0 |
| saas | 4 | 1 | 0 | 1 |

## Top Failure Patterns

| Pattern | Count |
|---------|-------|
| `action_resolution_failed` | 19 |
| `captcha_required` | 6 |
| `blocked_by_bot_protection` | 3 |
| `ecommerce / action_resolution_failed / add to cart button on listing page` | 2 |
| `saas / poll_timeout / ` | 1 |

## Last 10 Runs
| Name | Group | Score | Duration | Bot | Failure |
|------|-------|-------|----------|-----|---------|
| Grammarly | saas | 94 | 100s |  | action_resolution_failed |
| Tailwind | marketing | 100 | 84s |  | action_resolution_failed |
| AdvantageShop | ecommerce | 88 | 74s |  | action_resolution_failed |
| Prisma | marketing | 0 | 182s |  |  |
| Demoblaze | ecommerce | 88 | 126s |  | action_resolution_failed |
| Webex | saas | 94 | 68s | 🚫 | blocked_by_bot_protection |
| Framer | marketing | 0 | 10s |  |  |
| Miro | saas | 0 | 184s |  |  |
| Raycast | marketing | 0 | 182s |  |  |
| Slack | saas | None | 0s |  | poll_timeout |