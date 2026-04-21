import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// THEORY MODULES  (from Agent-101-Teaching-Guide.md)
// ═══════════════════════════════════════════════════════════════════════════════

const THEORY_COLOR = "#0EA5E9";

const theoryModules = [
  // ── T1 ─────────────────────────────────────────────────────────────────────
  {
    id: "T1", badge: "🧠", duration: "5 min",
    title: "What Is an Agent?",
    sections: [
      {
        heading: "The Simple Definition",
        content: `An **agent** is an LLM that takes actions in a sequence — where the output of one step becomes the input of the next — to complete a goal that a single prompt cannot reliably do alone.

This is different from:
- A **prompt**: one call, one response, done
- A **chain**: fixed sequence, no shared context or decisions
- An **agent**: goal-driven sequence with internal decisions and self-checks

The word "agent" isn't magic. It just means the model can reason about its own intermediate outputs and correct them before producing a final result.`
      },
      {
        heading: "The Agent Spectrum",
        content: `\`\`\`
─────────────────────────────────────────────────────────────▶
     PROMPT               CHAIN                  AGENT
─────────────────────────────────────────────────────────────
"Summarize this."   "Extract → Translate → "Parse → Analyze →
                     Summarize."              Plan → Execute →
                                              Self-check → Output"

One LLM call.       Fixed sequence.          Goal-driven sequence
No decisions.       No context sharing.      with internal decisions.
\`\`\`

The Resume Tailor Agent sits firmly in the **Agent** column:
- Each skill's output flows into the next as context
- Step 3b has the model audit its own work before continuing
- The agent adapts its output if keyword overlap is below a threshold`
      },
      {
        heading: "What Makes This an Agent?",
        content: `Five properties that distinguish this agent from a fancy prompt:

**Sequential reasoning** — Each skill uses the output of the previous one. The bullet rewriter sees the parsed JD AND the gap analysis. A cold prompt doesn't have that context.

**Self-checking** — Step 3b: the orchestrator tells the model to audit its own bullets before proceeding. Count numbers, check for duplicate verbs. This is an internal correction loop.

**Conditional logic** — If keyword overlap < 30%, the agent issues a stretch-role warning. The output changes based on the data, not a fixed template.

**Structured output contract** — Each skill returns a defined schema the next skill consumes. This makes the pipeline reliable and testable.

**Goal decomposition** — One big ask ("tailor my resume") broken into 5 solvable sub-tasks, each with a clear success criterion.`
      }
    ]
  },

  // ── T2 ─────────────────────────────────────────────────────────────────────
  {
    id: "T2", badge: "🎯", duration: "5 min",
    title: "The Problem We're Solving",
    sections: [
      {
        heading: "Why Resumes Fail ATS Systems",
        content: `**75% of resumes are rejected by ATS before a human ever sees them.**

\`\`\`
You apply ──▶  ATS (Applicant Tracking System)  ──── 75% REJECTED
                           │                         before human sees it
                           │ What ATS scans for:
                           ▼
               • Exact keyword match
               • Skills section formatting
               • Quantified achievement bullets
               • Summary relevance to the role
\`\`\`

The ATS isn't reading for meaning. It's scanning for exact strings. This is the core insight the entire agent is built around. You can be the most qualified candidate in the pool and get filtered out for using "event streaming" instead of "Apache Kafka".`
      },
      {
        heading: "The Keyword Gap Problem",
        content: `\`\`\`
Job Description says:           Your Resume says:
─────────────────────           ─────────────────
"Apache Kafka"          ≠       "event streaming platform"
"cross-functional"      ≠       "worked with other teams"
"stakeholder alignment" ≠       "presented to managers"
"LTV optimization"      ≠       "improved customer retention"
\`\`\`

**ATS sees zero matches. Your resume is filtered out. You were qualified.**

This is why "write better" advice fails — the problem is not the quality of the writing. It's a mismatch between the exact strings the ATS scans for and the words you chose to describe the same experience. The solution is not better writing. The solution is exact string matching combined with quantified impact.`
      },
      {
        heading: "What the Agent Does",
        content: `\`\`\`
INPUT                    AGENT PIPELINE                 OUTPUT
──────                   ──────────────                 ──────
Job Description  ──▶     Parse → Gap → Rewrite   ──▶   Tailored Resume PDF
Current Resume   ──▶     → Summarize → Score     ──▶   Analysis Report PDF
                         (5 skills, ~30 seconds)

Before: 42/100 ATS score
After:  84/100 ATS score  (+42 points)
\`\`\`

The agent does not just find-and-replace keywords. It:
- **Understands** which skills you already have under different terminology (TRANSFERABLE)
- **Rewrites** bullets to embed keywords naturally with quantified impact
- **Generates** a targeted summary that leads with the recruiter's top priorities
- **Scores** the before/after result so you know the tailoring worked`
      }
    ]
  },

  // ── T3 ─────────────────────────────────────────────────────────────────────
  {
    id: "T3", badge: "✍️", duration: "10 min",
    title: "Prompt Engineering Fundamentals",
    sections: [
      {
        heading: "The Four Layers of a Good Prompt",
        content: `Every skill in this agent follows a 4-layer structure. Knowing this structure means you can debug any failing skill by identifying which layer broke.

\`\`\`
┌───────────────────────────────────────────────────────┐
│  LAYER 1: ROLE                                         │
│  "You are a [specific expert] who [specific goal]..."  │
│  → Sets persona, activates domain knowledge            │
├───────────────────────────────────────────────────────┤
│  LAYER 2: INPUT CONTRACT                               │
│  "You will receive: (1) ... (2) ..."                   │
│  → Tells the model exactly what to expect              │
├───────────────────────────────────────────────────────┤
│  LAYER 3: OUTPUT CONTRACT                              │
│  "Return your output as: ### Section / | Table | ..."  │
│  → Forces deterministic, parseable output              │
├───────────────────────────────────────────────────────┤
│  LAYER 4: CONSTRAINTS                                  │
│  "Never fabricate. Always quantify. Max 60 words..."   │
│  → Guards against hallucination and drift              │
└───────────────────────────────────────────────────────┘
\`\`\``
      },
      {
        heading: "Principles 1 & 2: Persona + Output Schema",
        content: `**Principle 1 — Persona Specificity**

❌ Weak: "You are an AI assistant. Help with resumes."
✅ Strong: "You are a resume optimization specialist who rewrites experience bullets to maximize JD relevance while preserving honesty and authenticity."

The model has seen millions of resumes written by actual specialists. Specificity activates that knowledge cluster.

---

**Principle 2 — Output Schema (the most important principle)**

Show the exact format as an example, don't just describe it:

\`\`\`markdown
1. ORIGINAL: "Built dashboards for the marketing team"
   REWRITTEN: "Designed 12 Tableau dashboards enabling marketing
               to track campaign ROI across 5 channels, cutting
               reporting time by 60%"
   CHANGES:   Added tool (Tableau), quantified (12, 5 channels),
              added impact (60%), matched keyword "campaign ROI"
\`\`\`

When the output format is shown as an example, the model mirrors it exactly. This makes downstream parsing reliable. **The output schema IS your API contract between skills.**`
      },
      {
        heading: "Principles 3–5: Rules, Separation, Constraints",
        content: `**Principle 3 — Enumerated Rules, Not Paragraphs**

❌ "Try to use keywords and make sure bullets have numbers and don't make things up..."
✅ Numbered list with a self-check instruction:
\`\`\`
- Every bullet MUST have at least one number — no exceptions
- After rewriting ALL bullets, count how many lack a number.
  If any remain, rewrite them before finalising.
\`\`\`

The self-check instruction triggers an internal audit loop. Without it, ~30% of bullets lack numbers. With it: near-zero. This is the line between a prompt and an agent behavior.

---

**Principle 4 — Separation of Concerns**

Each skill does ONE job. Gap analyzer doesn't rewrite bullets. Bullet rewriter doesn't score ATS. Same principle as software engineering — single responsibility makes each skill independently testable and improvable.

---

**Principle 5 — Negative Constraints Win**

"Never fabricate skills" > "be honest"
"Maximum 2 lines per bullet" > "keep bullets concise"
"Remove 'helped', 'assisted', 'various'" > "sound professional"

LLMs are trained to be agreeable. Negative constraints override that tendency more reliably than positive nudges.`
      }
    ]
  },

  // ── T4 ─────────────────────────────────────────────────────────────────────
  {
    id: "T4", badge: "🏗️", duration: "8 min",
    title: "Agent Architecture",
    sections: [
      {
        heading: "The Full Pipeline",
        content: `\`\`\`
USER INPUT
┌─────────────────┐    ┌─────────────────┐
│  Job Description │    │  Current Resume  │
└────────┬────────┘    └────────┬────────┘
         └──────────┬───────────┘
                    ▼
        ┌─────────────────────┐
        │    ORCHESTRATOR     │   ← resume_tailor_agent.md
        │  Chains 5 skills    │     Strict order, context flow,
        │  in strict order    │     final output format
        └──────────┬──────────┘
                   │
  ┌────────────────▼──────────────────────────┐
  │             SKILL PIPELINE                 │
  │                                            │
  │  SKILL 1: Parse JD                         │
  │    Input: Raw JD text                      │
  │    Output: Role, skills, ATS keywords      │
  │             ↓ passes structured context    │
  │  SKILL 2: Analyze Gaps                     │
  │    Input: Parsed JD + original resume      │
  │    Output: Match matrix, critical gaps     │
  │             ↓ passes gap analysis          │
  │  SKILL 3: Rewrite Bullets (STAR-K)         │
  │    Input: Bullets + JD + gap analysis      │
  │    Output: Every bullet quantified         │
  │             ↓ SELF-CHECK (Step 3b)         │
  │  SKILL 4: Generate Summary                 │
  │    Input: JD + bullets + gap analysis      │
  │    Output: 3 scored variants               │
  │             ↓ passes full context          │
  │  SKILL 5: Score ATS Compatibility          │
  │    Input: Original + tailored + parsed JD  │
  │    Output: Before/after scorecard          │
  └────────────────────────────────────────────┘
                   │
       ┌───────────▼──────────┐
       │  FINAL OUTPUT        │
       │  Structured Markdown │
       │  1,500–2,500 words   │
       └───────────┬──────────┘
                   │
     ┌─────────────▼─────────────┐
     │       app.py              │
     └──────┬───────────┬────────┘
            ▼           ▼
  Resume PDF       Analysis PDF
  (two-column)     (gap + ATS + next steps)
\`\`\``
      },
      {
        heading: "Why This Architecture?",
        content: `**Skills as .md files** — The intelligence lives in markdown. Non-engineers can improve the agent by editing text files. The pipeline logic and the domain knowledge are fully separated.

**Single API call** — All 5 skills run in ONE \`claude.messages.create()\` call. The orchestrator handles internal chaining. This means:
- ~$0.03 per run (not $0.15 for 5 separate calls)
- ~30 seconds total (not 2.5 min for 5 sequential round-trips)
- Context accumulates naturally inside the model's context window

**Strict ordering** — Each skill's output quality depends on the previous skill. The orchestrator says "STRICT ORDER — never skip or reorder" because changing the order breaks the quality chain.

**Single responsibility** — Each skill does exactly one job. This makes each skill independently testable: you can paste a parsed JD and raw resume into a direct gap analyzer call to debug it in isolation.`
      },
      {
        heading: "The Context Accumulation Principle",
        content: `This is the most powerful feature of the architecture. Context accumulates with every step:

\`\`\`
After Skill 1 (JD Parse):
  Model knows → role title, required skills, ATS keywords, hidden signals

After Skill 2 (Gap Analysis):
  Model also knows → what the resume has vs. doesn't
                   → which gaps to bridge vs. which to omit

After Skill 3 (Bullet Rewrite):
  Model also knows → every rewritten bullet with numbers verified
                   → no duplicate verbs (Step 3b passed)

By Skill 4 (Summary):
  Writing with FULL CONTEXT → the exact role + candidate's real
  strengths + gaps bridged + specific keywords to appear

By Skill 5 (ATS Score):
  Has both the original AND tailored resume + the parsed JD
  → can compute a true before/after comparison
\`\`\`

This is why parallel calls (5 separate API calls without shared context) produce worse output — each call starts cold. Context accumulation IS the value of the pipeline.`
      }
    ]
  },

  // ── T5 ─────────────────────────────────────────────────────────────────────
  {
    id: "T5", badge: "🔬", duration: "12 min",
    title: "Deep Dive: The 5 Skills",
    sections: [
      {
        heading: "Skill 1: JD Parser",
        content: `**Purpose:** Turn a messy, boilerplate-heavy job description into a clean, structured object every downstream skill can consume.

\`\`\`
RAW JD (messy)                      PARSED OUTPUT (structured)
──────────────                      ──────────────────────────
"About Us: We're disrupting         Role: Senior Data Analyst
fintech! Unlimited PTO, health,     Seniority: Senior
dental, 401k, dog-friendly          ATS Keywords: Python, SQL, dbt,
office, free lunch Fridays...         Snowflake, stakeholder, A/B
                                      testing, LTV, campaign ROI
We're looking for a Senior
Data Analyst with 5+ years          Hidden Signals:
Python, SQL, dbt, Snowflake..."     - Startup (scaling phase)
                                    - Small team (inferred)
                                    - High output expected
\`\`\`

**The critical constraint:** "Preserve exact keyword phrasing from JD — never synonym-swap."

ATS scans for the exact string "Snowflake". If your resume says "cloud data warehouse", it's zero ATS match even though it's the same concept. The entire downstream tailoring depends on Skill 1 preserving exact strings.`
      },
      {
        heading: "Skills 2 & 3: Gap Analyzer + Bullet Rewriter",
        content: `**Skill 2 — Gap Analyzer:** The honest career coach.

\`\`\`
│  Category  │  JD Requirement    │  Resume Evidence   │  Status      │
│  Technical │  Python 3+ years   │  "5 yrs Python"    │  ✅ MATCH    │
│  Technical │  Snowflake         │  Not mentioned     │  ❌ GAP      │
│  Technical │  SQL (advanced)    │  "Complex SQL..."  │  🟡 PARTIAL  │
│  Soft      │  Stakeholder mgmt  │  "Presented to VP" │  🔄 TRANSF.  │
\`\`\`

TRANSFERABLE requires: a justifiable connection in a 30-second explanation. This prevents the model from calling everything transferable just to be encouraging.

---

**Skill 3 — Bullet Rewriter (STAR-K):**

\`\`\`
STAR-K = Situation/Task + Action + Result + Keyword

BEFORE: "Built dashboards for the marketing team"

AFTER:  "Designed 12 Tableau dashboards enabling marketing
         to track campaign ROI across 5 channels, reducing
         reporting time by 60%"

Changes:  + Tool added (Tableau)         → ATS keyword hit
          + Count added (12)             → quantified output
          + Scale added (5 channels)     → shows scope
          + Impact (60%)                 → shows value
          + JD keyword ("campaign ROI")  → exact string match
\`\`\``
      },
      {
        heading: "Skills 4 & 5: Summary Generator + ATS Scorer",
        content: `**Skill 4 — Summary Generator:** Three variants, each scored.

\`\`\`
VARIANT A — Technical-heavy        Score: 72/100
"Python and SQL specialist with 5 years in analytical engineering..."
← Strong on tools, weak on business impact

VARIANT B — Impact-heavy           Score: 88/100  ← RECOMMENDED
"Data analyst who drove $2M in campaign efficiency gains by building
 a cross-channel attribution system..."
← Leads with result. Keywords embedded. Under 60 words.

VARIANT C — Domain-heavy           Score: 79/100
"Growth analytics specialist with deep expertise in D2C attribution..."
← Strong domain signal, weaker on specific impact
\`\`\`

**Key constraint:** "If over 60 words, cut from Sentence 2. Never cut the quantified achievement." — tells the model which element to protect when making trade-offs.

---

**Skill 5 — ATS Scorer:** Quantify the improvement.

\`\`\`
FORMULA:
  (0.5 × keyword%)  ← keyword match is the biggest ATS factor
+ (0.2 × skills%)   ← skills section completeness
+ (0.15 × summary)  ← summary relevance (0-100)
+ (0.15 × format)   ← formatting compliance (0-100)

BEFORE: 36% kw→18 + 50% sk→10 + summary 40→6 + format 85→12.75 = 46.75
AFTER:  82% kw→41 + 90% sk→18 + summary 88→13.2 + format 85→12.75 = 84.95
\`\`\``
      }
    ]
  },

  // ── T6 ─────────────────────────────────────────────────────────────────────
  {
    id: "T6", badge: "🎼", duration: "8 min",
    title: "The Orchestrator",
    sections: [
      {
        heading: "What the Orchestrator Does",
        content: `The orchestrator (\`resume_tailor_agent.md\`) is the **conductor**. It:
1. Tells the model which skills to run and in what order
2. Defines how context flows between skills
3. Specifies the EXACT output format for the final response
4. Enforces integrity constraints across the whole pipeline

\`\`\`markdown
## Workflow (STRICT ORDER — never skip or reorder)

### Step 1: Parse the JD
Run jd_parser skill on the raw JD.
Extract: role, seniority, required skills, ATS keywords.

### Step 2: Analyze Gaps
Run gap_analyzer with: parsed JD + original resume.

### Step 3: Rewrite Bullets
Run bullet_rewriter with: original bullets + ATS keywords + gap analysis.

### Step 3b: Self-Check Bullets (before moving on)
Verify: (1) every bullet has a number, (2) no duplicate opening
verbs within a role, (3) no verb appears more than twice across
all roles. Only proceed to Step 4 once all three checks pass.
\`\`\`

Notice Step 3b: **"Only proceed to Step 4 once all three checks pass."** This forces the model into an internal audit loop — the defining characteristic of agent behavior.`
      },
      {
        heading: "The Output Format as a Contract",
        content: `The most critical part of the orchestrator is the FINAL OUTPUT FORMAT. This is the API contract between the prompt and the code.

\`\`\`markdown
## Final Output Format
---
# RESUME TAILOR REPORT
## Target Role: [Title] at [Company]

### 1. TAILORED RESUME
**[CANDIDATE FULL NAME]**
[email] | [phone] | [LinkedIn]

**PROFESSIONAL SUMMARY**
[60 words max]

**EXPERIENCE**
**[Company]** — [Title] | [Dates]
- [STAR-K rewritten bullet]

### 2. GAP ANALYSIS
[Match matrix + critical gaps + strategies]

### 3. ATS SCORECARD
[Before/after formula breakdown]

### 4. NEXT STEPS
- [ ] Review rewritten bullets
---
\`\`\`

In \`app.py\`:
\`\`\`python
resume_section = _extract_section(result, "TAILORED RESUME")
generate_resume_pdf(resume_section)  # section 1 only → clean resume
generate_report_pdf(result)          # full result → sections 2-4
\`\`\`

If the orchestrator outputs \`## 1. Tailored Resume\` (lowercase, ## instead of ###), the parser fails and the resume PDF is blank. **Prompt engineering and software engineering are the same discipline.** Design the output format before you write the prompt body.`
      },
      {
        heading: "Context Accumulation in Practice",
        content: `By the time Skill 4 (summary generator) runs, Claude has:

\`\`\`
After Skill 1:  Role title, required skills, ATS keywords, hidden signals
After Skill 2:  What the resume has vs. doesn't — match %, critical gaps
After Skill 3:  Every bullet rewritten with keywords woven in
By Skill 4:     Writing a summary with FULL CONTEXT of role + candidate
\`\`\`

A summary written with this accumulated context is dramatically better than one written cold. This is why the pipeline exists — **each step earns the next step's quality**.

If you ran all 5 in parallel (one call each, no shared context):
- The summary wouldn't know which bullets were rewritten
- The ATS score wouldn't reflect actual changes made
- The bullet rewriter wouldn't know which specific gaps to bridge

Context accumulation IS the value. The pipeline is the product.`
      }
    ]
  },

  // ── T7 ─────────────────────────────────────────────────────────────────────
  {
    id: "T7", badge: "🐍", duration: "8 min",
    title: "Building the App",
    sections: [
      {
        heading: "The App in 3 Parts",
        content: `The entire \`app.py\` is 3 logical parts:

\`\`\`
Part 1: LOAD
  load_prompts()     → reads 6 .md files, returns one system prompt string
  @st.cache_data     → cached: only reads files once per session, not per click

Part 2: CALL
  claude.messages.create(system=..., messages=[{user: jd + resume}])
  max_tokens = 6000  → full report is ~2,500 words — never truncate
  result → st.session_state  → persists across reruns

Part 3: RENDER
  _extract_section(result, "TAILORED RESUME")  → split output
  generate_resume_pdf()    → two-column professional layout
  generate_report_pdf()    → analysis + scores + next steps
  st.download_button()     → two buttons, two files
\`\`\`

**The intelligence is in the prompts. The code is just plumbing.** If output quality is bad, the fix is in the .md files, not in app.py. If the PDF crashes, the fix is in app.py, not the prompts. Clean separation.`
      },
      {
        heading: "Key Patterns: Cache, Session State, max_tokens",
        content: `**\`@st.cache_data\` on load_prompts():**
Streamlit reruns the entire script on every user interaction. Without caching, you'd re-read 6 files from disk on every button click. \`@st.cache_data\` reads them once and stores the result in memory.

**\`st.session_state\`:**
Without it: User clicks "Tailor My Resume" → API call → result exists → user clicks "Download" → script reruns → result is gone.

With it:
\`\`\`python
# After API call
st.session_state["result"] = result
st.session_state.pop("resume_pdf", None)  # clear stale PDFs
st.session_state.pop("report_pdf", None)

# Before generating PDFs (don't regenerate on every rerender)
if "resume_pdf" not in st.session_state:
    st.session_state["resume_pdf"] = generate_resume_pdf(...)
    st.session_state["report_pdf"] = generate_report_pdf(...)
\`\`\`

**\`max_tokens = 6000\`:**
The full tailored report (resume + gap analysis + ATS scorecard + next steps) easily hits 2,500 words (~4,000+ tokens). Always set this explicitly. Truncated output = broken PDF with missing sections — a silent failure.`
      },
      {
        heading: "ReportLab & The LayoutError Fix",
        content: `You only need 6 concepts to build both PDFs:

\`\`\`python
SimpleDocTemplate     # creates the PDF file, manages auto-pagination
Paragraph             # renders styled text (bold, italic, color, size)
Table([[col1, col2]]) # one row, two cells → side-by-side columns
HRFlowable            # horizontal divider line
Spacer(1, N)          # N points of vertical whitespace
KeepInFrame           # scales content to fit — prevents crashes
\`\`\`

**The LayoutError problem:**
\`\`\`
reportlab.platypus.doctemplate.LayoutError:
  Flowable ... too large on page 1
\`\`\`

Cause: Table with ONE row is taller than a single page. ReportLab can split multi-row tables across pages, but NOT a single-row table.

**Fix — KeepInFrame(mode='shrink'):**
\`\`\`python
COL_H = letter[1] - 0.95*inch - 1.6*inch   # ~615pt available height

kif_l = KeepInFrame(LW, COL_H, left_fl,  mode='shrink')
kif_r = KeepInFrame(RW, COL_H, right_fl, mode='shrink')

body = Table([[kif_l, kif_r]], colWidths=[LW, RW])
\`\`\`

\`mode='shrink'\` scales column content proportionally to fit. For a standard 1-page resume, no shrinking happens. For edge cases (long resume, accidentally passing the full report), it shrinks gracefully instead of crashing.`
      }
    ]
  },

  // ── T8 ─────────────────────────────────────────────────────────────────────
  {
    id: "T8", badge: "💡", duration: "5 min",
    title: "Key Learnings",
    sections: [
      {
        heading: "The 5 Big Ideas",
        content: `**1 — Agents = sequential skills, not magic**
An agent is an LLM that calls itself multiple times, where each call gets richer context than the last. There's no magic — just well-designed prompts chained together.

**2 — Output format is everything**
If you can't parse the output, you can't build on top of it. Design your output schema BEFORE you write the prompt body. The output IS your API contract.

**3 — Constraints > Instructions**
"Never fabricate" works better than "be honest". Negative constraints override default model tendencies. Use them in every skill.

**4 — Self-checks turn prompts into agents**
Adding "audit your output before proceeding" triggers an internal correction loop. Without Step 3b, ~30% of bullets lack numbers. With it: near-zero.

**5 — Ship fast**
3 lines in requirements.txt. GitHub push. Streamlit deploy. You can go from prompt to live product in under 1 hour. The bottleneck is always prompt design, never infrastructure.`
      },
      {
        heading: "The Reusable Agent Template",
        content: `This pattern applies to ANY domain:

\`\`\`
1. DECOMPOSE the task into 3-7 sequential sub-tasks
   → What must be known BEFORE each step can run?

2. WRITE A SKILL for each sub-task
   → Role + Input Contract + Output Schema + Constraints

3. WRITE AN ORCHESTRATOR that chains them
   → Strict order + Context flow + Final output format

4. BUILD A THIN WRAPPER
   → Load prompts → One API call → Parse output → Export

5. DEPLOY
   → GitHub + Streamlit Cloud (free, ~2 minutes)
\`\`\`

The same pattern in other domains:

**Cover Letter Agent** → jd_parser → tone_analyzer → letter_writer
**Interview Prep Coach** → jd_parser → question_generator → answer_coach → feedback_scorer
**Cold Email Agent** → prospect_researcher → pain_identifier → email_writer → subject_tester
**Contract Analyst** → clause_extractor → risk_analyzer → redline_writer`
      },
      {
        heading: "Common Mistakes & Fixes",
        content: `**Vague role definition** → Generic, unhelpful output
Fix: "You are a [specific domain expert] who [specific action verb + goal]..."

**No output schema** → Inconsistent formatting, parsing breaks downstream
Fix: Define exact markdown structure with a concrete before/after example

**Missing negative constraints** → Model adds commentary, fabricates skills
Fix: "Never X", "Must not Y", "Remove all instances of Z"

**Monolithic prompt** → Quality drops as complexity increases
Fix: Break into 3-5 sequential skills, each with single responsibility

**No self-check step** → Missed requirements, duplicate verbs, missing numbers
Fix: "Before finalising, verify: [checklist]. Rewrite any that fail."

**\`max_tokens\` too low** → Truncated output, PDF with missing sections (silent failure)
Fix: Set \`max_tokens=6000\` explicitly for long-output agents

**LayoutError in ReportLab** → App crashes silently on download click
Fix: Wrap each column in \`KeepInFrame(mode='shrink')\`

**\`_extract_section\` returns empty** → Blank resume PDF
Fix: Two-pass extraction — markdown headings first, bold-heading fallback second`
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD LESSONS  (from agent-101-walkthrough.jsx)
// ═══════════════════════════════════════════════════════════════════════════════

const buildPhases = {
  1: { label: "Prompts", color: "#4361EE", sub: "Write skills + orchestrator" },
  2: { label: "Code",    color: "#7C3AED", sub: "Build the Streamlit app" },
  3: { label: "Ship",    color: "#10B981", sub: "Deploy to the world" },
};

const buildLessons = [
  // ── PHASE 1 ────────────────────────────────────────────────────────────────
  {
    id: 1, phase: 1, badge: "🗂️", duration: "5 min",
    title: "Setup & Folder Structure",
    objective: "Create the repo skeleton that every file will live in.",
    checklistItems: [
      "Folder created and opened in terminal",
      "All subdirectories (skills/, agents/) exist",
      "requirements.txt written",
    ],
    sections: [
      {
        heading: "What You're Building",
        content: `In this session you'll go from zero to a live AI product on the web in ~60 minutes.

End state:
\`\`\`
resume-tailor-agent/
├── agents/
│   └── resume_tailor_agent.md   ← the orchestrator (chains 5 skills)
├── skills/
│   ├── jd_parser.md             ← Skill 1
│   ├── gap_analyzer.md          ← Skill 2
│   ├── bullet_rewriter.md       ← Skill 3
│   ├── summary_generator.md     ← Skill 4
│   └── ats_scorer.md            ← Skill 5
├── app.py                       ← Streamlit UI + PDF generation
├── requirements.txt             ← 3 lines
└── README.md
\`\`\`

User pastes a JD + resume → Claude runs 5 skills in sequence → Two PDFs download.`
      },
      {
        heading: "Create the Project",
        content: `\`\`\`bash
mkdir resume-tailor-agent
cd resume-tailor-agent
mkdir skills agents
\`\`\`

**requirements.txt** — just 3 lines:
\`\`\`
streamlit
anthropic
reportlab
\`\`\`

Install:
\`\`\`bash
pip install streamlit anthropic reportlab
\`\`\`

Set API key:
\`\`\`bash
export ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

**That's all the setup.** Everything from here is writing prompts and Python.`
      },
      {
        heading: "The Mental Model Before You Write a Single Line",
        content: `\`\`\`
User Input (JD + Resume)
        ↓
  system prompt = orchestrator.md + skill1.md + ... + skill5.md
        ↓
  ONE single claude.messages.create() call
        ↓
  Claude internally runs all 5 skills in sequence
        ↓
  Returns one big markdown string (~2,000 words)
        ↓
  app.py splits it → Resume PDF + Analysis PDF
\`\`\`

**Key insight:** The "agent pipeline" is NOT 5 API calls. It's ONE call with a system prompt smart enough to self-orchestrate. This is cheaper (~$0.03/run), faster (~30 sec), and simpler to build.`
      }
    ]
  },

  {
    id: 2, phase: 1, badge: "🔍", duration: "8 min",
    title: "Write Skill 1: JD Parser",
    objective: "Turn a messy job description into structured, parseable data.",
    checklistItems: [
      "skills/jd_parser.md created",
      "Role definition is specific (not generic)",
      "Output schema has exact field names",
      "ATS keywords section included",
    ],
    sections: [
      {
        heading: "Why This Skill Exists",
        content: `A raw job description is 80% boilerplate. Skill 1 strips the noise and returns ONLY what matters for resume tailoring — in a structured format every downstream skill can consume.

❌ Bare prompt: "Extract skills from this job description"
→ Inconsistent output. Sometimes bulleted, sometimes prose. Sometimes adds skills not in the JD. The next skill can't rely on this.

✅ Skill 1 with schema: Persona + exact output schema + "preserve exact keyword phrasing"
→ Always the same structure. ATS keywords always comma-separated. Parseable every time.`
      },
      {
        heading: "Live Code: skills/jd_parser.md",
        content: `Create \`skills/jd_parser.md\`:

\`\`\`markdown
# JD Parser

## Role
You are an expert recruiter and ATS specialist who deconstructs job
descriptions into structured, actionable data for resume tailoring.

## Input
Raw job description text. Extract only what matters for resume tailoring.

## Output Format

### 1. Role Overview
- **Title**: [Exact title from JD]
- **Seniority**: [Junior / Mid / Senior / Lead / Manager]
- **Industry**: [Best guess from context]

### 2. Required Skills (MUST HAVE)
One skill per line with category tag. Preserve exact phrasing.
- [Technical] Python (3+ years)
- [Domain] Financial services experience
- [Soft] Cross-functional stakeholder management

### 3. Preferred Skills (NICE TO HAVE)
Same format as Required.

### 4. ATS Keywords (Critical)
Extract 15-25 keywords. Include: tools, methodologies, domain terms.
Format as comma-separated list.

### 5. Hidden Signals
- **Team size**: [inferred]
- **Tech maturity**: [Startup vs. enterprise]
- **Red flags**: [Unrealistic scope, mismatched seniority, etc.]

## Constraints
- Preserve exact keyword phrasing — never synonym-swap
- Never add skills not present in the JD
\`\`\``
      },
      {
        heading: "Principles Being Demonstrated",
        content: `**Persona Specificity** — "expert recruiter and ATS specialist" activates domain knowledge from millions of real recruiter outputs the model saw in training.

**Output Schema as API Contract** — Skill 2 (gap_analyzer) will consume Skill 1's output. If Skill 1's format is inconsistent, Skill 2's quality drops. Always show the format as an example.

**Negative Constraints Win** — "Never add skills not present in the JD" overrides the model's tendency to be helpful by inferring related skills. Explicit negative constraints > positive nudges.

**The critical keyword rule:** "Preserve exact keyword phrasing." ATS scans for "Snowflake". If you say "cloud data warehouse", it's a miss. Same concept, zero ATS match.`
      }
    ]
  },

  {
    id: 3, phase: 1, badge: "✏️", duration: "10 min",
    title: "Write Skill 3: Bullet Rewriter + STAR-K",
    objective: "Build the core skill — rewrite bullets with STAR-K and a self-check loop.",
    checklistItems: [
      "skills/bullet_rewriter.md created",
      "STAR-K formula defined with example",
      "Self-check loop written (Step 3b)",
      "Anti-repetition rules included",
    ],
    sections: [
      {
        heading: "The STAR-K Formula",
        content: `**STAR-K = Situation/Task + Action + Result + Keyword**

\`\`\`
BEFORE:  "Built dashboards for the marketing team"

          S/T         A              Result        Keyword
           ↓          ↓                ↓              ↓
AFTER:   "Designed 12 Tableau dashboards enabling marketing to
          track campaign ROI across 5 channels, cutting
          reporting time by 60%"
\`\`\`

What changed in one bullet:
- **Tool added** (Tableau)           → ATS keyword hit
- **Count added** (12 dashboards)    → quantified output
- **Scale added** (5 channels)       → shows scope
- **Impact added** (60% reduction)   → shows value
- **JD keyword embedded** ("campaign ROI") → exact string match`
      },
      {
        heading: "Live Code: skills/bullet_rewriter.md",
        content: `Create \`skills/bullet_rewriter.md\`:

\`\`\`markdown
# Bullet Rewriter

## Role
You are a resume optimization specialist. Rewrite experience bullets
to maximize JD relevance while preserving honesty and authenticity.

## Output Format
### [Company Name] — [Title] ([Dates])
1. ORIGINAL: "Built dashboards for the marketing team"
   REWRITTEN: "Designed 12 Tableau dashboards enabling marketing to
               track campaign ROI across 5 channels, reducing
               reporting time by 60%"
   CHANGES:   Added tool (Tableau), quantified (12, 5 channels),
              added impact (60%), matched keyword "campaign ROI"

## Quantification Rules
- Every bullet MUST have at least one number — no exceptions
- Acceptable: revenue ($), percentage (%), count (N), time saved
- If original has no numbers, embed a reasonable estimate directly —
  no markers like "~", "(assumed)", or "(estimated)"

## Anti-Repetition Rules
- No two bullets within the same role may start with the same verb
- Across all roles, no verb may appear more than twice as an opener

## Verb Upgrades by Seniority
- Junior:  Built, Developed, Created, Analyzed, Automated
- Mid:     Designed, Implemented, Optimized, Led, Delivered
- Senior:  Architected, Spearheaded, Drove, Scaled, Established

## Constraints
- Never invent experience — only reframe what exists
- Maximum 2 lines per bullet (ATS truncates longer)
- Remove all first-person pronouns (no "I" or "my")
- If a bullet claims a skill not in the original resume → flag ⚠️ FABRICATED
\`\`\``
      },
      {
        heading: "The Self-Check Loop — What Makes This an Agent",
        content: `In the orchestrator (next step), we add **Step 3b** after bullet rewriting:

\`\`\`markdown
### Step 3b: Self-Check Bullets (before moving on)
Verify:
1. Every bullet has at least one number — rewrite any that don't.
2. No two bullets in the same role share the same opening verb.
3. No verb appears more than twice across all roles.
Only proceed to Step 4 once all three checks pass.
\`\`\`

**Why this matters:**
This is the line between a prompt and an agent. "Audit your own output before continuing" triggers an internal correction loop. The model catches its own mistakes before moving to Step 4.

Without Step 3b: ~30% of bullets lack numbers or repeat verbs.
With Step 3b: near-zero.

Any time you write "after doing X, self-check by verifying Y", you're turning a prompt into an agent.`
      }
    ]
  },

  {
    id: 4, phase: 1, badge: "🎼", duration: "10 min",
    title: "The Orchestrator",
    objective: "Chain all 5 skills and define the output contract for app.py to parse.",
    checklistItems: [
      "agents/resume_tailor_agent.md created",
      "Strict order constraint written",
      "Step 3b self-check included",
      "Final output format matches what app.py will parse",
    ],
    sections: [
      {
        heading: "Context Accumulation — Why Order Matters",
        content: `By the time Skill 4 (summary generator) runs, Claude has:

\`\`\`
After Skill 1:  Role title, required skills, ATS keywords, hidden signals
After Skill 2:  What the resume has vs. doesn't — match %, critical gaps
After Skill 3:  Every bullet rewritten with keywords woven in
By Skill 4:     Writing a summary with FULL CONTEXT of role + candidate + gaps
\`\`\`

A summary written with this context is dramatically better than one written cold. This is why the pipeline exists — **each step earns the next step's quality.**

If you ran all 5 in parallel (one call each, no shared context), the summary wouldn't know which bullets were rewritten. Context accumulation IS the value.`
      },
      {
        heading: "Live Code: agents/resume_tailor_agent.md",
        content: `Create \`agents/resume_tailor_agent.md\`:

\`\`\`markdown
# Resume Tailor Agent — Orchestrator

## Role
You are the Resume Tailor Agent. You take a job description and a
current resume, then produce a fully tailored resume package by
running 5 skills in sequence.

## Workflow (STRICT ORDER — never skip or reorder)

### Step 1: Parse the JD → Step 2: Analyze Gaps
### Step 3: Rewrite Bullets → Step 3b: Self-Check
### Step 4: Generate Summary → Step 5: Score ATS

## Final Output Format

---
# RESUME TAILOR REPORT
## Target Role: [Title] at [Company]

### 1. TAILORED RESUME
**[CANDIDATE FULL NAME]**
[email] | [phone] | [LinkedIn]

**PROFESSIONAL SUMMARY**
[Recommended summary — 60 words max]

**EXPERIENCE**
**[Company Name]** — [Job Title] | [Dates]
- [Rewritten bullet using STAR-K]

**SKILLS**
Technical: [comma-separated list]

### 2. GAP ANALYSIS
[Match matrix + gap summary + strategies]

### 3. ATS SCORECARD
[Before/after scores + keyword audit]

### 4. NEXT STEPS
- [ ] Review rewritten bullets
---

## Constraints
- Never fabricate skills, experience, or numbers
- Never insert commentary into Section 1
\`\`\``
      },
      {
        heading: "The Output Format IS the Parsing Contract",
        content: `This is the most important thing to understand about the whole system:

\`\`\`python
# In app.py, the parser does exactly this:
resume_section = _extract_section(result, "TAILORED RESUME")
# Looks for "### 1. TAILORED RESUME" heading, returns content
# until the next ### heading

generate_resume_pdf(resume_section)    # → clean 2-column PDF
generate_report_pdf(result)            # → analysis PDF (sections 2-4)
\`\`\`

If the orchestrator outputs \`## 1. Tailored Resume\` (lowercase, ## instead of ###), the parser fails to find it and the resume PDF is blank.

**Before writing a single line of Python, design your output format and decide how you'll parse it. Work backwards from the parsing logic to the prompt.**`
      }
    ]
  },

  // ── PHASE 2 ────────────────────────────────────────────────────────────────
  {
    id: 5, phase: 2, badge: "🧩", duration: "8 min",
    title: "app.py — Skeleton & Prompt Loader",
    objective: "Build the Streamlit skeleton and load all 6 prompt files into one system prompt.",
    checklistItems: [
      "app.py created with st.set_page_config",
      "load_prompts() written with @st.cache_data",
      "All 6 files concatenated in correct order",
      "Text input boxes for JD and resume added",
    ],
    sections: [
      {
        heading: "The Streamlit App in 3 Parts",
        content: `\`\`\`
Part 1: LOAD          load_prompts()           → reads 6 .md files
Part 2: CALL          claude.messages.create() → one API call
Part 3: RENDER        two download buttons     → resume + analysis PDFs
\`\`\`

That's it. The intelligence is in the prompts. The code is just plumbing.`
      },
      {
        heading: "Live Code: app.py Skeleton",
        content: `\`\`\`python
import streamlit as st
import anthropic, re, io
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable, KeepInFrame
)
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

st.set_page_config(page_title="Resume Tailor Agent",
                   page_icon="📄", layout="wide")

@st.cache_data
def load_prompts():
    """Concatenate orchestrator + all 5 skills into one system prompt."""
    import os
    base = os.path.dirname(__file__)
    system = open(os.path.join(base, "agents/resume_tailor_agent.md")).read()
    for skill in ["jd_parser", "gap_analyzer", "bullet_rewriter",
                  "summary_generator", "ats_scorer"]:
        system += "\\n\\n---\\n\\n"
        system += open(os.path.join(base, f"skills/{skill}.md")).read()
    return system

st.markdown("## 📄 Resume Tailor Agent")
col1, col2 = st.columns(2)
with col1:
    jd = st.text_area("📋 Job Description", height=320)
with col2:
    resume = st.text_area("📄 Current Resume", height=320)

_, run_col, _ = st.columns([3, 2, 3])
with run_col:
    run = st.button("🚀 Tailor My Resume", type="primary",
                    use_container_width=True)
\`\`\`

**Teach \`@st.cache_data\`:** Streamlit re-runs the entire script on every user interaction. Without caching, \`load_prompts()\` reads 6 files from disk on every button click.`
      },
      {
        heading: "Why Concatenation Is the Right Pattern",
        content: `**Option A: 5 separate API calls**
- Pros: Each call isolated, easier to debug individually
- Cons: 5× cost, 5× latency, you manually pass context between calls

**Option B: 1 call with concatenated system prompt (what we use)**
- Pros: $0.03/run, ~30 seconds, Claude carries context internally
- Cons: Slightly harder to debug, less granular control

For this use case, Option B wins decisively.

**The concatenation order matters.** Orchestrator first, then skills in the order the orchestrator references them. Claude reads the system prompt top-to-bottom. The orchestrator sets the "brain"; the skills set the "tools".`
      }
    ]
  },

  {
    id: 6, phase: 2, badge: "⚡", duration: "8 min",
    title: "app.py — API Call & Output Parser",
    objective: "Make the API call and split the output into two separate content streams.",
    checklistItems: [
      "API call written with correct max_tokens",
      "result stored in st.session_state",
      "_extract_section() function written",
      "resume_section and report sections correctly separated",
    ],
    sections: [
      {
        heading: "Live Code: API Call + Session State",
        content: `\`\`\`python
if run:
    if not jd.strip() or not resume.strip():
        st.error("⚠️ Both fields are required.")
    else:
        with st.spinner("Analyzing JD → Rewriting bullets → Scoring ATS…"):
            try:
                system = load_prompts()
                client = anthropic.Anthropic()
                msg = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=6000,
                    system=system,
                    messages=[{
                        "role": "user",
                        "content": (
                            f"## Job Description\\n{jd}\\n\\n"
                            f"## My Current Resume\\n{resume}"
                        )
                    }]
                )
                result = msg.content[0].text
                st.session_state["result"] = result
                st.session_state.pop("resume_pdf", None)
                st.session_state.pop("report_pdf", None)
            except Exception as e:
                st.error(f"❌ Error: {e}")
\`\`\`

**Why \`max_tokens=6000\`?** A full resume + gap analysis + ATS scorecard easily hits 2,500 words. Truncated output = broken PDF. Always set this explicitly for long-output agents.`
      },
      {
        heading: "Live Code: Output Parser",
        content: `\`\`\`python
def _split_sections(text):
    """Split Claude output into named sections using markdown headings."""
    heading_re = re.compile(
        r"^(#{1,3})\\s+(?:\\d+[\\.\:]?\\s*)?(.+)$", re.MULTILINE
    )
    sections = {}
    matches = list(heading_re.finditer(text))
    for i, m in enumerate(matches):
        title = re.sub(r"\\*+", "", m.group(2)).strip().upper()
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        sections[title] = text[start:end].strip()
    return sections

def _extract_section(text, keyword):
    """Two-pass extraction: markdown headings → bold headings fallback."""
    keyword_up = keyword.upper()
    # Pass 1: markdown headings
    for title, content in _split_sections(text).items():
        if keyword_up in title and content:
            return content
    # Pass 2: bold headings (**1. TAILORED RESUME**)
    bold_re = re.compile(
        r"^\\*\\*(?:\\d+[\\.\:]?\\s*)?" + re.escape(keyword_up)
        + r"[^*\\n]*\\*\\*\\s*$", re.MULTILINE | re.IGNORECASE
    )
    m = bold_re.search(text)
    if m:
        start = m.end()
        nxt = re.search(r"(?:^\\*\\*\\d|^#{1,3}\\s)", text[start:], re.MULTILINE)
        end = start + nxt.start() if nxt else len(text)
        return text[start:end].strip()
    return ""
\`\`\`

**Two-pass pattern:** AI output format isn't always identical. Pass 1 handles \`### 1. TAILORED RESUME\`, Pass 2 handles \`**1. TAILORED RESUME**\`. Build parsers defensively.`
      },
      {
        heading: "Wire Results to Download Buttons",
        content: `\`\`\`python
if "result" in st.session_state:
    result = st.session_state["result"]

    role_match = re.search(r"Target Role:\\s*(.+)", result)
    target_role = role_match.group(1).strip() if role_match else "role"
    safe_role = re.sub(r"[^\\w\\s-]", "", target_role)[:40].replace(" ", "_")

    resume_section = _extract_section(result, "TAILORED RESUME")

    if "resume_pdf" not in st.session_state:
        st.session_state["resume_pdf"] = generate_resume_pdf(
            resume_section if resume_section else result, target_role
        )
        st.session_state["report_pdf"] = generate_report_pdf(result, target_role)

    left_col, _ = st.columns([1, 1])
    with left_col:
        st.success("✅ Done! Your tailored resume package is ready.")
        st.download_button(
            label="⬇️  Tailored Resume PDF",
            data=st.session_state["resume_pdf"],
            file_name=f"resume_{safe_role}.pdf",
            mime="application/pdf",
            type="primary", use_container_width=True,
        )
        st.download_button(
            label="⬇️  Full Analysis Report PDF",
            data=st.session_state["report_pdf"],
            file_name=f"analysis_{safe_role}.pdf",
            mime="application/pdf",
        )
\`\`\``
      }
    ]
  },

  {
    id: 7, phase: 2, badge: "📄", duration: "7 min",
    title: "app.py — PDF Generation",
    objective: "Generate two visually distinct PDFs with ReportLab.",
    checklistItems: [
      "generate_resume_pdf() produces two-column layout",
      "generate_report_pdf() produces analysis layout",
      "KeepInFrame added as LayoutError safety net",
      "Both PDFs return bytes (not file paths)",
    ],
    sections: [
      {
        heading: "Two PDFs, Two Purposes",
        content: `\`\`\`
RESUME PDF                       ANALYSIS REPORT PDF
──────────────────               ────────────────────────────
Submit to employers.             Review privately, iterate.
No commentary.                   Full gap matrix, ATS score.
Clean two-column layout.         Tables, before/after scores.

generate_resume_pdf(             generate_report_pdf(
    resume_section,                  full_result,
    target_role                      target_role
)                                )
\`\`\`

**Critical:** Section 1 ONLY goes to the resume PDF. Sections 2-4 go to the analysis PDF. This prevents the recruiter from seeing your internal gap analysis or score.`
      },
      {
        heading: "ReportLab Minimum Viable Knowledge",
        content: `\`\`\`python
from reportlab.platypus import (
    SimpleDocTemplate,   # creates PDF, manages pages
    Paragraph,           # styled text (bold, italic, color)
    Spacer,              # Spacer(1, N) = N points whitespace
    Table,               # Table([[col1, col2]]) = side-by-side
    HRFlowable,          # horizontal divider line
    KeepInFrame,         # scales content to fit — no crashes
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
\`\`\`

**Two-column layout in 5 lines:**
\`\`\`python
W = letter[0] - 1.6*inch   # page width minus margins
LW = W * 0.60              # left column: 60%
RW = W * 0.38              # right column: 38%

# left_fl and right_fl are lists of Paragraph/Spacer/etc.
body = Table([[kif_left, kif_right]], colWidths=[LW, RW])
\`\`\``
      },
      {
        heading: "The LayoutError Safety Net",
        content: `\`\`\`
reportlab.platypus.doctemplate.LayoutError:
  Flowable ... too large on page 1
\`\`\`

Cause: Single-row Table taller than the page height. ReportLab can split multi-row tables but NOT single-row tables.

**Fix — KeepInFrame(mode='shrink'):**

\`\`\`python
# Without: LayoutError if resume > 1 page
# With: content scales down to fit, never crashes

COL_H = letter[1] - 0.95*inch - 1.6*inch  # ~615 pt available

kif_left  = KeepInFrame(LW, COL_H, left_fl,  mode='shrink')
kif_right = KeepInFrame(RW, COL_H, right_fl, mode='shrink')

body = Table([[kif_left, kif_right]], colWidths=[LW, RW])
\`\`\`

\`mode='shrink'\` scales proportionally. For a standard 1-page resume, no shrinking happens. For edge cases (very long resume, accidentally passing the full result), it shrinks gracefully instead of crashing. **Production code handles the unexpected.**`
      }
    ]
  },

  // ── PHASE 3 ────────────────────────────────────────────────────────────────
  {
    id: 8, phase: 3, badge: "📦", duration: "5 min",
    title: "Push to GitHub",
    objective: "Get the code into a GitHub repo so Streamlit Cloud can find it.",
    checklistItems: [
      "git init and first commit done",
      "GitHub repo created (public)",
      "Code pushed to main branch",
      "requirements.txt is in the root of the repo",
    ],
    sections: [
      {
        heading: "Initialize Git",
        content: `\`\`\`bash
cd resume-tailor-agent
git init
git add .
git commit -m "initial: resume tailor agent"
\`\`\`

Create a repo on github.com → New → name it \`resume-tailor-agent\` → Public → Create.

\`\`\`bash
git remote add origin https://github.com/YOUR_USERNAME/resume-tailor-agent.git
git branch -M main
git push -u origin main
\`\`\``
      },
      {
        heading: "What NOT to Push",
        content: `Create \`.gitignore\` before pushing:

\`\`\`
.env
__pycache__/
*.pyc
.streamlit/secrets.toml
venv/
\`\`\`

**Never push your API key.** In development:
\`\`\`bash
export ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

In Streamlit Cloud: Settings → Secrets panel. The code reads identically in both:
\`\`\`python
client = anthropic.Anthropic()
# Reads ANTHROPIC_API_KEY automatically from environment
\`\`\`

You don't write any key-reading code. \`anthropic.Anthropic()\` handles it.`
      }
    ]
  },

  {
    id: 9, phase: 3, badge: "🚀", duration: "5 min",
    title: "Deploy to Streamlit Cloud",
    objective: "Make the app live at a public URL anyone can use.",
    checklistItems: [
      "App deployed on Streamlit Cloud",
      "ANTHROPIC_API_KEY added as a Secret",
      "App loads without errors",
      "URL copied — ready to share",
    ],
    sections: [
      {
        heading: "3-Click Deploy",
        content: `1. Go to **share.streamlit.io** → sign in with GitHub
2. Click **New App**
3. Select your repo → branch: **main** → Main file: **app.py**
4. Click **Deploy**

Streamlit Cloud clones your repo, installs requirements.txt, runs \`streamlit run app.py\`, and gives you a URL like \`yourapp.streamlit.app\`. The whole process takes ~2 minutes.`
      },
      {
        heading: "Add the API Key as a Secret",
        content: `After deploying:

**App → Settings → Secrets → Edit Secrets**

\`\`\`toml
ANTHROPIC_API_KEY = "sk-ant-your-key-here"
\`\`\`

Click Save. The app restarts and reads the key automatically:

\`\`\`
Streamlit Secrets → injected into os.environ
          ↓
anthropic.Anthropic() → reads os.environ["ANTHROPIC_API_KEY"]
          ↓
Works locally (from export) AND on cloud (from secrets)
\`\`\`

No code changes needed. Same line works in both environments.`
      },
      {
        heading: "Your App is Live",
        content: `Visit your URL. Paste a JD and resume. Hit **Tailor My Resume**.

~30 seconds later: two download buttons appear.

**What you just built:**
- A 5-skill AI pipeline running on Claude Sonnet
- Automated resume tailoring with STAR-K bullet rewrites
- Professional PDF generation with ReportLab
- Hosted web app accessible to anyone with the URL

**Total cost per run: ~$0.03**
**Time from zero to live: ~60 minutes**

Put this URL in your LinkedIn Featured section. Everyone you know who job-hunts will use it.`
      }
    ]
  },

  {
    id: 10, phase: 3, badge: "🔧", duration: "5 min",
    title: "Debug, Iterate & Extend",
    objective: "Know how to debug prompt issues and where to take the agent next.",
    checklistItems: [
      "Tested with a real JD + resume",
      "Understand the iteration loop: edit .md → retest",
      "Know the 3 most common failure modes",
    ],
    sections: [
      {
        heading: "The Iteration Loop",
        content: `When something's wrong with the output, the fix is almost always in the prompts — not the Python code.

\`\`\`
Edit .md file → Save → Rerun → Review output
      ↑                              ↓
      ←←←←← still wrong? edit again ←←←←
\`\`\`

**Common issue: summary over 60 words**
Fix: Tighten orchestrator — "If over 60 words, cut from Sentence 2. Never cut the quantified achievement."

**Common issue: bullets without numbers**
Fix: In bullet_rewriter.md — "After rewriting ALL bullets, self-check: count how many lack a number. If any remain, rewrite before finalising."

**Common issue: blank resume PDF**
Fix: Add \`st.write(result)\` temporarily to see raw output, check which heading format Claude used, adjust the prompt to be consistent with the parser's expectation.`
      },
      {
        heading: "The 3 Most Common Failure Modes",
        content: `**Failure 1: Blank Resume PDF**
Cause: \`_extract_section\` can't find "TAILORED RESUME" in the output.
Debug: \`st.write(result)\` → check the actual section heading Claude used.
Fix: Add the two-pass fallback or adjust the orchestrator's output format.

---

**Failure 2: ReportLab LayoutError**
Cause: Content taller than one page inside a single-row Table.
Fix: Wrap each column in \`KeepInFrame(mode='shrink')\`.

---

**Failure 3: Fabricated Skills in Bullets**
Cause: Bullet rewriter added a skill from the JD not in the original resume.
Debug: Look for the ⚠️ FABRICATED tag in the output.
Fix: Strengthen the constraint: "Before finalising, scan every bullet. If any bullet references a tool not in the original resume, prepend ⚠️ FABRICATED and rewrite to remove it."`
      },
      {
        heading: "What to Build Next",
        content: `Your agent is production-ready. Here's how to extend it:

**Immediate (1-2 hours each):**
- Add \`skills/cover_letter.md\` → one more download button
- Add LinkedIn About generator to summary_generator skill
- Show a match score in the UI before downloading

**Architectural (half day each):**
- Multi-turn: "make bullet 3 more technical" → Claude edits only that bullet
- Resume storage: save past runs, show improvement over time
- Batch mode: upload 5 JDs, get 5 tailored resumes

**The pattern you learned applies to ANY domain:**
\`\`\`
Contract analyst   → clause_extractor → risk_analyzer → redline_writer
Cold email agent   → prospect_researcher → pain_identifier → email_writer
Interview prep     → jd_parser → question_generator → answer_coach
Code reviewer      → context_loader → issue_identifier → fix_suggester
\`\`\`

Same pattern: skills + orchestrator + thin wrapper + deploy.`
      }
    ]
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const quickRefCommands = [
  { label: "Create folder structure",  cmd: "mkdir resume-tailor-agent && cd resume-tailor-agent && mkdir skills agents" },
  { label: "Install dependencies",     cmd: "pip install streamlit anthropic reportlab" },
  { label: "Set API key (local)",      cmd: "export ANTHROPIC_API_KEY=sk-ant-..." },
  { label: "Run locally",             cmd: "streamlit run app.py" },
  { label: "Init git repo",           cmd: "git init && git add . && git commit -m 'initial'" },
  { label: "Push to GitHub",          cmd: "git remote add origin https://github.com/YOU/repo.git && git push -u origin main" },
  { label: "Debug section extraction",cmd: "st.write(_extract_section(result, 'TAILORED RESUME'))  # add temporarily" },
  { label: "Streamlit deploy",        cmd: "share.streamlit.io → New App → select repo → app.py → Deploy" },
];

const promptingPatterns = [
  { label: "Force structured output",   value: '"Return as a markdown table with columns: X, Y, Z"' },
  { label: "Prevent hallucination",     value: '"Never add [X] not present in the input"' },
  { label: "Force self-check",          value: '"After completing [task], count [condition]. If [violation], fix before finalising."' },
  { label: "Protect key content",       value: '"If you must cut for length, cut from Sentence 2. Never cut the quantified achievement."' },
  { label: "Exact boundaries",          value: '"Include ONLY sections that exist in the original. Do NOT add sections not present."' },
  { label: "Grade outputs",             value: '"Score each variant 1-100. Justify the score. Recommend the highest."' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT CONTENT RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function formatContent(text, accentColor = "#4361EE") {
  const lines = text.split('\n');
  let inCode = false;
  let codeLines = [];
  const result = [];
  let keyCount = 0;

  const flushCode = () => {
    if (codeLines.length > 0) {
      result.push(
        <div key={`code-${keyCount++}`} style={{
          background: '#0B1120', borderRadius: '8px', padding: '16px',
          margin: '12px 0', border: '1px solid #1E293B', overflowX: 'auto',
        }}>
          <pre style={{
            margin: 0, color: '#E2E8F0', fontSize: '12px', lineHeight: '1.65',
            fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            whiteSpace: 'pre-wrap',
          }}>{codeLines.join('\n')}</pre>
        </div>
      );
      codeLines = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCode) { inCode = false; flushCode(); } else inCode = true;
      return;
    }
    if (inCode) { codeLines.push(line); return; }

    if (line.startsWith('### ')) {
      result.push(<p key={`h4-${i}`} style={{
        color: '#7DD3FC', fontSize: '11px', fontWeight: '700',
        marginTop: '18px', marginBottom: '6px',
        textTransform: 'uppercase', letterSpacing: '0.07em'
      }}>{line.slice(4)}</p>);
    } else if (line.startsWith('## ')) {
      result.push(<p key={`h3-${i}`} style={{
        color: '#E2E8F0', fontSize: '14px', fontWeight: '700',
        marginTop: '20px', marginBottom: '8px'
      }}>{line.slice(3)}</p>);
    } else if (/^\*\*(.+)\*\*$/.test(line.trim())) {
      result.push(<p key={`bold-${i}`} style={{
        color: '#CBD5E1', fontSize: '13px', fontWeight: '600',
        marginBottom: '4px', marginTop: '12px'
      }}>{line.trim().slice(2, -2)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const content = line.slice(2);
      const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      result.push(
        <div key={`li-${i}`} style={{ display: 'flex', gap: '8px', marginBottom: '5px', paddingLeft: '4px' }}>
          <span style={{ color: accentColor, marginTop: '3px', flexShrink: 0, fontSize: '12px' }}>▸</span>
          <span style={{ color: '#94A3B8', fontSize: '13px', lineHeight: '1.6' }}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**'))
                return <strong key={j} style={{ color: '#CBD5E1' }}>{p.slice(2,-2)}</strong>;
              if (p.startsWith('`') && p.endsWith('`'))
                return <code key={j} style={{ background:'#1E293B', color:'#7DD3FC', padding:'1px 5px', borderRadius:'3px', fontSize:'11px', fontFamily:'monospace' }}>{p.slice(1,-1)}</code>;
              return p;
            })}
          </span>
        </div>
      );
    } else if (line.trim() === '' || line === '---') {
      result.push(<div key={`sp-${i}`} style={{ height: '8px' }} />);
    } else if (line.trim()) {
      const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      result.push(
        <p key={`p-${i}`} style={{ color: '#94A3B8', fontSize: '13px', lineHeight: '1.75', marginBottom: '8px' }}>
          {parts.map((p, j) => {
            if (p.startsWith('**') && p.endsWith('**'))
              return <strong key={j} style={{ color: '#E2E8F0' }}>{p.slice(2,-2)}</strong>;
            if (p.startsWith('`') && p.endsWith('`'))
              return <code key={j} style={{ background:'#1E293B', color:'#7DD3FC', padding:'1px 5px', borderRadius:'3px', fontSize:'11px', fontFamily:'monospace' }}>{p.slice(1,-1)}</code>;
            return p;
          })}
        </p>
      );
    }
  });

  flushCode();
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function Agent101Course() {
  const [track, setTrack] = useState("theory");           // "theory" | "build"
  const [selectedTheory, setSelectedTheory] = useState(0);
  const [selectedBuild, setSelectedBuild] = useState(0);
  const [expandedSections, setExpandedSections] = useState({ 0: true });
  const [completedTheory, setCompletedTheory] = useState(new Set());
  const [completedBuild, setCompletedBuild] = useState(new Set());
  const [checkedItems, setCheckedItems] = useState({});
  const [activeTab, setActiveTab] = useState("content");

  // ── current item ──────────────────────────────────────────────────────────
  const isTheory = track === "theory";
  const currentItem = isTheory ? theoryModules[selectedTheory] : buildLessons[selectedBuild];
  const accentColor = isTheory ? THEORY_COLOR : buildPhases[currentItem?.phase]?.color ?? "#4361EE";
  const totalItems = isTheory ? theoryModules.length : buildLessons.length;
  const currentIdx = isTheory ? selectedTheory : selectedBuild;
  const completedSet = isTheory ? completedTheory : completedBuild;

  const totalChecks = buildLessons.reduce((a, l) => a + l.checklistItems.length, 0);
  const doneChecks  = Object.values(checkedItems).filter(Boolean).length;
  const theoryDone  = completedTheory.size;
  const buildDone   = completedBuild.size;

  // ── handlers ──────────────────────────────────────────────────────────────
  const toggleSection = (idx) =>
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }));

  const toggleComplete = (id) => {
    if (isTheory) {
      setCompletedTheory(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    } else {
      setCompletedBuild(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }
  };

  const toggleCheckItem = (lessonId, idx) => {
    const key = `${lessonId}-${idx}`;
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const navigate = (dir) => {
    const newIdx = Math.max(0, Math.min(totalItems - 1, currentIdx + dir));
    if (isTheory) setSelectedTheory(newIdx); else setSelectedBuild(newIdx);
    setExpandedSections({ 0: true });
    setActiveTab("content");
  };

  const selectModule = (idx) => {
    if (isTheory) setSelectedTheory(idx); else setSelectedBuild(idx);
    setExpandedSections({ 0: true });
    setActiveTab("content");
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: '#0B1120',
      fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif",
      color: '#E2E8F0', overflow: 'hidden'
    }}>

      {/* ════════════════════════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{
        width: '272px', flexShrink: 0,
        background: '#0F172A', borderRight: '1px solid #1E293B',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>

        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1E293B' }}>
          <div style={{ fontSize: '10px', color: THEORY_COLOR, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
            AGENT 101 · FULL COURSE
          </div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#F1F5F9', lineHeight: '1.3' }}>
            Resume Tailor Agent
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
            Prompt → Code → Ship in 60 min
          </div>

          {/* Overall progress */}
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontSize: '10px', color: '#475569' }}>
                Theory {theoryDone}/{theoryModules.length}
              </span>
              <span style={{ fontSize: '10px', color: '#475569' }}>
                Build {buildDone}/{buildLessons.length}
              </span>
            </div>
            <div style={{ height: '4px', background: '#1E293B', borderRadius: '2px', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0,
                height: '100%', borderRadius: '2px',
                width: `${(theoryDone / theoryModules.length) * 50}%`,
                background: THEORY_COLOR, transition: 'width 0.4s ease'
              }} />
              <div style={{
                position: 'absolute', left: '50%', top: 0,
                height: '100%', borderRadius: '2px',
                width: `${(buildDone / buildLessons.length) * 50}%`,
                background: 'linear-gradient(90deg, #4361EE, #10B981)',
                transition: 'width 0.4s ease'
              }} />
            </div>
            <div style={{ fontSize: '10px', color: '#22C55E', marginTop: '4px', textAlign: 'right' }}>
              {doneChecks}/{totalChecks} checks ✓
            </div>
          </div>
        </div>

        {/* Track switcher */}
        <div style={{ display: 'flex', gap: '4px', padding: '10px 10px 6px', borderBottom: '1px solid #1E293B' }}>
          {[["theory", "📚 Theory"], ["build", "🔨 Build"]].map(([t, label]) => (
            <button key={t} onClick={() => setTrack(t)} style={{
              flex: 1, padding: '7px 0', borderRadius: '6px', border: 'none',
              cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              background: track === t
                ? (t === "theory" ? `${THEORY_COLOR}22` : '#1E293B')
                : 'transparent',
              color: track === t
                ? (t === "theory" ? THEORY_COLOR : '#E2E8F0')
                : '#475569',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Module / Lesson list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>

          {/* ── THEORY TRACK ── */}
          {track === "theory" && (
            <div>
              <div style={{
                fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em',
                textTransform: 'uppercase', color: THEORY_COLOR,
                padding: '8px 8px 4px'
              }}>
                Concept Modules
              </div>
              {theoryModules.map((m, idx) => {
                const isSelected = selectedTheory === idx;
                const isDone = completedTheory.has(m.id);
                return (
                  <button key={m.id} onClick={() => selectModule(idx)} style={{
                    width: '100%', textAlign: 'left', padding: '9px 10px',
                    borderRadius: '6px', border: 'none', cursor: 'pointer',
                    background: isSelected ? `${THEORY_COLOR}18` : 'transparent',
                    borderLeft: isSelected ? `2px solid ${THEORY_COLOR}` : '2px solid transparent',
                    marginBottom: '2px', transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        flexShrink: 0, fontSize: '11px',
                        background: isDone ? '#22C55E' : (isSelected ? THEORY_COLOR : '#1E293B'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: (isDone || isSelected) ? 'white' : '#475569',
                        fontWeight: '700'
                      }}>
                        {isDone ? '✓' : m.badge}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '12px', fontWeight: isSelected ? '600' : '400',
                          color: isSelected ? '#E2E8F0' : '#94A3B8', lineHeight: '1.3',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>{m.title}</div>
                        <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>⏱ {m.duration}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── BUILD TRACK ── */}
          {track === "build" && (
            <div>
              {[1, 2, 3].map(phase => (
                <div key={phase} style={{ marginBottom: '4px' }}>
                  <div style={{
                    fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: buildPhases[phase].color,
                    padding: '8px 8px 4px', display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    <span style={{
                      background: `${buildPhases[phase].color}22`,
                      color: buildPhases[phase].color,
                      borderRadius: '4px', padding: '1px 6px', fontSize: '9px'
                    }}>PHASE {phase}</span>
                    {buildPhases[phase].label}
                  </div>

                  {buildLessons.filter(l => l.phase === phase).map(l => {
                    const idx = buildLessons.indexOf(l);
                    const isSelected = selectedBuild === idx;
                    const isDone = completedBuild.has(l.id);
                    const doneLessonChecks = l.checklistItems.filter((_, ci) => checkedItems[`${l.id}-${ci}`]).length;
                    return (
                      <button key={l.id} onClick={() => selectModule(idx)} style={{
                        width: '100%', textAlign: 'left', padding: '9px 10px',
                        borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: isSelected ? `${buildPhases[phase].color}18` : 'transparent',
                        borderLeft: isSelected ? `2px solid ${buildPhases[phase].color}` : '2px solid transparent',
                        marginBottom: '2px', transition: 'all 0.15s',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                            fontSize: '11px',
                            background: isDone ? '#22C55E' : (isSelected ? buildPhases[phase].color : '#1E293B'),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: (isDone || isSelected) ? 'white' : '#475569', fontWeight: '700'
                          }}>
                            {isDone ? '✓' : l.badge}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '12px', fontWeight: isSelected ? '600' : '400',
                              color: isSelected ? '#E2E8F0' : '#94A3B8', lineHeight: '1.3',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>{l.title}</div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', color: '#475569' }}>⏱ {l.duration}</span>
                              {doneLessonChecks > 0 && (
                                <span style={{ fontSize: '10px', color: '#22C55E' }}>
                                  {doneLessonChecks}/{l.checklistItems.length} ✓
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Item header */}
        <div style={{
          padding: '16px 28px 12px',
          borderBottom: '1px solid #1E293B', background: '#0F172A'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                {isTheory ? (
                  <span style={{
                    background: `${THEORY_COLOR}22`, color: THEORY_COLOR,
                    fontSize: '10px', fontWeight: '700',
                    padding: '3px 8px', borderRadius: '12px',
                    textTransform: 'uppercase', letterSpacing: '0.06em'
                  }}>
                    Theory · Module {currentIdx + 1} of {theoryModules.length}
                  </span>
                ) : (
                  <span style={{
                    background: `${accentColor}22`, color: accentColor,
                    fontSize: '10px', fontWeight: '700',
                    padding: '3px 8px', borderRadius: '12px',
                    textTransform: 'uppercase', letterSpacing: '0.06em'
                  }}>
                    Phase {currentItem.phase}: {buildPhases[currentItem.phase].label} · Step {currentItem.id}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: '11px' }}>⏱ {currentItem.duration}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>{currentItem.badge}</span>
                <h2 style={{ margin: 0, fontSize: '19px', fontWeight: '700', color: '#F1F5F9' }}>
                  {currentItem.title}
                </h2>
              </div>
              {!isTheory && currentItem.objective && (
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                  🎯 {currentItem.objective}
                </p>
              )}
            </div>

            <button
              onClick={() => toggleComplete(currentItem.id)}
              style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                border: completedSet.has(currentItem.id) ? '1px solid #22C55E' : '1px solid #334155',
                background: completedSet.has(currentItem.id) ? 'rgba(34,197,94,0.1)' : 'transparent',
                color: completedSet.has(currentItem.id) ? '#22C55E' : '#64748B',
                fontSize: '12px', fontWeight: '600', transition: 'all 0.2s', whiteSpace: 'nowrap'
              }}
            >
              {completedSet.has(currentItem.id) ? '✓ Done' : 'Mark Done'}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '14px' }}>
            {(isTheory
              ? [['content', '📖 Content'], ['quick-ref', '⚡ Quick Ref']]
              : [['content', '📖 Steps'], ['checklist', '✅ Checklist'], ['quick-ref', '⚡ Quick Ref']]
            ).map(([tab, label]) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none',
                cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                background: activeTab === tab ? '#1E293B' : 'transparent',
                color: activeTab === tab ? '#E2E8F0' : '#64748B', transition: 'all 0.15s'
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* ── CONTENT / STEPS TAB ── */}
          {activeTab === 'content' && (
            <div>
              {currentItem.sections.map((sec, i) => (
                <div key={i} style={{
                  background: '#0F172A', border: '1px solid #1E293B',
                  borderRadius: '10px', marginBottom: '10px', overflow: 'hidden'
                }}>
                  <button onClick={() => toggleSection(i)} style={{
                    width: '100%', padding: '14px 18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '26px', height: '26px', borderRadius: '6px', flexShrink: 0,
                        background: expandedSections[i] ? `${accentColor}22` : '#1E293B',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '700',
                        color: expandedSections[i] ? accentColor : '#475569',
                        transition: 'all 0.2s',
                      }}>
                        {i + 1}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#CBD5E1' }}>
                        {sec.heading}
                      </span>
                    </div>
                    <span style={{
                      color: '#475569', fontSize: '14px',
                      transition: 'transform 0.2s', display: 'inline-block',
                      transform: expandedSections[i] ? 'rotate(180deg)' : 'rotate(0deg)'
                    }}>▾</span>
                  </button>

                  {expandedSections[i] && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid #1E293B' }}>
                      <div style={{ paddingTop: '16px' }}>
                        {formatContent(sec.content, accentColor)}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Navigation */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #1E293B'
              }}>
                <button
                  onClick={() => navigate(-1)} disabled={currentIdx === 0}
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: '1px solid #334155',
                    background: 'transparent',
                    color: currentIdx === 0 ? '#334155' : '#94A3B8',
                    cursor: currentIdx === 0 ? 'not-allowed' : 'pointer', fontSize: '13px'
                  }}
                >← Previous</button>

                <button
                  onClick={() => { toggleComplete(currentItem.id); if (currentIdx < totalItems - 1) navigate(1); }}
                  disabled={currentIdx === totalItems - 1}
                  style={{
                    padding: '10px 22px', borderRadius: '8px', border: 'none',
                    background: currentIdx === totalItems - 1
                      ? '#1E293B'
                      : isTheory
                        ? `linear-gradient(135deg, ${THEORY_COLOR}, #0284C7)`
                        : `linear-gradient(135deg, ${accentColor}, #7C3AED)`,
                    color: 'white',
                    cursor: currentIdx === totalItems - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: '600', transition: 'opacity 0.2s'
                  }}
                >
                  {currentIdx === totalItems - 1 ? (isTheory ? '🎓 Track Complete!' : '🎉 Shipped!') : 'Complete & Next →'}
                </button>
              </div>
            </div>
          )}

          {/* ── CHECKLIST TAB (build only) ── */}
          {activeTab === 'checklist' && !isTheory && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 4px' }}>Full Build Checklist</h3>
                <p style={{ color: '#64748B', fontSize: '12px', margin: 0 }}>
                  Track every item across all 10 steps. {doneChecks}/{totalChecks} complete.
                </p>
              </div>

              {[1, 2, 3].map(phase => (
                <div key={phase} style={{ marginBottom: '24px' }}>
                  <div style={{
                    fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: buildPhases[phase].color,
                    marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span style={{ background: `${buildPhases[phase].color}22`, padding: '2px 8px', borderRadius: '4px' }}>
                      Phase {phase}
                    </span>
                    {buildPhases[phase].label}
                  </div>

                  {buildLessons.filter(l => l.phase === phase).map(l => (
                    <div key={l.id} style={{
                      background: '#0F172A', border: '1px solid #1E293B',
                      borderRadius: '8px', marginBottom: '8px', padding: '12px 16px'
                    }}>
                      <div style={{
                        fontSize: '13px', fontWeight: '600', color: '#CBD5E1',
                        marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px'
                      }}>
                        <span>{l.badge}</span> {l.title}
                      </div>
                      {l.checklistItems.map((item, ci) => {
                        const key = `${l.id}-${ci}`;
                        const done = !!checkedItems[key];
                        return (
                          <label key={ci} style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            marginBottom: '8px', cursor: 'pointer'
                          }}>
                            <div onClick={() => toggleCheckItem(l.id, ci)} style={{
                              width: '16px', height: '16px', borderRadius: '4px',
                              border: `2px solid ${done ? buildPhases[phase].color : '#334155'}`,
                              background: done ? buildPhases[phase].color : 'transparent',
                              flexShrink: 0, marginTop: '1px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', transition: 'all 0.15s'
                            }}>
                              {done && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                            </div>
                            <span onClick={() => toggleCheckItem(l.id, ci)} style={{
                              fontSize: '13px', color: done ? '#475569' : '#94A3B8',
                              textDecoration: done ? 'line-through' : 'none',
                              lineHeight: '1.5', transition: 'color 0.15s'
                            }}>{item}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── QUICK REF TAB ── */}
          {activeTab === 'quick-ref' && (
            <div>
              {/* Commands */}
              <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 12px' }}>Command Reference</h3>
              <div style={{ display: 'grid', gap: '8px', marginBottom: '28px' }}>
                {quickRefCommands.map((item, i) => (
                  <div key={i} style={{
                    background: '#0F172A', border: '1px solid #1E293B',
                    borderRadius: '8px', padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '10px', color: THEORY_COLOR, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                      {item.label}
                    </div>
                    <code style={{
                      display: 'block', background: '#0B1120', color: '#7DD3FC',
                      padding: '7px 11px', borderRadius: '5px', fontSize: '12px',
                      fontFamily: "'Fira Code', monospace", lineHeight: '1.5'
                    }}>{item.cmd}</code>
                  </div>
                ))}
              </div>

              {/* Prompting patterns */}
              <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 12px' }}>Prompting Patterns</h3>
              <div style={{ display: 'grid', gap: '8px', marginBottom: '28px' }}>
                {promptingPatterns.map((p, i) => (
                  <div key={i} style={{
                    background: '#0F172A', border: '1px solid #1E293B',
                    borderRadius: '8px', padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '10px', color: '#7C3AED', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>
                      {p.label}
                    </div>
                    <code style={{
                      display: 'block', background: '#0B1120', color: '#A78BFA',
                      padding: '7px 11px', borderRadius: '5px', fontSize: '12px',
                      fontFamily: "'Fira Code', monospace", lineHeight: '1.5'
                    }}>{p.value}</code>
                  </div>
                ))}
              </div>

              {/* File structure */}
              <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 12px' }}>Final File Structure</h3>
              <div style={{
                background: '#0F172A', border: '1px solid #1E293B',
                borderRadius: '8px', padding: '16px', marginBottom: '24px'
              }}>
                <pre style={{
                  margin: 0, color: '#94A3B8', fontSize: '12px',
                  lineHeight: '1.9', fontFamily: "'Fira Code', monospace"
                }}>{`resume-tailor-agent/
├── agents/
│   └── resume_tailor_agent.md   ← orchestrator
├── skills/
│   ├── jd_parser.md             ← Skill 1
│   ├── gap_analyzer.md          ← Skill 2
│   ├── bullet_rewriter.md       ← Skill 3
│   ├── summary_generator.md     ← Skill 4
│   └── ats_scorer.md            ← Skill 5
├── app.py                       ← Streamlit UI + PDF
├── requirements.txt             ← 3 lines
└── README.md`}</pre>
              </div>

              {/* Cost breakdown */}
              <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 12px' }}>Cost Per Run</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
                {[
                  { label: "Model",            value: "claude-sonnet-4-6" },
                  { label: "Input tokens/run",  value: "~4,000" },
                  { label: "Output tokens/run", value: "~3,000" },
                  { label: "Cost per run",      value: "~$0.03" },
                  { label: "100 runs/month",    value: "~$3.00" },
                  { label: "Deployment",        value: "Free (Streamlit Cloud)" },
                ].map((r, i) => (
                  <div key={i} style={{
                    background: '#0F172A', border: '1px solid #1E293B',
                    borderRadius: '6px', padding: '10px 14px'
                  }}>
                    <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#E2E8F0', marginTop: '2px' }}>{r.value}</div>
                  </div>
                ))}
              </div>

              {/* Skill prompt template */}
              <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 12px' }}>Skill Prompt Template</h3>
              <div style={{
                background: '#0B1120', border: '1px solid #1E293B',
                borderRadius: '8px', padding: '16px'
              }}>
                <pre style={{
                  margin: 0, color: '#94A3B8', fontSize: '12px',
                  lineHeight: '1.8', fontFamily: "'Fira Code', monospace",
                  whiteSpace: 'pre-wrap'
                }}>{`## Role
You are a [specific expert] who [specific action verb + goal].

## Input
[Numbered list of exactly what the skill receives]

## Output Format
[Exact schema with headers, tables, examples — SHOW, don't describe]

## Constraints
- [Negative constraint: Never, Must not, Always]
- [Quantitative: Maximum X words, At least N items]
- [Self-check: After completing [task], verify [condition].
   If [violation], fix before finalising.]`}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
