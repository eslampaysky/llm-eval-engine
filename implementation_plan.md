# AiBreaker Pivot — Implementation Plan

Pivot AiBreaker from "breaking AI models" to "breaking AI-built apps." The core product becomes a Reliability Layer for the AI-Built Web: paste a URL, get a 0–100 score, a list of bugs with fix prompts, and—on deeper tiers—video replay of what failed.

## Proposed Changes

### Core Engine

#### [MODIFY] [web_agent.py](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/core/web_agent.py)

Upgrade the Playwright crawler to capture **two viewport screenshots** (desktop 1280px + mobile 390px), collect **console errors** (already done), and log **failed network requests** (new). Keep video recording. Add a `user_journeys` parameter for Deep/Fix tiers that takes a list of `{action, selector, value}` steps and executes them in the browser.

Key changes:
- Desktop screenshot at 1280×720, mobile screenshot at 390×844
- Register `page.on("requestfailed")` to collect broken assets/APIs
- New `run_user_journeys(page, journeys)` helper that clicks/fills/submits
- Return `desktop_screenshot_b64`, `mobile_screenshot_b64`, `failed_requests` alongside existing fields

---

#### [NEW] [gemini_judge.py](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/core/gemini_judge.py)

Replace Claude with **Gemini 1.5 Flash** (free tier via `google-generativeai` SDK, already in `requirements.txt`). Sends desktop + mobile screenshots as inline images with a structured prompt asking for:

```json
{
  "score": 0-100,
  "confidence": 0-100,
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "layout|functionality|accessibility|performance|content",
      "title": "...",
      "description": "...",
      "fix_prompt": "exact prompt to paste into Lovable/Bolt.new"
    }
  ],
  "summary": "2-sentence plain-English summary"
}
```

Uses `GEMINI_API_KEY` env var. Falls back gracefully if the key is missing.

---

#### [NEW] [agentic_qa.py](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/core/agentic_qa.py)

Orchestrator that ties the crawler + judge together with tier logic:

| Tier | Name | What it does | Target time |
|------|------|-------------|------------|
| `vibe` | Vibe Check | Desktop+mobile screenshots → Gemini visual scan → top 3 bugs | ~30s |
| `deep` | Deep Dive | Full crawl + user journeys + video → Gemini analysis → all findings | ~60-90s |
| `fix` | Fix & Verify | Deep Dive + Groq/Llama code analysis → bundled fix prompt | ~90-120s |

Core function: `run_agentic_qa(url, tier, journeys=None) -> AgenticQAResult`

Score computation: starts at 100, deducts based on severity×count. A "bundled fix prompt" concatenates all individual fix prompts with numbered instructions.

---

#### [MODIFY] [web_judge.py](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/core/web_judge.py)

Add a `code_analysis_prompt(findings, crawl_data)` function used by the Fix tier. This calls Groq/Llama 3.3 to generate code-level fix suggestions and produces the unified bundled fix prompt. The existing `judge_web_audit` and `infer_spec` functions remain for backward compatibility.

---

### API Layer

#### [MODIFY] [models.py](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/api/models.py)

Add new Pydantic models:

```python
class AgenticQAStartRequest(BaseModel):
    url: str
    tier: Literal["vibe", "deep", "fix"] = "vibe"
    journeys: list[dict[str, Any]] | None = None

class AgenticQAFinding(BaseModel):
    severity: str
    category: str
    title: str
    description: str
    fix_prompt: str
    confidence: int | None = None

class AgenticQAResult(BaseModel):
    audit_id: str
    status: str
    url: str
    tier: str
    score: int | None = None
    confidence: int | None = None
    findings: list[AgenticQAFinding] | None = None
    summary: str | None = None
    bundled_fix_prompt: str | None = None
    video_url: str | None = None
    desktop_screenshot_url: str | None = None
    mobile_screenshot_url: str | None = None
    created_at: str
```

---

#### [MODIFY] [database.py](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/api/database.py)

Add `agentic_qa_reports` table and CRUD helpers:

```sql
CREATE TABLE IF NOT EXISTS agentic_qa_reports (
    audit_id        TEXT PRIMARY KEY,
    client_name     TEXT,
    url             TEXT,
    tier            TEXT,
    status          TEXT NOT NULL DEFAULT 'queued',
    score           INTEGER,
    confidence      INTEGER,
    findings_json   TEXT,
    summary         TEXT,
    bundled_fix     TEXT,
    video_path      TEXT,
    desktop_ss_b64  TEXT,
    mobile_ss_b64   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
)
```

Plus: `insert_agentic_qa_report`, `update_agentic_qa_status`, `finalize_agentic_qa_success`, `finalize_agentic_qa_failure`, `get_agentic_qa_row`.

---

#### [MODIFY] [routes.py](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/api/routes.py)

Add two new routes (following the existing web-audit pattern):

- `POST /agentic-qa/start` — accepts `AgenticQAStartRequest`, creates DB row, enqueues background job
- `GET /agentic-qa/status/{id}` — returns `AgenticQAResult` with findings, score, video URL, screenshots

Plus a background job `_run_agentic_qa_job` that calls `run_agentic_qa()` from the orchestrator.

---

### Dashboard

#### [NEW] [VibeCheckPage.jsx](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/dashboard/review-dashboard/src/pages/app/VibeCheckPage.jsx)

The new hero page of the product. Design:

1. **Hero section**: "Does your AI-built app actually work?" tagline + URL input + tier selector (3 pills: Vibe / Deep / Fix)
2. **Score ring**: animated SVG circle (0–100), color transitions green→amber→red
3. **Confidence badge**: `85% confident` pill
4. **Findings list**: cards with severity badge, title, description, expandable fix prompt with one-click copy
5. **"Copy All Fix Prompts"** button: concatenates all fix prompts into a numbered list
6. **Video replay panel**: `<video>` element (only shown for Deep/Fix tier)
7. **Desktop vs. Mobile toggle**: shows the two screenshots side-by-side

Design system: Uses existing CSS variables (`--bg0`, `--accent`, `--green`, `--red`, etc.) for consistency with the current dark theme.

---

#### [MODIFY] [api.js](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/dashboard/review-dashboard/src/services/api.js)

Add API methods:
- `startAgenticQA(body)` → `POST /agentic-qa/start`
- `getAgenticQAStatus(id)` → `GET /agentic-qa/status/{id}`

---

#### [MODIFY] [router/index.jsx](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/dashboard/review-dashboard/src/router/index.jsx)

Add route: `{ path: 'vibe-check', element: <VibeCheckPage /> }`

Make it the **default landing** in the app layout (`/app` → `/app/vibe-check`).

---

#### [MODIFY] [layouts/AppLayout.jsx](file:///c:/Users/EslamSamy/.gemini/antigravity/playground/charged-kuiper/dashboard/review-dashboard/src/layouts/AppLayout.jsx)

Add "Vibe Check" to the sidebar navigation at the top with a prominent icon, making it the primary action.

---

## Verification Plan

### Automated Tests

**Backend test** — Run via `python -m pytest tests/ -v --tb=short`:

Add a new test in `tests/test_routes.py`:
- `test_agentic_qa_start` — POST `/agentic-qa/start` with `url` + `tier=vibe`, assert 202 + `audit_id` returned, mock `enqueue_job`
- `test_agentic_qa_status_not_found` — GET `/agentic-qa/status/fake-id`, assert 404

These follow the same pattern as the existing `test_break_endpoint` which mocks `enqueue_job`.

### Browser Verification

Using the browser tool:
1. Start the frontend dev server (`npm run dev` in `dashboard/review-dashboard`)
2. Navigate to `http://localhost:5173/app/vibe-check`
3. Verify the page renders with URL input, tier selector, and "Run Audit" button
4. Take a screenshot to confirm the UI looks correct

### Manual Verification (optional, by user)

> [!IMPORTANT]
> Full end-to-end testing requires a running PostgreSQL instance and valid `GEMINI_API_KEY`. The user should:
> 1. Set `DATABASE_URL` and `GEMINI_API_KEY` in `.env`
> 2. Run `python -m uvicorn api.main:app --port 8000`
> 3. Paste a URL (e.g. `https://example.com`) into the Vibe Check page
> 4. Confirm a score + at least one finding appears within 60 seconds
