"""
memory.py — Persistent run storage for Resume Tailor Agent.

Saves each run to memory/runs.json.
Loads past history to build a memory context string injected into the
system prompt before each new API call — giving the agent "intelligence
over time" without any external database.

Storage:  memory/runs.json  (auto-created on first save)
Max runs: 50 (FIFO — oldest are dropped when limit is hit)
"""

import json
import os
import re
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path

MEMORY_DIR = Path(__file__).parent / "memory"
RUNS_FILE  = MEMORY_DIR / "runs.json"
MAX_RUNS   = 50   # Rolling window — keeps the file small


# ── Internal I/O ──────────────────────────────────────────────────────────────

def _load_runs() -> list:
    """Load all saved runs from disk. Returns [] on any error."""
    if not RUNS_FILE.exists():
        return []
    try:
        with open(RUNS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_runs(runs: list):
    """Persist runs list to disk, capped at MAX_RUNS."""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    with open(RUNS_FILE, "w", encoding="utf-8") as f:
        json.dump(runs[-MAX_RUNS:], f, indent=2, ensure_ascii=False)


# ── Public API ────────────────────────────────────────────────────────────────

def save_run(run_data: dict) -> str:
    """
    Persist a new run.
    Adds a unique id and ISO timestamp automatically.
    Returns the run_id (8-char hex string).
    """
    run_id = str(uuid.uuid4())[:8]
    entry  = {
        "id":        run_id,
        "timestamp": datetime.now().isoformat(),
        "role":      run_data.get("role", "Unknown"),
        "ats_before": run_data.get("ats_before"),
        "ats_after":  run_data.get("ats_after"),
        "critical_gaps": run_data.get("critical_gaps", []),
        "rating":    None,   # set later via save_feedback()
    }
    runs = _load_runs()
    runs.append(entry)
    _save_runs(runs)
    return run_id


def save_feedback(run_id: str, rating: int):
    """
    Attach user feedback to an existing run.
    rating: +1 = thumbs up, -1 = thumbs down.
    """
    runs = _load_runs()
    for run in runs:
        if run.get("id") == run_id:
            run["rating"] = rating
            break
    _save_runs(runs)


def get_memory_context(n: int = 6) -> str:
    """
    Build a memory context block from the N most recent runs.
    Prioritises runs that have explicit feedback (rated first, then recency).
    Returns "" when there is no history so the caller can skip injection.

    The returned string is prepended to the system prompt so Claude sees
    past performance before processing the current JD + resume.
    """
    runs = _load_runs()
    if not runs:
        return ""

    # Prefer rated runs for richer context; fall back to plain recency
    rated  = [r for r in runs if r.get("rating") is not None]
    pool   = (rated if len(rated) >= 2 else runs)[-n:]

    lines  = [
        "## MEMORY CONTEXT — Resume Tailor Agent History",
        "The following data comes from past tailoring sessions.",
        "Use it to personalise the current run (style, gap emphasis, tone).\n",
    ]

    # ── Per-run summary ───────────────────────────────────────────────────────
    for r in reversed(pool):
        date_str  = r.get("timestamp", "")[:10]
        role      = r.get("role", "Unknown role")
        ats_b     = r.get("ats_before", "?")
        ats_a     = r.get("ats_after",  "?")
        rating    = r.get("rating")
        gaps      = r.get("critical_gaps", [])

        if rating == 1:
            sentiment = "  ✅ User approved"
        elif rating == -1:
            sentiment = "  ❌ User flagged for improvement"
        else:
            sentiment = ""

        lines.append(f"- [{date_str}] {role}  |  ATS {ats_b} → {ats_a}{sentiment}")
        if gaps:
            lines.append(f"  ↳ Critical gaps: {', '.join(gaps[:5])}")

    # ── Derived patterns from all feedback ────────────────────────────────────
    approved = [r for r in runs if r.get("rating") ==  1]
    flagged  = [r for r in runs if r.get("rating") == -1]

    if approved or flagged:
        lines.append("\n### Learned Patterns")

        if approved:
            gains = [
                r["ats_after"] - r["ats_before"]
                for r in approved
                if isinstance(r.get("ats_after"),  (int, float))
                and isinstance(r.get("ats_before"), (int, float))
            ]
            avg   = sum(gains) / len(gains) if gains else 0
            lines.append(
                f"- Approved runs: {len(approved)}  |  "
                f"Avg ATS gain on approved runs: +{avg:.0f} pts"
            )

        if flagged:
            all_gaps = [g for r in flagged for g in r.get("critical_gaps", [])]
            if all_gaps:
                top_gaps = [g for g, _ in Counter(all_gaps).most_common(4)]
                lines.append(
                    f"- Recurring unresolved gaps (from flagged runs): "
                    f"{', '.join(top_gaps)}"
                )
                lines.append(
                    "  → Address these more directly in bullet rewrites and the summary."
                )

    # ── Advisory footer ───────────────────────────────────────────────────────
    lines.append(
        "\n> Memory is advisory. Never let it override actual JD or resume content."
        " If context is irrelevant to the current role, ignore it."
    )

    return "\n".join(lines)


def extract_run_metadata(result: str) -> dict:
    """
    Parse Claude's markdown output to extract metadata for saving.
    Extracts: role, ATS before/after scores, critical gaps.
    All fields fall back gracefully if parsing fails.
    """
    meta: dict = {}

    # ── Role ──────────────────────────────────────────────────────────────────
    m = re.search(r"Target Role:\s*(.+)", result)
    meta["role"] = m.group(1).strip() if m else "Unknown"

    # ── ATS scores ────────────────────────────────────────────────────────────
    # Pattern 1: "Before: 46" / "After: 84" (most common from our ATS scorer)
    before_m = re.search(
        r"\b(?:Before|Original|Score Before)[^:\d]*[:\s]+(\d{2,3}(?:\.\d+)?)",
        result, re.IGNORECASE
    )
    after_m  = re.search(
        r"\b(?:After|Tailored|Score After|New Score)[^:\d]*[:\s]+(\d{2,3}(?:\.\d+)?)",
        result, re.IGNORECASE
    )

    # Pattern 2: fall back to last two "Total: XX" matches in the scorecard
    if not before_m or not after_m:
        totals = re.findall(r"(?:Total|Score)[:\s]+(\d{2,3}(?:\.\d+)?)", result, re.IGNORECASE)
        if len(totals) >= 2:
            before_m = before_m or type("_", (), {"group": lambda s, x: totals[0]})()
            after_m  = after_m  or type("_", (), {"group": lambda s, x: totals[-1]})()

    try:
        meta["ats_before"] = round(float(before_m.group(1))) if before_m else None
    except Exception:
        meta["ats_before"] = None

    try:
        meta["ats_after"] = round(float(after_m.group(1))) if after_m else None
    except Exception:
        meta["ats_after"] = None

    # ── Critical gaps ─────────────────────────────────────────────────────────
    # Look for GAP rows in the match matrix: "| Skill | Not mentioned | GAP |"
    gaps = re.findall(
        r"\|\s*([^|]+)\s*\|\s*(?:Not mentioned|Missing|No evidence|Absent)[^|]*\|\s*(?:❌\s*)?GAP",
        result, re.IGNORECASE
    )
    # Fallback: scan for "❌ GAP" rows and grab the requirement column
    if not gaps:
        gaps = re.findall(r"\|\s*([^|]{4,40})\s*\|\s*❌\s*GAP", result)

    meta["critical_gaps"] = [g.strip() for g in gaps[:6] if g.strip()]

    return meta
