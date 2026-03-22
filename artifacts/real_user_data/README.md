# AiBreaker — Real User Audit Results

Last updated: 2026-03-22 11:12 UTC

## Summary
| Metric | Value |
|--------|-------|
| Total audits | 2 |
| Errors / timeouts | 0 |
| Bot blocked | 0 |
| CAPTCHA hit | 0 |
| Avg score (non-blocked) | 91.0 |
| Classification accuracy | 0/2 |

## By Group
| Group | Runs | Bot blocked | CAPTCHA | Errors |
|-------|------|-------------|---------|--------|
| ecommerce | 2 | 0 | 0 | 0 |

## Top Failure Patterns

| Pattern | Count |
|---------|-------|
| `ecommerce / action_resolution_failed / add to cart button on listing page` | 36 |
| `action_resolution_failed` | 19 |
| `ecommerce / action_resolution_failed / login or sign in` | 11 |
| `ecommerce / http_429:{"detail":"Rate limit exceeded: 20 per 1 hour. Please slow down.","retry_after": / ` | 7 |
| `captcha_required` | 6 |

## Last 10 Runs
| Name | Group | Score | Duration | Bot | Failure |
|------|-------|-------|----------|-----|---------|
| Demoblaze | ecommerce | 86 | 129s |  | action_resolution_failed |
| SauceDemo | ecommerce | 96 | 81s |  | action_resolution_failed |