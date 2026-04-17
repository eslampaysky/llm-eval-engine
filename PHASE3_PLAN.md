# Phase 3: Intelligence & Evaluation Quality

## Goal: Better Results, Not Better Execution

Phase 2 proved the engine works. Phase 3 focuses on making its **output useful**.

**Shift**: From "Did it work?" → To "Why did it work or fail?"

---

## Phase 3 Focus Areas (Priority Order)

### 1. ✅ Failure Intelligence (Highest ROI)

**Current**:
```
failure_type: "verification_failed"
failure_reason: ""
```

**Goal**: Rich diagnostics
```
failure_type: "verification_failed"
diagnostic: {
  "reason": "Add-to-cart button clicked but success signal not detected",
  "expected": "Cart item count to increment OR 'Added to cart' text to appear",
  "actual": "Cart item count unchanged, no confirmation text found",
  "evidence": [
    "Before: Cart count = 0",
    "After: Cart count = 0",  
    "Searched for: 'added', 'cart updated', 'success' — not found"
  ],
  "why_failed": "Site may require modal confirmation or page reload"
}
```

**Implementation**:
- Add `DiagnosticInfo` dataclass with structured fields
- Enhance StepResult to include diagnostic context
- Update all failure paths to populate diagnostics

---

### 2. ✅ LLM Observability (Medium ROI)

**Current**:
```
llm_used: false
```

**Goal**: Trace LLM decisions
```
llm_trace: {
  "llm_used": true,
  "model": "gemini-2.0-flash",
  "decision": "Verified cart state changed",
  "reasoning": "Visual analysis detected '2 items' in cart header",
  "confidence": 0.92,
  "input": "page_context",
  "prompt_tokens": 1824,
  "output_tokens": 142
}
```

**Implementation**:
- Add `LLMTrace` dataclass
- Capture LLM calls with model, reasoning, confidence
- Include in verification results

---

### 3. ✅ Decision Tracing (Medium ROI)

**Current**:
```
recovery_attempts: [...]
```

**Goal**: Explicit decision trace
```
decision_trace: [
  {
    "timestamp": 1234567890.12,
    "step": "search for add-to-cart",
    "phase": "action_resolution",
    "decision": "Try selector #addToCart first",
    "outcome": "Found",
    "confidence": 0.95
  },
  {
    "timestamp": 1234567891.05,
    "step": "verify cart state",
    "phase": "verification",
    "decision": "Check for 'item added' text",
    "outcome": "Not found",
    "confidence": 0.5,
    "fallback": "Check cart item count"
  }
]
```

**Implementation**:
- Add `DecisionTrace` dataclass
- Track each step's phase (action_resolution → action_execution → verification)
- Include confidence scores

---

### 4. ✅ Better Result Summaries (Lower ROI but good polish)

**Current**:
```
"Journey failed"
```

**Goal**: Actionable summary
```
"Cart interaction failed: Added product to cart but confirmation could not be verified. 
Searched text patterns 'added', 'success', 'cart updated' — none found. 
Likely cause: Modal dialog blocking view or page requires explicit submit. 
Recommendation: Check for overlay elements or additional form submission."
```

**Implementation**:
- Template-based summaries based on failure pattern
- Include recommendations
- Link to step evidence

---

### 5. ⏳ AI Evaluation Scoring (Phase 3b)

**Status**: Currently uses basic heuristics
**Goal**: ML-informed scoring

- Train light model on Pass/Fail patterns
- Improve false positive detection
- Score different app types appropriately

**Defer to Phase 3b** — Focus on diagnostics first.

---

## Implementation Order

1. **DiagnosticInfo** — Add to models.py
2. **Enhance verification** — Populate diagnostics in web_agent.py + agentic_qa.py
3. **LLMTrace** — Add to models.py, capture in gemini_judge.py
4. **DecisionTrace** — Add to models.py, track in web_agent.py
5. **Result summaries** — Helper function in agentic_qa.py
6. **Validation** — Update scripts/validate_phase2.py to show diagnostics

---

## Success Criteria

✅ Every failure includes rich diagnostic context (not just type code)
✅ LLM decisions are traceable with reasoning
✅ Result summaries are actionable
✅ User can understand "why" without reading code

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| "I know what failed" | 40% | 95% |
| "I know why it failed" | 10% | 80% |
| "I know what to fix" | 5% | 60% |

---

## Timeline

- **Diagnostics** (1-2 hours)
- **LLM Tracing** (30 mins)
- **Decision Tracing** (1 hour)
- **Result Summaries** (30 mins)
- **Validation** (15 mins)

**Total**: ~4 hours for Phase 3a baseline

---

## When to Defer to Phase 4

❌ ML-based scoring
❌ Automatic remediation suggestions
❌ Cross-site pattern learning
❌ Performance optimization

---
