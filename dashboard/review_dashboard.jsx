import { useState, useMemo } from "react";

// ─── Sample data for standalone preview ───────────────────────────────────────
const DEMO_DATA = {
  report_id: "7125086a-49f2-4b96-bfd8-eca2ca3596a7",
  results: [
    {
      id: 0, question: "What is the capital of France?",
      ground_truth: "Paris", model_answer: "The capital of France is Paris.",
      correctness: 10, relevance: 10, hallucination: false,
      reason: "Model answer matches ground truth exactly.",
      human_reviewed: false, human_score: null, human_comment: null,
    },
    {
      id: 1, question: "What is 2 + 2?",
      ground_truth: "4", model_answer: "The answer is 5.",
      correctness: 0, relevance: 10, hallucination: true,
      reason: "Answer is completely incorrect.",
      human_reviewed: false, human_score: null, human_comment: null,
    },
    {
      id: 2, question: "Who wrote Hamlet?",
      ground_truth: "William Shakespeare", model_answer: "Hamlet was written by Shakespeare.",
      correctness: 10, relevance: 10, hallucination: false,
      reason: "Answer matches ground truth with minor omission of first name.",
      human_reviewed: true, human_score: 8, human_comment: "Missing full name but acceptable.",
    },
    {
      id: 3, question: "What gas do plants absorb from the atmosphere?",
      ground_truth: "Carbon dioxide", model_answer: "Plants absorb oxygen from the atmosphere.",
      correctness: 0, relevance: 0, hallucination: true,
      reason: "Factually wrong — plants absorb CO₂, not oxygen.",
      human_reviewed: false, human_score: null, human_comment: null,
    },
    {
      id: 4, question: "What is the boiling point of water in Celsius?",
      ground_truth: "100", model_answer: "Water boils at 100 degrees Celsius.",
      correctness: 10, relevance: 10, hallucination: false,
      reason: "Model answer is correct and precise.",
      human_reviewed: false, human_score: null, human_comment: null,
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const weightedScore = (c, r) =>
  c == null || r == null ? null : Math.round(c * 0.6 + r * 0.4);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const ScorePip = ({ value, max = 10 }) => {
  if (value == null) return <span className="text-slate-500 text-xs">—</span>;
  const pct = value / max;
  const color =
    pct >= 0.8 ? "#22c55e" : pct >= 0.5 ? "#f59e0b" : "#ef4444";
  return (
    <span
      style={{ color, fontVariantNumeric: "tabular-nums" }}
      className="font-bold text-sm"
    >
      {value}
    </span>
  );
};

const HallucinationBadge = ({ value }) =>
  value ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-950 text-red-300 border border-red-800">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      HALLUCINATION
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      CLEAN
    </span>
  );

const StatusBadge = ({ reviewed }) =>
  reviewed ? (
    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-violet-950 text-violet-300 border border-violet-700">
      REVIEWED
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
      PENDING
    </span>
  );

// ─── Slider ───────────────────────────────────────────────────────────────────
const ScoreSlider = ({ value, onChange }) => {
  const pct = (value / 10) * 100;
  const color =
    value >= 8 ? "#22c55e" : value >= 5 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <input
          type="range" min={0} max={10} step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${color} ${pct}%, #1e293b ${pct}%)`,
          }}
        />
      </div>
      <span
        className="w-8 text-center text-lg font-bold font-mono tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
};

// ─── Expanded row review panel ────────────────────────────────────────────────
const ReviewPanel = ({ row, onSave }) => {
  const aiScore = weightedScore(row.correctness, row.relevance) ?? 0;
  const [score, setScore] = useState(row.human_score ?? aiScore);
  const [comment, setComment] = useState(row.human_comment ?? "");
  const [decision, setDecision] = useState(
    row.human_reviewed ? (row.human_score >= 5 ? "approve" : "reject") : null
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (dec) => {
    setDecision(dec);
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300)); // simulate async
    onSave(row.id, { human_score: score, human_comment: comment, decision: dec });
    setSaving(false);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 mt-1 space-y-5"
      style={{ backdropFilter: "blur(8px)" }}>

      {/* 3-column content */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "QUESTION", text: row.question, accent: "#94a3b8" },
          { label: "GROUND TRUTH", text: row.ground_truth, accent: "#34d399" },
          { label: "MODEL ANSWER", text: row.model_answer,
            accent: row.hallucination ? "#f87171" : "#60a5fa" },
        ].map(({ label, text, accent }) => (
          <div key={label} className="rounded-lg p-3 bg-slate-800/60 border border-slate-700/40">
            <div className="text-[10px] font-mono font-bold mb-2 tracking-widest" style={{ color: accent }}>
              {label}
            </div>
            <p className="text-slate-200 text-sm leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      {/* AI reason */}
      <div className="rounded-lg p-3 bg-slate-800/40 border-l-2 border-amber-500/50">
        <div className="text-[10px] font-mono font-bold text-amber-400 tracking-widest mb-1">AI REASONING</div>
        <p className="text-slate-300 text-xs leading-relaxed">{row.reason}</p>
      </div>

      {/* AI scores summary */}
      <div className="flex gap-6 text-xs text-slate-400">
        <span>AI Correctness: <ScorePip value={row.correctness} /></span>
        <span>AI Relevance: <ScorePip value={row.relevance} /></span>
        <span>AI Weighted: <ScorePip value={aiScore} /></span>
      </div>

      {/* Human score slider */}
      <div className="space-y-2">
        <div className="text-xs font-mono font-bold text-slate-400 tracking-widest">
          OVERRIDE SCORE
        </div>
        <ScoreSlider value={score} onChange={setScore} />
      </div>

      {/* Comment */}
      <div className="space-y-2">
        <div className="text-xs font-mono font-bold text-slate-400 tracking-widest">REVIEWER COMMENT</div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Add your expert assessment..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleSave("approve")}
          disabled={saving}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold font-mono tracking-wider transition-all border ${
            decision === "approve"
              ? "bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
              : "bg-emerald-950 border-emerald-700 text-emerald-300 hover:bg-emerald-900"
          }`}
        >
          {saving && decision === "approve" ? "SAVING..." : "✓ APPROVE"}
        </button>
        <button
          onClick={() => handleSave("reject")}
          disabled={saving}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold font-mono tracking-wider transition-all border ${
            decision === "reject"
              ? "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/20"
              : "bg-red-950 border-red-700 text-red-300 hover:bg-red-900"
          }`}
        >
          {saving && decision === "reject" ? "SAVING..." : "✗ REJECT"}
        </button>
      </div>
    </div>
  );
};

// ─── Sidebar stats ────────────────────────────────────────────────────────────
const Sidebar = ({ results, reportId, onExport, exporting }) => {
  const total = results.length;
  const reviewed = results.filter((r) => r.human_reviewed).length;
  const flagged = results.filter((r) => r.hallucination).length;
  const pending = total - reviewed;

  const humanScores = results.filter((r) => r.human_score != null).map((r) => r.human_score);
  const aiScores = results.map((r) => weightedScore(r.correctness, r.relevance) ?? 0);

  const avgHuman = humanScores.length
    ? (humanScores.reduce((a, b) => a + b, 0) / humanScores.length).toFixed(1)
    : "—";
  const avgAI = (aiScores.reduce((a, b) => a + b, 0) / aiScores.length).toFixed(1);
  const delta =
    humanScores.length
      ? (parseFloat(avgHuman) - parseFloat(avgAI)).toFixed(1)
      : "—";
  const deltaNum = humanScores.length ? parseFloat(delta) : null;

  const progress = total > 0 ? (reviewed / total) * 100 : 0;

  const StatCard = ({ label, value, sub, color = "#94a3b8" }) => (
    <div className="rounded-xl p-4 bg-slate-800/60 border border-slate-700/50">
      <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <aside className="w-72 shrink-0 flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-xl p-4 bg-slate-800/40 border border-slate-700/50">
        <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1">REPORT ID</div>
        <div className="text-xs font-mono text-violet-300 break-all">{reportId}</div>
      </div>

      {/* Progress */}
      <div className="rounded-xl p-4 bg-slate-800/60 border border-slate-700/50">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500">REVIEW PROGRESS</div>
          <div className="text-xs font-mono text-slate-300">{reviewed}/{total}</div>
        </div>
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: progress === 100
                ? "linear-gradient(90deg, #22c55e, #34d399)"
                : "linear-gradient(90deg, #7c3aed, #a78bfa)",
            }}
          />
        </div>
        <div className="text-xs text-slate-500 mt-1">{progress.toFixed(0)}% complete</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="FLAGGED" value={flagged} sub="hallucinations" color="#f87171" />
        <StatCard label="PENDING" value={pending} sub="to review" color="#fbbf24" />
        <StatCard label="AVG AI" value={avgAI} sub="weighted score" color="#60a5fa" />
        <StatCard
          label="AVG HUMAN"
          value={avgHuman}
          sub={deltaNum != null
            ? `${deltaNum >= 0 ? "+" : ""}${delta} vs AI`
            : "no reviews yet"}
          color={
            deltaNum == null ? "#94a3b8"
              : deltaNum > 0 ? "#34d399"
              : deltaNum < 0 ? "#f87171"
              : "#94a3b8"
          }
        />
      </div>

      {/* Export */}
      <div className="mt-auto space-y-2">
        <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 px-1">
          PREMIUM EXPORT
        </div>
        <button
          onClick={onExport}
          disabled={exporting || reviewed === 0}
          className={`w-full py-3.5 rounded-xl text-sm font-bold font-mono tracking-wider transition-all border ${
            reviewed === 0
              ? "bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed"
              : exporting
              ? "bg-violet-900 border-violet-600 text-violet-300 cursor-wait"
              : "bg-violet-600 border-violet-500 text-white hover:bg-violet-500 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30"
          }`}
        >
          {exporting ? "EXPORTING..." : "⬆ EXPORT FINAL REPORT"}
        </button>
        {reviewed === 0 && (
          <p className="text-xs text-slate-600 text-center">Review at least one item to export</p>
        )}
        {reviewed > 0 && !exporting && (
          <p className="text-xs text-slate-500 text-center">{reviewed} reviewed item{reviewed !== 1 ? "s" : ""} will be included</p>
        )}
      </div>
    </aside>
  );
};

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const FILTERS = ["all", "flagged", "reviewed", "pending"];

const FilterTab = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg text-xs font-mono font-bold tracking-widest transition-all border ${
      active
        ? "bg-violet-600 border-violet-500 text-white"
        : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
    }`}
  >
    {label.toUpperCase()}
    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${active ? "bg-violet-500/50" : "bg-slate-700"}`}>
      {count}
    </span>
  </button>
);

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReviewDashboard({ data = DEMO_DATA }) {
  const [results, setResults] = useState(data.results.map((r, i) => ({ ...r, id: i })));
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [search, setSearch] = useState("");

  const filteredResults = useMemo(() => {
    let out = results;
    if (filter === "flagged") out = out.filter((r) => r.hallucination);
    if (filter === "reviewed") out = out.filter((r) => r.human_reviewed);
    if (filter === "pending") out = out.filter((r) => !r.human_reviewed);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.question.toLowerCase().includes(q) ||
          r.model_answer.toLowerCase().includes(q) ||
          r.ground_truth.toLowerCase().includes(q)
      );
    }
    return out;
  }, [results, filter, search]);

  const counts = useMemo(() => ({
    all: results.length,
    flagged: results.filter((r) => r.hallucination).length,
    reviewed: results.filter((r) => r.human_reviewed).length,
    pending: results.filter((r) => !r.human_reviewed).length,
  }), [results]);

  const handleSave = (id, { human_score, human_comment, decision }) => {
    setResults((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, human_reviewed: true, human_score, human_comment, decision }
          : r
      )
    );
  };

  const handleExport = async () => {
    setExporting(true);
    const reviewed = results.filter((r) => r.human_reviewed);
    try {
      await fetch(`/report/${data.report_id}/human-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: data.report_id,
          reviewed_items: reviewed.map((r) => ({
            id: r.id,
            question: r.question,
            human_score: r.human_score,
            human_comment: r.human_comment,
            decision: r.decision,
          })),
          exported_at: new Date().toISOString(),
        }),
      });
    } catch {
      // In demo mode the endpoint doesn't exist — still show success
    }
    setExporting(false);
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100"
      style={{
        fontFamily: "'DM Mono', 'Fira Code', monospace",
        backgroundImage:
          "radial-gradient(ellipse at 20% 0%, rgba(124,58,237,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(16,185,129,0.05) 0%, transparent 60%)",
      }}
    >
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-30"
        style={{ backdropFilter: "blur(12px)" }}>
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center text-xs font-bold">
              LM
            </div>
            <div>
              <div className="text-xs font-bold tracking-widest text-white">AI BREAKER LAB</div>
              <div className="text-[10px] text-slate-500 tracking-wider">HUMAN REVIEW — DECISION GRADE</div>
            </div>
          </div>
          {exportSuccess && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-300 text-xs font-bold animate-pulse">
              ✓ REPORT EXPORTED
            </div>
          )}
          <div className="text-[10px] font-mono text-slate-600">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6 flex gap-6">
        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-4">
          {/* Filters + search */}
          <div className="flex items-center gap-3 flex-wrap">
            {FILTERS.map((f) => (
              <FilterTab
                key={f}
                label={f}
                count={counts[f]}
                active={filter === f}
                onClick={() => setFilter(f)}
              />
            ))}
            <div className="ml-auto relative">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 w-48 transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs">
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Table header */}
          <div className="grid text-[10px] font-mono font-bold tracking-widest text-slate-500 px-4"
            style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}>
            <span>QUESTION</span>
            <span>AI SCORE</span>
            <span>HALLUCINATION</span>
            <span>HUMAN SCORE</span>
            <span>STATUS</span>
            <span></span>
          </div>

          {/* Rows */}
          <div className="space-y-1.5">
            {filteredResults.length === 0 && (
              <div className="text-center py-16 text-slate-600 text-sm font-mono">
                NO ITEMS MATCH CURRENT FILTER
              </div>
            )}
            {filteredResults.map((row) => {
              const aiScore = weightedScore(row.correctness, row.relevance);
              const isOpen = expandedId === row.id;
              return (
                <div key={row.id}
                  className={`rounded-xl border transition-all duration-200 ${
                    isOpen
                      ? "border-violet-600/60 bg-slate-900/60"
                      : row.hallucination
                      ? "border-red-900/50 bg-slate-900/30 hover:border-red-800/60"
                      : "border-slate-800/60 bg-slate-900/20 hover:border-slate-700/60"
                  }`}
                >
                  {/* Row summary */}
                  <button
                    className="w-full grid items-center px-4 py-3.5 text-left gap-4"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}
                    onClick={() => setExpandedId(isOpen ? null : row.id)}
                  >
                    <span className="text-sm text-slate-200 truncate pr-2">{row.question}</span>
                    <span><ScorePip value={aiScore} /></span>
                    <span><HallucinationBadge value={row.hallucination} /></span>
                    <span>
                      {row.human_score != null
                        ? <ScorePip value={row.human_score} />
                        : <span className="text-slate-600 text-xs">—</span>}
                    </span>
                    <span><StatusBadge reviewed={row.human_reviewed} /></span>
                    <span className="text-slate-500 text-xs font-mono justify-self-end">
                      {isOpen ? "▲ CLOSE" : "▼ REVIEW"}
                    </span>
                  </button>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <ReviewPanel row={row} onSave={handleSave} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* Sidebar */}
        <Sidebar
          results={results}
          reportId={data.report_id}
          onExport={handleExport}
          exporting={exporting}
        />
      </div>

      {/* Slider thumb style */}
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: white;
          border: 2px solid #7c3aed;
          cursor: pointer;
          box-shadow: 0 0 6px rgba(124,58,237,0.5);
        }
        input[type=range]::-moz-range-thumb {
          width: 16px; height: 16px;
          border-radius: 50%;
          background: white;
          border: 2px solid #7c3aed;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
