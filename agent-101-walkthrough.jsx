import { useState } from "react";

const phases = {
  1: { label: "Prompts", color: "#4361EE", sub: "Write skills + orchestrator" },
  2: { label: "Code",    color: "#7C3AED", sub: "Build the Streamlit app" },
  3: { label: "Ship",    color: "#10B981", sub: "Deploy to the world" },
};

const lessons = [
  // ── PHASE 1: PROMPTS ──────────────────────────────────────────────────────
  {
    id: 1, phase: 1,
    title: "Setup & Folder Structure",
    duration: "5 min",
    objective: "Create the repo skeleton that every file will live in.",
    badge: "🗂️",
    checklistItems: [
      "Folder created and opened in terminal",
      "All subdirectories (skills/, agents/) exist",
      "requirements.txt written",
    ],
    sections: [
      {
        heading: "What You're Building",
        content: `In this session you'll go from zero to a live AI product on the web in ~60 minutes.

Here's the end state:

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

User pastes a JD + resume → Claude runs 5 skills in sequence → Two PDFs download:
**Tailored Resume PDF** (two-column professional layout) and **Analysis Report PDF** (gap matrix + ATS score).`
      },
      {
        heading: "Create the Project",
        content: `\`\`\`bash
mkdir resume-tailor-agent
cd resume-tailor-agent
mkdir skills agents
\`\`\`

Create **requirements.txt** — yes, just 3 lines:
\`\`\`
streamlit
anthropic
reportlab
\`\`\`

Install them:
\`\`\`bash
pip install streamlit anthropic reportlab
\`\`\`

Set your API key:
\`\`\`bash
export ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

**That's all the setup.** Everything from here is writing prompts and Python.`
      },
      {
        heading: "The Mental Model Before You Write a Single Line",
        content: `Before touching any file, understand the data flow:

\`\`\`
User Input (JD + Resume)
        ↓
  system prompt = orchestrator.md + skill1.md + skill2.md + ... + skill5.md
        ↓
  One single claude.messages.create() call
        ↓
  Claude internally runs all 5 skills in sequence
        ↓
  Returns one big markdown string (~2,000 words)
        ↓
  app.py splits it: section 1 → Resume PDF, sections 2-4 → Analysis PDF
\`\`\`

**Key insight:** The "agent pipeline" is not 5 API calls. It's ONE call with a system prompt smart enough to self-orchestrate. The orchestrator.md tells Claude which skill to run next, and Claude carries forward the output of each step as internal context.

This is cheaper (~$0.03/run), faster (~30 sec), and simpler to build.`
      }
    ]
  },

  {
    id: 2, phase: 1,
    title: "Write Skill 1: JD Parser",
    duration: "8 min",
    objective: "Turn a messy job description into structured, parseable data.",
    badge: "🔍",
    checklistItems: [
      "skills/jd_parser.md created",
      "Role definition is specific (not generic)",
      "Output schema has exact field names",
      "ATS keywords section included",
    ],
    sections: [
      {
        heading: "Why This Skill Exists",
        content: `A raw job description looks like this:

**"About us: We're disrupting fintech! We offer unlimited PTO, health/dental, a dog-friendly office, and free lunch every Friday. We're looking for a Senior Data Analyst with 5+ years of Python, SQL, experience with dbt and Snowflake..."**

That's 80% boilerplate. Skill 1 strips the noise and returns ONLY what matters for resume tailoring — in a structured format every downstream skill can consume.

**Bare prompt vs. structured skill:**

❌ Bare prompt: "Extract skills from this job description"
→ You get an inconsistent list. Sometimes bulleted, sometimes prose. Sometimes it adds skills not in the JD. The next skill can't rely on this output.

✅ Skill 1: Persona + exact output schema + constraint "preserve exact keyword phrasing"
→ You always get the same structure. ATS keywords are always a comma-separated list. The next skill can parse it reliably every time.`
      },
      {
        heading: "Live Code: skills/jd_parser.md",
        content: `Create \`skills/jd_parser.md\` and write this live:

\`\`\`markdown
# JD Parser

## Role
You are an expert recruiter and ATS specialist who deconstructs job
descriptions into structured, actionable data for resume tailoring.

## Input
Raw job description text. May include boilerplate, benefits, and filler.
Extract only what matters for resume tailoring.

## Output Format

### 1. Role Overview
- **Title**: [Exact title from JD]
- **Seniority**: [Junior / Mid / Senior / Lead / Manager]
- **Function**: [Engineering / Analytics / Data Science / Product / etc.]
- **Industry**: [Best guess from context]

### 2. Required Skills (MUST HAVE)
One skill per line with category tag. Preserve exact phrasing.
- [Technical] Python (3+ years)
- [Technical] SQL (advanced, window functions)
- [Domain] Financial services experience
- [Soft] Cross-functional stakeholder management

### 3. Preferred Skills (NICE TO HAVE)
Same format as Required.

### 4. ATS Keywords (Critical)
Extract 15-25 keywords an ATS would scan for.
Include: tools, methodologies, domain terms, soft skill keywords.
Format as comma-separated list.

### 5. Hidden Signals
- **Team size**: [inferred from "manage", "lead", "collaborate"]
- **Tech maturity**: [Startup vs. enterprise — inferred from tools]
- **Culture**: [Fast-paced, data-driven — from language cues]
- **Red flags**: [Unrealistic scope, mismatched seniority, etc.]

## Constraints
- Preserve exact keyword phrasing — never synonym-swap
- If a skill appears in both Required and Preferred, put it in Required
- Never add skills not present in the JD
\`\`\`

**Teach this line:** "Preserve exact keyword phrasing from JD — don't synonym-swap."
An ATS scans for the string "Snowflake". If your resume says "cloud data warehouse", it's a miss. Same concept, zero ATS match.`
      },
      {
        heading: "The Principle Being Demonstrated",
        content: `**Principle 1 — Persona Specificity**

❌ "You are an AI assistant. Help with resumes."
✅ "You are an expert recruiter and ATS specialist who deconstructs job descriptions..."

The model has seen millions of recruiter outputs. Specificity activates that knowledge.

---

**Principle 2 — Output Schema**

The output format IS the API contract between skills. Skill 2 (gap_analyzer) will consume Skill 1's output. If Skill 1's format is inconsistent — sometimes a list, sometimes prose — Skill 2's quality drops dramatically.

Always SHOW the format with an example, don't just describe it.

---

**Principle 3 — Negative Constraints Win**

❌ "Be accurate about skills"
✅ "Never add skills not present in the JD"

LLMs are trained to be helpful. "Helpful" sometimes means inferring things. Negative constraints override that tendency directly.`
      }
    ]
  },

  {
    id: 3, phase: 1,
    title: "Write Skill 3: Bullet Rewriter + STAR-K",
    duration: "10 min",
    objective: "Build the core skill — rewrite bullets with STAR-K and a self-check loop.",
    badge: "✏️",
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
- **JD keyword embedded** ("campaign ROI") → exact string match

This is the core transformation the entire agent exists to do.`
      },
      {
        heading: "Live Code: skills/bullet_rewriter.md",
        content: `Create \`skills/bullet_rewriter.md\`:

\`\`\`markdown
# Bullet Rewriter

## Role
You are a resume optimization specialist. You rewrite experience bullets
to maximize JD relevance while preserving honesty and authenticity.

## Input
1. Original resume bullets (grouped by role)
2. ATS keywords from jd_parser
3. Gap analysis from gap_analyzer (especially TRANSFERABLE items)

## Output Format
For each role:

### [Company Name] — [Title] ([Dates])
1. ORIGINAL: "Built dashboards for the marketing team"
   REWRITTEN: "Designed 12 Tableau dashboards enabling marketing to
               track campaign ROI across 5 channels, reducing
               reporting time by 60%"
   CHANGES:   Added tool (Tableau), quantified (12, 5 channels),
              added impact (60%), matched keyword "campaign ROI"

## The STAR-K Formula
Every bullet: [Action Verb] + [What you did] + [Scale/scope] +
              [Result with number] + [JD keyword naturally embedded]

## Quantification Rules
- Every bullet MUST have at least one number — no exceptions
- Acceptable: revenue ($), percentage (%), count (N), time saved
- If original has no numbers, embed a reasonable estimate directly —
  no markers, labels, or qualifiers like "~", "(assumed)", or "(estimated)"

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
- Start every bullet with a past-tense action verb
- Remove vague words: "helped", "assisted", "various", "worked on"
- If a bullet claims a skill not in the original resume → flag ⚠️ FABRICATED
\`\`\``
      },
      {
        heading: "The Self-Check Loop — What Makes This an Agent",
        content: `In the orchestrator (next step), we add a **Step 3b** after bullet rewriting:

\`\`\`markdown
### Step 3b: Self-Check Bullets (before moving on)
Before proceeding, verify:
1. Every bullet has at least one number — rewrite any that don't.
2. No two bullets in the same role share the same opening verb — replace duplicates.
3. No verb appears more than twice across all roles — replace extras.
Only proceed to Step 4 once all three checks pass.
\`\`\`

**Why this matters:**
This is the line between a prompt and an agent. Adding "audit your own output before continuing" triggers an internal correction loop. The model catches its own mistakes before moving to the summary step.

Without Step 3b: ~30% of bullets lack numbers or repeat verbs.
With Step 3b: near-zero.

**Teach this:** Any time you write "after doing X, self-check by verifying Y", you're turning a prompt into an agent. The model will actually loop back and fix errors.`
      }
    ]
  },

  {
    id: 4, phase: 1,
    title: "The Orchestrator",
    duration: "10 min",
    objective: "Chain all 5 skills and define the output contract for app.py to parse.",
    badge: "🎼",
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

If you ran all 5 in parallel (one call each, no shared context), the summary wouldn't know which bullets were rewritten, and the ATS score wouldn't reflect the actual changes. Context accumulation IS the value.`
      },
      {
        heading: "Live Code: agents/resume_tailor_agent.md",
        content: `Create \`agents/resume_tailor_agent.md\`:

\`\`\`markdown
# Resume Tailor Agent — Orchestrator

## Role
You are the Resume Tailor Agent. You take a job description and a current
resume, then produce a fully tailored resume package by running 5 skills
in sequence.

## Workflow (STRICT ORDER — never skip or reorder)

### Step 1: Parse the JD
Run jd_parser skill on the raw JD.
Extract: role, seniority, required skills, preferred skills, ATS keywords.

### Step 2: Analyze Gaps
Run gap_analyzer skill with: parsed JD + original resume.
Extract: match matrix, critical gaps, transferable skills, keyword overlap.

### Step 3: Rewrite Bullets
Run bullet_rewriter skill with: original bullets + ATS keywords + gap analysis.
Rewrite every bullet using the STAR-K formula.
Do NOT fabricate experience — only reframe existing work.

### Step 3b: Self-Check Bullets (before moving on)
Verify: (1) every bullet has a number, (2) no duplicate opening verbs
within a role, (3) no verb appears more than twice across all roles.
Only proceed to Step 4 once all three checks pass.

### Step 4: Generate Summary
Run summary_generator skill. Generate 3 variants. Recommend the highest-scoring one.
Count words. If over 60, cut from Sentence 2. Never cut the quantified achievement.

### Step 5: Score ATS Compatibility
Run ats_scorer. Produce before/after scorecard.
Formula: (0.5 × keyword%) + (0.2 × skills%) + (0.15 × summary) + (0.15 × format)

## Final Output Format

---
# RESUME TAILOR REPORT
## Target Role: [Title] at [Company]
## Generated: [Date]

### 1. TAILORED RESUME

**[CANDIDATE FULL NAME]**
[email] | [phone] | [LinkedIn or location]

**PROFESSIONAL SUMMARY**
[Recommended summary — 60 words max]

**EXPERIENCE**
**[Company Name]** — [Job Title] | [Month Year] – [Month Year or Present]
- [Rewritten bullet using STAR-K]

**EDUCATION**
**[School Name]** — [Degree] | [Year]

**SKILLS**
Technical: [comma-separated list]
Tools: [comma-separated list]

### 2. GAP ANALYSIS
[Match matrix + gap summary + strategies]

### 3. ATS SCORECARD
[Before/after scores + keyword audit]

### 4. NEXT STEPS
- [ ] Review rewritten bullets
- [ ] Save as .docx for maximum ATS compatibility
---

## Constraints
- Never fabricate skills, experience, or numbers
- Never insert commentary into Section 1 — save it for Section 2 or 3
- If keyword overlap < 30%, warn: "This role may be a significant stretch."
\`\`\``
      },
      {
        heading: "The Output Format IS the Parsing Contract",
        content: `This is the most important thing to understand about the whole system:

\`\`\`python
# In app.py, the parser does exactly this:
resume_section = _extract_section(result, "TAILORED RESUME")
# Looks for "### 1. TAILORED RESUME" heading, returns everything after it
# until the next ### heading

# Then:
generate_resume_pdf(resume_section)    # → clean 2-column PDF
generate_report_pdf(result)            # → analysis PDF (sections 2-4)
\`\`\`

If the orchestrator outputs \`## 1. Tailored Resume\` (lowercase, ## instead of ###), the parser fails to find it and the resume PDF is blank.

**Prompt engineering and software engineering are the same discipline.** The agent output is your API. Design it like one.

**Teach this:** Before writing a single line of Python, design your output format and decide how you'll parse it. Work backwards from the parsing logic to the prompt.`
      }
    ]
  },

  // ── PHASE 2: CODE ─────────────────────────────────────────────────────────
  {
    id: 5, phase: 2,
    title: "app.py — Skeleton & Prompt Loader",
    duration: "8 min",
    objective: "Build the Streamlit skeleton and load all 6 prompt files into one system prompt.",
    badge: "🧩",
    checklistItems: [
      "app.py created with st.set_page_config",
      "load_prompts() function written with @st.cache_data",
      "All 6 files concatenated in correct order",
      "Text input boxes for JD and resume added",
    ],
    sections: [
      {
        heading: "The Streamlit App in 3 Parts",
        content: `The entire app is 3 logical parts:

\`\`\`
Part 1: LOAD          load_prompts()         → reads 6 .md files into system prompt
Part 2: CALL          claude.messages.create() → one API call, returns full report
Part 3: RENDER        two download buttons   → resume PDF + analysis PDF
\`\`\`

That's it. The intelligence is in the prompts. The code is just plumbing.`
      },
      {
        heading: "Live Code: app.py Skeleton",
        content: `Create \`app.py\`:

\`\`\`python
import streamlit as st
import anthropic
import re
import io
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable, KeepInFrame
)
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

st.set_page_config(
    page_title="Resume Tailor Agent",
    page_icon="📄",
    layout="wide"
)

# ── 1. LOAD ALL PROMPTS ───────────────────────────────────────────────────────
@st.cache_data
def load_prompts():
    """
    Concatenate orchestrator + all 5 skills into one system prompt.
    @st.cache_data: reads files once, caches result — not re-read on every click.
    """
    import os
    base = os.path.dirname(__file__)
    system = open(os.path.join(base, "agents/resume_tailor_agent.md")).read()
    for skill in ["jd_parser", "gap_analyzer", "bullet_rewriter",
                  "summary_generator", "ats_scorer"]:
        system += "\\n\\n---\\n\\n"
        system += open(os.path.join(base, f"skills/{skill}.md")).read()
    return system

# ── 2. UI — INPUT BOXES ──────────────────────────────────────────────────────
st.markdown("## 📄 Resume Tailor Agent")
st.markdown("Paste a LinkedIn JD + your resume → two ATS-optimised PDFs")

col1, col2 = st.columns(2)
with col1:
    jd = st.text_area("📋 Job Description", height=320,
                      placeholder="Paste the full JD from LinkedIn...")
with col2:
    resume = st.text_area("📄 Current Resume", height=320,
                          placeholder="Paste your resume text here...")

_, run_col, _ = st.columns([3, 2, 3])
with run_col:
    run = st.button("🚀 Tailor My Resume", type="primary",
                    use_container_width=True)
\`\`\`

**Teach \`@st.cache_data\`:** Streamlit re-runs the entire script on every user interaction. Without caching, \`load_prompts()\` reads 6 files from disk on every button click. With it, files are read once and the result is stored in memory.`
      },
      {
        heading: "Why Concatenation Is the Right Pattern",
        content: `\`\`\`python
system = orchestrator.md + "---" + skill1.md + "---" + skill2.md + ...
\`\`\`

You might wonder: why not use a separate API call per skill?

**Option A: 5 separate API calls**
- Pros: Each call is isolated, easier to debug
- Cons: 5x cost, 5x latency, you manually pass context between calls

**Option B: 1 call with concatenated prompts (what we use)**
- Pros: $0.03/run, ~30 seconds, Claude carries context internally
- Cons: Less granular control, slightly harder to debug

For this use case, Option B wins. The orchestrator is explicit about the order and context flow. The model reliably follows it.

**The concatenation order matters.** Orchestrator first, then skills in the order the orchestrator references them. Claude reads the system prompt top-to-bottom. The orchestrator sets the "brain"; the skills set the "tools".`
      }
    ]
  },

  {
    id: 6, phase: 2,
    title: "app.py — API Call & Output Parser",
    duration: "8 min",
    objective: "Make the API call and split the output into two separate content streams.",
    badge: "⚡",
    checklistItems: [
      "API call written with correct max_tokens",
      "result stored in st.session_state",
      "_extract_section() function written",
      "resume_section and report sections correctly separated",
    ],
    sections: [
      {
        heading: "Live Code: API Call + Session State",
        content: `Add this to \`app.py\` after the input boxes:

\`\`\`python
if run:
    if not jd.strip() or not resume.strip():
        st.error("⚠️ Both fields are required.")
    else:
        with st.spinner("Analyzing JD → Finding gaps → Rewriting bullets → Scoring ATS…"):
            try:
                system = load_prompts()
                client = anthropic.Anthropic()
                # ANTHROPIC_API_KEY read automatically from environment
                msg = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=6000,      # full report is ~2,500 words — never truncate
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
                # Clear cached PDFs when new result comes in
                st.session_state.pop("resume_pdf", None)
                st.session_state.pop("report_pdf", None)
            except Exception as e:
                st.error(f"❌ Error: {e}")
\`\`\`

**Why \`st.session_state\`?**
Streamlit reruns the entire script on every interaction. Without session state, the result is lost the moment the user clicks "Download". Session state persists across reruns within a session.

**Why \`max_tokens=6000\`?**
The default is often 4,096. A full resume + gap analysis + ATS scorecard easily hits 2,500 words. Truncated output = broken PDF. Always set this explicitly for long-output agents.`
      },
      {
        heading: "Live Code: Output Parser",
        content: `The agent returns one markdown string. We split it by section heading.

\`\`\`python
def _split_sections(text):
    """Split Claude output into named sections using markdown headings."""
    heading_re = re.compile(
        r"^(#{1,3})\\s+(?:\\d+[\\.\:]?\\s*)?(.+)$",
        re.MULTILINE
    )
    sections = {}
    matches = list(heading_re.finditer(text))
    for i, m in enumerate(matches):
        title = re.sub(r"\\*+", "", m.group(2)).strip().upper()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections[title] = text[start:end].strip()
    return sections

def _extract_section(text, keyword):
    """Return content of the section whose heading contains keyword."""
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
        content = text[start:end].strip()
        if content:
            return content
    return ""
\`\`\`

**Teach the two-pass pattern:**
The AI's output format isn't always identical. Sometimes it uses \`### 1. TAILORED RESUME\`, sometimes \`**1. TAILORED RESUME**\`. Two passes handle both formats gracefully. Lesson: build your parser defensively — the AI is not always consistent.`
      },
      {
        heading: "Wire Results to Download Buttons",
        content: `After the API call block, add the results section:

\`\`\`python
if "result" in st.session_state:
    result = st.session_state["result"]

    # Extract role name for file naming
    role_match = re.search(r"Target Role:\\s*(.+)", result)
    target_role = role_match.group(1).strip() if role_match else "role"
    safe_role = re.sub(r"[^\\w\\s-]", "", target_role)[:40].replace(" ", "_")

    # Extract resume section (section 1 only)
    resume_section = _extract_section(result, "TAILORED RESUME")

    # Generate PDFs (cached — don't regenerate on every rerender)
    if "resume_pdf" not in st.session_state:
        st.session_state["resume_pdf"] = generate_resume_pdf(
            resume_section if resume_section else result,
            target_role
        )
        st.session_state["report_pdf"] = generate_report_pdf(result, target_role)

    # Two download buttons in the left column
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
    id: 7, phase: 2,
    title: "app.py — PDF Generation",
    duration: "7 min",
    objective: "Generate two visually distinct PDFs with ReportLab.",
    badge: "📄",
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
RESUME PDF                        ANALYSIS REPORT PDF
──────────────────────            ───────────────────────────────
Submit to employers.              Review privately, iterate.
No commentary.                    Full gap matrix, ATS score, next steps.
Clean two-column layout.          Tables, before/after scores, checklist.

generate_resume_pdf(              generate_report_pdf(
    resume_section,                   full_result,
    target_role                       target_role
)                                 )
\`\`\`

The critical distinction: **Section 1 only** goes to the resume PDF. **Sections 2-4** go to the analysis PDF. This separation prevents the recruiter from seeing your internal gap analysis or score.`
      },
      {
        heading: "ReportLab Minimum Viable Knowledge",
        content: `You only need 6 concepts to build both PDFs:

\`\`\`python
from reportlab.platypus import (
    SimpleDocTemplate,   # → creates the PDF file, manages pages
    Paragraph,           # → renders styled text (bold, italic, color)
    Spacer,              # → Spacer(1, N) = N points of vertical whitespace
    Table,               # → Table([[col1_content, col2_content]]) = side-by-side layout
    HRFlowable,          # → draws a horizontal line
    KeepInFrame,         # → scales content down to fit rather than crashing
)
from reportlab.lib.styles import ParagraphStyle   # → font, size, color, spacing
from reportlab.lib import colors
from reportlab.lib.units import inch
\`\`\`

**The two-column resume layout in 5 lines:**
\`\`\`python
LW = W * 0.60   # left column: 60% of page width
RW = W * 0.38   # right column: 38% of page width

# left_fl = list of flowables for left column
# right_fl = list of flowables for right column

body = Table([[left_fl, right_fl]], colWidths=[LW, RW])
\`\`\`

That's it. Table with one row, two cells, each cell containing a list of flowables.`
      },
      {
        heading: "The LayoutError Safety Net",
        content: `The most common ReportLab error:

\`\`\`
reportlab.platypus.doctemplate.LayoutError:
  Flowable ... too large on page 1
\`\`\`

This happens when a Table with ONE row is taller than the page. ReportLab can split multi-row tables across pages, but not single-row tables.

**Fix: wrap each column in KeepInFrame(mode='shrink')**

\`\`\`python
# Without this: LayoutError if resume > 1 page
# With this: content scales down to fit, never crashes

COL_H = letter[1] - 0.95*inch - 1.6*inch  # ~615 pt available

kif_left  = KeepInFrame(LW, COL_H, left_fl,  mode='shrink')
kif_right = KeepInFrame(RW, COL_H, right_fl, mode='shrink')

body = Table([[kif_left, kif_right]], colWidths=[LW, RW])
\`\`\`

\`mode='shrink'\` scales content proportionally to fit. For a standard 1-page resume, no shrinking happens. For edge cases (very long resume or accidentally passing the full result), it shrinks gracefully instead of crashing.

**Teach this:** Production code handles the unexpected. LayoutError is a silent failure — the user clicks Download and gets nothing. Always add safety nets around external library calls.`
      }
    ]
  },

  // ── PHASE 3: SHIP ─────────────────────────────────────────────────────────
  {
    id: 8, phase: 3,
    title: "Push to GitHub",
    duration: "5 min",
    objective: "Get the code into a GitHub repo so Streamlit Cloud can find it.",
    badge: "📦",
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

Create a repo on GitHub (github.com → New → name it \`resume-tailor-agent\` → Public → Create).

Then push:
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

**Critical:** Never push your API key. In development, it's in your environment:
\`\`\`bash
export ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

In Streamlit Cloud, it's in the Secrets panel (next step). The code reads it identically in both places:
\`\`\`python
client = anthropic.Anthropic()
# Reads ANTHROPIC_API_KEY automatically from environment OR from Streamlit secrets
\`\`\`

You don't write any secret-reading code. \`anthropic.Anthropic()\` handles it.`
      }
    ]
  },

  {
    id: 9, phase: 3,
    title: "Deploy to Streamlit Cloud",
    duration: "5 min",
    objective: "Make the app live at a public URL anyone can use.",
    badge: "🚀",
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
3. Select your repo → branch: **main** → Main file path: **app.py**
4. Click **Deploy**

That's it. Streamlit Cloud:
- Clones your repo
- Installs requirements.txt
- Runs \`streamlit run app.py\`
- Gives you a URL like \`yourapp.streamlit.app\`

The whole process takes ~2 minutes.`
      },
      {
        heading: "Add the API Key as a Secret",
        content: `After deploying:

**App → Settings → Secrets → Edit Secrets**

Paste this:
\`\`\`toml
ANTHROPIC_API_KEY = "sk-ant-your-key-here"
\`\`\`

Click **Save**. The app restarts and reads the key automatically.

**How it works behind the scenes:**
\`\`\`
Streamlit Secrets → injected into os.environ
          ↓
anthropic.Anthropic() → reads os.environ["ANTHROPIC_API_KEY"]
          ↓
Same code works locally (from export) and on cloud (from secrets)
\`\`\`

No code changes needed. The exact same \`anthropic.Anthropic()\` line works in both environments.`
      },
      {
        heading: "Your App is Live",
        content: `Visit your URL. Paste a JD and resume. Hit **Tailor My Resume**.

You'll see the spinner: *"Analyzing JD → Finding gaps → Rewriting bullets → Scoring ATS…"*

~30 seconds later: two download buttons appear.

**⬇️ Tailored Resume PDF** → two-column professional layout, ready to submit
**⬇️ Full Analysis Report PDF** → gap matrix, ATS scorecard, next steps

**What you just built:**
- A 5-skill AI pipeline running on Claude Sonnet
- Automated resume tailoring with STAR-K bullet rewrites
- Professional PDF generation with ReportLab
- Hosted web app accessible to anyone with the URL

**Total cost per run: ~$0.03**
**Time from prompt to live product: ~60 minutes**

This URL is now shareable. Put it in your LinkedIn Featured section. Everyone you know who job-hunts will use it.`
      }
    ]
  },

  {
    id: 10, phase: 3,
    title: "Debug, Iterate, and Extend",
    duration: "5 min",
    objective: "Know how to debug prompt issues and where to take the agent next.",
    badge: "🔧",
    checklistItems: [
      "Tested with a real JD + resume",
      "Understand the iteration loop: prompt → test → edit markdown → retest",
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

**Common issue: summary is over 60 words**
Fix: tighten the orchestrator constraint — "If over 60 words, cut from Sentence 2. Never cut the quantified achievement."

**Common issue: bullets don't have numbers**
Fix: in bullet_rewriter.md — "After rewriting ALL bullets, self-check: count how many lack a number. If any remain, rewrite them before finalising."

**Common issue: resume PDF is blank**
Fix: the output format isn't matching the parser. Add \`st.write(result)\` temporarily to see the raw output, check which heading format Claude used, and adjust the prompt to match the parser's expectation.`
      },
      {
        heading: "The 3 Most Common Failure Modes",
        content: `**Failure 1: Blank Resume PDF**
Cause: \`_extract_section\` can't find "TAILORED RESUME" in the output.
Debug: \`st.write(result)\` → look at the actual section heading Claude used.
Fix: Add the two-pass fallback or adjust the orchestrator's output format to be consistent.

---

**Failure 2: ReportLab LayoutError**
Cause: Content is taller than one page inside a single-row Table.
Fix: Add \`KeepInFrame(mode='shrink')\` around each column's content (already in the code we wrote).

---

**Failure 3: Fabricated Skills in Bullets**
Cause: Bullet rewriter added a skill from the JD that wasn't in the original resume.
Debug: Look for the ⚠️ FABRICATED tag in the output.
Fix: The constraint is already in bullet_rewriter.md. If it's still happening, strengthen it: "Before finalising, scan every bullet. If any bullet references a tool not present in the original resume, prepend ⚠️ FABRICATED and rewrite to remove the fabricated element."`
      },
      {
        heading: "What to Build Next",
        content: `Your agent is production-ready. Here's how to extend it:

**Immediate extensions (1-2 hours each):**
- Add \`skills/cover_letter.md\` → one more download button
- Add LinkedIn About section generator to the summary_generator skill
- Add a "match score" shown in the UI before downloading

**Architectural extensions (half day each):**
- Multi-turn conversation: "make bullet 3 more technical" → Claude edits only that bullet
- Memory layer: save past runs + feedback → agent improves over time ✅ (see Lesson 11)
- Batch mode: upload 5 JDs, get 5 tailored resumes at once

**The agent design pattern you just learned applies to ANY domain:**

\`\`\`
Contract analyst     → clause_extractor → risk_analyzer → redline_writer
Cold email agent     → prospect_researcher → pain_identifier → email_writer
Interview prep agent → jd_parser → question_generator → answer_coach
Code reviewer        → context_loader → issue_identifier → fix_suggester
\`\`\`

Same pattern: skills + orchestrator + thin wrapper + deploy. The only thing that changes is the domain knowledge in the .md files.`
      }
    ]
  },

  // ── LESSON 11 ─────────────────────────────────────────────────────────────
  {
    id: 11, phase: 3,
    title: "Add a Memory Layer",
    duration: "10 min",
    objective: "Make the agent learn from past runs using persistent JSON storage and a feedback loop.",
    badge: "🧠",
    checklistItems: [
      "memory.py created with save_run, save_feedback, get_memory_context",
      "skills/memory_context.md created (Step 0 skill)",
      "agents/resume_tailor_agent.md updated with Step 0",
      "app.py wired: memory injected into prompt, runs saved, 👍/👎 buttons showing",
    ],
    sections: [
      {
        heading: "The Four Intelligence Gaps",
        content: `By default, every API call is stateless. The agent has no idea what happened yesterday, last week, or 100 runs ago. This creates four gaps:

**Gap 1 — No conversation history**
Each call starts fresh. Whatever worked in the last run is forgotten.

**Gap 2 — No cross-session memory**
No database, no file, no record of past JDs, resumes, or scores. Day 100 looks exactly like Day 1.

**Gap 3 — No feedback loop**
You can tell the output is wrong, but the agent can't learn from that signal.

**Gap 4 — No learning from outcomes**
The agent makes the same judgment calls on run 100 as on run 1. It never gets better.

The fix is a two-component memory layer: a JSON persistence module and a memory skill.`
      },
      {
        heading: "memory.py — Persistent Run Storage",
        content: `Create **memory.py** in the project root:

\`\`\`python
import json, os, re, uuid
from collections import Counter
from datetime import datetime
from pathlib import Path

MEMORY_DIR = Path(__file__).parent / "memory"
RUNS_FILE  = MEMORY_DIR / "runs.json"
MAX_RUNS   = 50   # FIFO rolling window

def save_run(run_data: dict) -> str:
    """Persist a new run. Returns run_id (8-char hex)."""
    run_id = str(uuid.uuid4())[:8]
    entry = {
        "id":        run_id,
        "timestamp": datetime.now().isoformat(),
        "role":      run_data.get("role", "Unknown"),
        "ats_before": run_data.get("ats_before"),
        "ats_after":  run_data.get("ats_after"),
        "critical_gaps": run_data.get("critical_gaps", []),
        "rating": None,  # set later via save_feedback()
    }
    runs = _load_runs()
    runs.append(entry)
    _save_runs(runs)
    return run_id

def save_feedback(run_id: str, rating: int):
    """Attach user rating to an existing run. +1 = good, -1 = bad."""
    runs = _load_runs()
    for run in runs:
        if run.get("id") == run_id:
            run["rating"] = rating
            break
    _save_runs(runs)

def get_memory_context(n: int = 6) -> str:
    """Build a MEMORY CONTEXT block from the N most recent runs.
    Returns '' when no history exists — caller skips injection."""
    runs = _load_runs()
    if not runs:
        return ""
    # Prefer rated runs for richer context
    rated = [r for r in runs if r.get("rating") is not None]
    pool  = (rated if len(rated) >= 2 else runs)[-n:]
    # ... build and return the context string
\`\`\`

**Why FIFO at 50 runs?** The context block injected into the system prompt must stay compact. 50 runs at ~80 chars each is ~4KB — negligible. Older runs become less relevant and get dropped automatically.`
      },
      {
        heading: "Step 0: The Memory Skill",
        content: `Create **skills/memory_context.md** — this is the new Step 0 in the orchestrator:

\`\`\`markdown
# Memory Context Skill

## Role
You are the Memory Analyst. Before the orchestrator runs any skill, you read
the MEMORY CONTEXT block (if present in the system prompt) and distil it into
personalisation context for Steps 1–5.

## What to Extract
- From approved runs (✅): note ATS gain range, role patterns, bridged gaps
- From flagged runs (❌): note recurring gaps — address them more directly this run
- If no rated runs exist: apply no personalisation — proceed neutrally

## Output
Do NOT produce any visible output for this step.
Carry your insights as internal context into Steps 1–5 only.
\`\`\`

Then update **agents/resume_tailor_agent.md** — add Step 0 before Step 1:

\`\`\`markdown
### Step 0: Load Memory Context (if available)
Check whether a MEMORY CONTEXT block is present at the top of the system prompt.
If YES → run the memory_context skill:
  - Identify recurring gaps from flagged runs — address them more directly this run
  - Note approved run patterns (summary style, ATS gain range)
  - Carry insights silently into Steps 1–5
If NO memory context → skip this step and proceed to Step 1.
Never fabricate or invent memory.
\`\`\``
      },
      {
        heading: "Wiring It Into app.py",
        content: `Three changes to **app.py**:

**1 — Import memory module:**
\`\`\`python
import memory as mem
\`\`\`

**2 — Inject memory context into system prompt (before API call):**
\`\`\`python
base_system = load_prompts()        # cached static .md files
mem_context  = mem.get_memory_context()   # fresh every run
system = (
    mem_context + "\\n\\n---\\n\\n" + base_system
    if mem_context else base_system
)
\`\`\`

**3 — Save the run + show feedback buttons (after result arrives):**
\`\`\`python
run_meta = mem.extract_run_metadata(result)
run_id   = mem.save_run(run_meta)
st.session_state["run_id"]     = run_id
st.session_state["run_rating"] = None

# After download buttons:
run_id     = st.session_state.get("run_id")
cur_rating = st.session_state.get("run_rating")
if cur_rating is None:
    fb_up, fb_down, _ = st.columns([1, 1, 3])
    with fb_up:
        if st.button("👍  Yes"):
            mem.save_feedback(run_id, 1)
            st.session_state["run_rating"] = 1; st.rerun()
    with fb_down:
        if st.button("👎  No"):
            mem.save_feedback(run_id, -1)
            st.session_state["run_rating"] = -1; st.rerun()
elif cur_rating == 1:
    st.success("✅ Saved — future runs will build on this pattern.")
else:
    st.info("📝 Noted — future runs will adjust the approach.")
\`\`\`

**Key design choice:** \`load_prompts()\` is cached (static files never change during a session). \`get_memory_context()\` is NOT cached — it must see the latest feedback from runs earlier in the same session.`
      }
    ]
  }
];

const phaseColors = { 1: "#4361EE", 2: "#7C3AED", 3: "#10B981" };
const phaseLabels = { 1: "Prompts", 2: "Code", 3: "Ship" };

export default function Agent101Walkthrough() {
  const [selectedLesson, setSelectedLesson] = useState(0);
  const [expandedSections, setExpandedSections] = useState({ 0: true });
  const [completedLessons, setCompletedLessons] = useState(new Set());
  const [checkedItems, setCheckedItems] = useState({});
  const [activeTab, setActiveTab] = useState("content");

  const lesson = lessons[selectedLesson];

  const toggleSection = (idx) => {
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleComplete = (id) => {
    setCompletedLessons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCheckItem = (lessonId, idx) => {
    const key = `${lessonId}-${idx}`;
    setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatContent = (text) => {
    const lines = text.split('\n');
    let inCode = false;
    let codeLines = [];
    const result = [];
    let keyCount = 0;

    const flushCode = () => {
      if (codeLines.length > 0) {
        result.push(
          <div key={`code-${keyCount++}`} style={{
            background: '#0B1120',
            borderRadius: '8px',
            padding: '16px',
            margin: '12px 0',
            border: '1px solid #1E293B',
            overflowX: 'auto',
          }}>
            <pre style={{
              margin: 0, color: '#E2E8F0',
              fontSize: '12px', lineHeight: '1.65',
              fontFamily: "'Fira Code', 'Cascadia Code', monospace",
              whiteSpace: 'pre-wrap',
            }}>
              {codeLines.join('\n')}
            </pre>
          </div>
        );
        codeLines = [];
      }
    };

    lines.forEach((line, i) => {
      if (line.startsWith('```')) {
        if (inCode) { inCode = false; flushCode(); }
        else inCode = true;
        return;
      }
      if (inCode) { codeLines.push(line); return; }

      if (line.startsWith('### ')) {
        result.push(
          <p key={`h4-${i}`} style={{
            color: '#7DD3FC', fontSize: '11px', fontWeight: '700',
            marginTop: '18px', marginBottom: '6px',
            textTransform: 'uppercase', letterSpacing: '0.07em'
          }}>{line.slice(4)}</p>
        );
      } else if (line.startsWith('## ')) {
        result.push(
          <p key={`h3-${i}`} style={{
            color: '#E2E8F0', fontSize: '14px', fontWeight: '700',
            marginTop: '20px', marginBottom: '8px'
          }}>{line.slice(3)}</p>
        );
      } else if (/^\*\*(.+)\*\*$/.test(line.trim())) {
        result.push(
          <p key={`bold-${i}`} style={{
            color: '#CBD5E1', fontSize: '13px', fontWeight: '600',
            marginBottom: '4px', marginTop: '12px'
          }}>{line.trim().slice(2, -2)}</p>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.slice(2);
        const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        result.push(
          <div key={`li-${i}`} style={{
            display: 'flex', gap: '8px', marginBottom: '5px', paddingLeft: '4px'
          }}>
            <span style={{ color: '#4361EE', marginTop: '3px', flexShrink: 0, fontSize: '12px' }}>▸</span>
            <span style={{ color: '#94A3B8', fontSize: '13px', lineHeight: '1.6' }}>
              {parts.map((p, j) => {
                if (p.startsWith('**') && p.endsWith('**'))
                  return <strong key={j} style={{ color: '#CBD5E1' }}>{p.slice(2, -2)}</strong>;
                if (p.startsWith('`') && p.endsWith('`'))
                  return <code key={j} style={{
                    background: '#1E293B', color: '#7DD3FC',
                    padding: '1px 5px', borderRadius: '3px',
                    fontSize: '11px', fontFamily: 'monospace'
                  }}>{p.slice(1, -1)}</code>;
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
          <p key={`p-${i}`} style={{
            color: '#94A3B8', fontSize: '13px', lineHeight: '1.75', marginBottom: '8px'
          }}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**'))
                return <strong key={j} style={{ color: '#E2E8F0' }}>{p.slice(2, -2)}</strong>;
              if (p.startsWith('`') && p.endsWith('`'))
                return <code key={j} style={{
                  background: '#1E293B', color: '#7DD3FC',
                  padding: '1px 5px', borderRadius: '3px',
                  fontSize: '11px', fontFamily: 'monospace'
                }}>{p.slice(1, -1)}</code>;
              return p;
            })}
          </p>
        );
      }
    });

    flushCode();
    return result;
  };

  const quickRef = [
    { label: "Create folder structure",  cmd: "mkdir resume-tailor-agent && cd resume-tailor-agent && mkdir skills agents" },
    { label: "Install dependencies",     cmd: "pip install streamlit anthropic reportlab" },
    { label: "Set API key (local)",       cmd: "export ANTHROPIC_API_KEY=sk-ant-..." },
    { label: "Run locally",              cmd: "streamlit run app.py" },
    { label: "Init git repo",            cmd: "git init && git add . && git commit -m 'initial'" },
    { label: "Push to GitHub",           cmd: "git remote add origin https://github.com/YOU/resume-tailor-agent.git && git push -u origin main" },
    { label: "Test section extraction",  cmd: "st.write(_extract_section(result, 'TAILORED RESUME'))  # debug" },
    { label: "Streamlit deploy",         cmd: "share.streamlit.io → New App → select repo → app.py → Deploy" },
  ];

  const totalItems = lessons.reduce((acc, l) => acc + l.checklistItems.length, 0);
  const doneItems  = Object.values(checkedItems).filter(Boolean).length;

  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: '#0B1120',
      fontFamily: "'IBM Plex Sans', 'Inter', system-ui, sans-serif",
      color: '#E2E8F0', overflow: 'hidden'
    }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <div style={{
        width: '268px', flexShrink: 0,
        background: '#0F172A', borderRight: '1px solid #1E293B',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>

        {/* Sidebar header */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid #1E293B' }}>
          <div style={{
            fontSize: '10px', color: '#4361EE', fontWeight: '700',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '5px'
          }}>
            AGENT 101 · LIVE BUILD
          </div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#F1F5F9', lineHeight: '1.35' }}>
            Resume Tailor Agent
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
            Prompt → Code → Ship in 60 min
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: '12px', height: '4px', background: '#1E293B', borderRadius: '2px' }}>
            <div style={{
              height: '100%',
              width: `${(completedLessons.size / lessons.length) * 100}%`,
              background: 'linear-gradient(90deg, #4361EE, #7C3AED)',
              borderRadius: '2px', transition: 'width 0.4s ease'
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{completedLessons.size}/{lessons.length} steps done</span>
            <span style={{ color: '#22C55E' }}>{doneItems}/{totalItems} checks ✓</span>
          </div>
        </div>

        {/* Lesson list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
          {[1, 2, 3].map(phase => (
            <div key={phase} style={{ marginBottom: '6px' }}>
              <div style={{
                fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em',
                textTransform: 'uppercase', color: phaseColors[phase],
                padding: '8px 8px 4px', display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <span style={{
                  background: `${phaseColors[phase]}22`, color: phaseColors[phase],
                  borderRadius: '4px', padding: '1px 6px', fontSize: '9px'
                }}>
                  PHASE {phase}
                </span>
                {phaseLabels[phase]}
              </div>

              {lessons.filter(l => l.phase === phase).map(l => {
                const isSelected = lessons[selectedLesson]?.id === l.id;
                const isDone = completedLessons.has(l.id);
                const lessonChecks = l.checklistItems.length;
                const doneLessonChecks = l.checklistItems.filter((_, i) => checkedItems[`${l.id}-${i}`]).length;

                return (
                  <button key={l.id}
                    onClick={() => {
                      setSelectedLesson(lessons.indexOf(l));
                      setExpandedSections({ 0: true });
                      setActiveTab("content");
                    }}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '9px 10px', borderRadius: '6px', border: 'none',
                      cursor: 'pointer',
                      background: isSelected ? `${phaseColors[phase]}18` : 'transparent',
                      borderLeft: isSelected ? `2px solid ${phaseColors[phase]}` : '2px solid transparent',
                      marginBottom: '2px', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        flexShrink: 0, fontSize: '11px',
                        background: isDone ? '#22C55E' : (isSelected ? phaseColors[phase] : '#1E293B'),
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
                        }}>
                          {l.title}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#475569' }}>⏱ {l.duration}</span>
                          {doneLessonChecks > 0 && (
                            <span style={{ fontSize: '10px', color: '#22C55E' }}>
                              {doneLessonChecks}/{lessonChecks} ✓
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
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Lesson header */}
        <div style={{
          padding: '18px 28px 14px',
          borderBottom: '1px solid #1E293B', background: '#0F172A'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span style={{
                  background: `${phaseColors[lesson.phase]}22`,
                  color: phaseColors[lesson.phase],
                  fontSize: '10px', fontWeight: '700',
                  padding: '3px 8px', borderRadius: '12px',
                  textTransform: 'uppercase', letterSpacing: '0.06em'
                }}>
                  Phase {lesson.phase}: {phaseLabels[lesson.phase]} · Step {lesson.id}
                </span>
                <span style={{ color: '#475569', fontSize: '11px' }}>⏱ {lesson.duration}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>{lesson.badge}</span>
                <h2 style={{ margin: 0, fontSize: '19px', fontWeight: '700', color: '#F1F5F9' }}>
                  {lesson.title}
                </h2>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                🎯 {lesson.objective}
              </p>
            </div>

            <button
              onClick={() => toggleComplete(lesson.id)}
              style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: '8px',
                border: completedLessons.has(lesson.id) ? '1px solid #22C55E' : '1px solid #334155',
                background: completedLessons.has(lesson.id) ? 'rgba(34,197,94,0.1)' : 'transparent',
                color: completedLessons.has(lesson.id) ? '#22C55E' : '#64748B',
                cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {completedLessons.has(lesson.id) ? '✓ Done' : 'Mark Done'}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '14px' }}>
            {['content', 'checklist', 'quick-ref'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none',
                cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                background: activeTab === tab ? '#1E293B' : 'transparent',
                color: activeTab === tab ? '#E2E8F0' : '#64748B', transition: 'all 0.15s'
              }}>
                {tab === 'content' ? '📖 Steps' : tab === 'checklist' ? '✅ Checklist' : '⚡ Quick Ref'}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* ── CONTENT TAB ── */}
          {activeTab === 'content' && (
            <div>
              {lesson.sections.map((sec, i) => (
                <div key={i} style={{
                  background: '#0F172A', border: '1px solid #1E293B',
                  borderRadius: '10px', marginBottom: '10px', overflow: 'hidden'
                }}>
                  <button
                    onClick={() => toggleSection(i)}
                    style={{
                      width: '100%', padding: '14px 18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '26px', height: '26px', borderRadius: '6px',
                        background: expandedSections[i] ? `${phaseColors[lesson.phase]}22` : '#1E293B',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '700',
                        color: expandedSections[i] ? phaseColors[lesson.phase] : '#475569',
                        transition: 'all 0.2s', flexShrink: 0,
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
                        {formatContent(sec.content)}
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
                  onClick={() => { setSelectedLesson(Math.max(0, selectedLesson - 1)); setExpandedSections({ 0: true }); }}
                  disabled={selectedLesson === 0}
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: '1px solid #334155',
                    background: 'transparent',
                    color: selectedLesson === 0 ? '#334155' : '#94A3B8',
                    cursor: selectedLesson === 0 ? 'not-allowed' : 'pointer', fontSize: '13px'
                  }}
                >
                  ← Previous
                </button>
                <button
                  onClick={() => {
                    toggleComplete(lesson.id);
                    if (selectedLesson < lessons.length - 1) {
                      setSelectedLesson(selectedLesson + 1);
                      setExpandedSections({ 0: true });
                    }
                  }}
                  disabled={selectedLesson === lessons.length - 1}
                  style={{
                    padding: '10px 22px', borderRadius: '8px', border: 'none',
                    background: selectedLesson === lessons.length - 1
                      ? '#1E293B'
                      : `linear-gradient(135deg, ${phaseColors[lesson.phase]}, #7C3AED)`,
                    color: 'white',
                    cursor: selectedLesson === lessons.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: '600', transition: 'opacity 0.2s'
                  }}
                >
                  {selectedLesson === lessons.length - 1 ? '🎉 Shipped!' : 'Complete & Next →'}
                </button>
              </div>
            </div>
          )}

          {/* ── CHECKLIST TAB ── */}
          {activeTab === 'checklist' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 4px' }}>
                  Step Checklist
                </h3>
                <p style={{ color: '#64748B', fontSize: '12px', margin: 0 }}>
                  Check off each item as you complete it. Track your progress across the full build.
                </p>
              </div>

              {[1, 2, 3].map(phase => {
                const phaseLessons = lessons.filter(l => l.phase === phase);
                return (
                  <div key={phase} style={{ marginBottom: '24px' }}>
                    <div style={{
                      fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: phaseColors[phase],
                      marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <span style={{
                        background: `${phaseColors[phase]}22`, padding: '2px 8px',
                        borderRadius: '4px'
                      }}>Phase {phase}</span>
                      {phaseLabels[phase]}
                    </div>

                    {phaseLessons.map(l => (
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
                              <div
                                onClick={() => toggleCheckItem(l.id, ci)}
                                style={{
                                  width: '16px', height: '16px', borderRadius: '4px',
                                  border: `2px solid ${done ? phaseColors[phase] : '#334155'}`,
                                  background: done ? phaseColors[phase] : 'transparent',
                                  flexShrink: 0, marginTop: '1px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', transition: 'all 0.15s'
                                }}
                              >
                                {done && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                              </div>
                              <span
                                onClick={() => toggleCheckItem(l.id, ci)}
                                style={{
                                  fontSize: '13px', color: done ? '#475569' : '#94A3B8',
                                  textDecoration: done ? 'line-through' : 'none',
                                  lineHeight: '1.5', transition: 'color 0.15s'
                                }}
                              >
                                {item}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── QUICK REF TAB ── */}
          {activeTab === 'quick-ref' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 4px' }}>
                  Command Reference
                </h3>
                <p style={{ color: '#64748B', fontSize: '12px', margin: 0 }}>
                  Every command you'll run during the session
                </p>
              </div>

              <div style={{ display: 'grid', gap: '10px', marginBottom: '28px' }}>
                {quickRef.map((item, i) => (
                  <div key={i} style={{
                    background: '#0F172A', border: '1px solid #1E293B',
                    borderRadius: '8px', padding: '14px 16px'
                  }}>
                    <div style={{
                      fontSize: '10px', color: '#4361EE', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px'
                    }}>
                      {item.label}
                    </div>
                    <code style={{
                      display: 'block', background: '#0B1120', color: '#7DD3FC',
                      padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
                      fontFamily: "'Fira Code', monospace", lineHeight: '1.5'
                    }}>
                      {item.cmd}
                    </code>
                  </div>
                ))}
              </div>

              {/* File structure */}
              <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 12px' }}>
                Final File Structure
              </h3>
              <div style={{
                background: '#0F172A', border: '1px solid #1E293B',
                borderRadius: '8px', padding: '16px', marginBottom: '24px'
              }}>
                <pre style={{
                  margin: 0, color: '#94A3B8',
                  fontSize: '12px', lineHeight: '1.9',
                  fontFamily: "'Fira Code', monospace"
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
              <h3 style={{ color: '#E2E8F0', fontSize: '15px', margin: '0 0 12px' }}>
                Cost Per Run
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: "Model", value: "claude-sonnet-4-6" },
                  { label: "Input tokens / run", value: "~4,000" },
                  { label: "Output tokens / run", value: "~3,000" },
                  { label: "Cost per run", value: "~$0.03" },
                  { label: "100 runs / month", value: "~$3.00" },
                  { label: "Deployment", value: "Free (Streamlit Cloud)" },
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
