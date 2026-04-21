# 🤖 Agent 101 — Build a Resume Tailor Agent from Scratch
### A Complete Teaching Guide: Prompting → Architecture → Streamlit Deployment

---

> **Session Goal:** By the end of this session, students understand how to think about agents, how to structure multi-skill prompts, and how to ship a working AI product to the web.

---

## Table of Contents

1. [What Is an Agent? (Mental Model)](#1-what-is-an-agent-mental-model)
2. [The Problem We're Solving](#2-the-problem-were-solving)
3. [Prompt Engineering Fundamentals](#3-prompt-engineering-fundamentals)
4. [Agent Architecture: Skills + Orchestrator](#4-agent-architecture-skills--orchestrator)
5. [Deep Dive: Each Skill](#5-deep-dive-each-skill)
6. [The Orchestrator](#6-the-orchestrator)
7. [Building the App (Streamlit + PDF)](#7-building-the-app-streamlit--pdf)
8. [Hosting on Streamlit Cloud](#8-hosting-on-streamlit-cloud)
9. [Live Build Walkthrough](#9-live-build-walkthrough)
10. [Key Learnings & What to Build Next](#10-key-learnings--what-to-build-next)

---

## 1. What Is an Agent? (Mental Model)

### The Simple Definition

> An **agent** is an LLM that takes actions in a sequence — where the output of one step becomes the input of the next — to complete a goal that a single prompt cannot reliably do alone.

### The Spectrum

```
──────────────────────────────────────────────────────────────────────────────▶
        PROMPT                  CHAIN                    AGENT
──────────────────────────────────────────────────────────────────────────────
  "Summarize this."     "Extract → Translate →      "Parse → Analyze →
                         Summarize."                  Plan → Execute →
                                                       Self-check → Output"
  One LLM call.         Fixed sequence of calls.    Goal-driven sequence
                        No decision-making.          with internal decisions.
```

### What Makes This Agent an Agent?

The Resume Tailor Agent is an agent because it:

| Property | How We Use It |
|----------|---------------|
| **Sequential reasoning** | Each skill uses the output of the previous one |
| **Self-checking** | Step 3b: the agent audits its own bullets before continuing |
| **Conditional logic** | If keyword overlap < 30%, it issues a stretch-role warning |
| **Structured output contract** | Each skill returns a defined schema the next skill consumes |
| **Goal decomposition** | One big ask ("tailor my resume") broken into 5 solvable sub-tasks |

---

## 2. The Problem We're Solving

### Why Resumes Fail ATS Systems

```
                    ┌─────────────────────────┐
  You apply  ──────▶│   ATS (Applicant         │──── 75% REJECTED
                    │   Tracking System)        │     before human sees it
                    └─────────────────────────┘
                              │
                              │ What ATS scans for:
                              ▼
                    ┌─────────────────────────┐
                    │  • Exact keyword match   │
                    │  • Skills section format │
                    │  • Quantified bullets    │
                    │  • Summary relevance     │
                    └─────────────────────────┘
```

### The Gap

```
Job Description says:           Your Resume says:
─────────────────────           ─────────────────
"Apache Kafka"          ≠       "event streaming platform"
"cross-functional"      ≠       "worked with other teams"
"stakeholder alignment" ≠       "presented to managers"
"LTV optimization"      ≠       "improved customer retention"
```

**ATS sees zero matches. Your resume gets filtered out. You were qualified.**

### What the Agent Does

```
INPUT                          AGENT PIPELINE                    OUTPUT
──────                         ──────────────                    ──────
Job Description    ──────▶     Parse → Gap → Rewrite   ──────▶  Tailored Resume PDF
Current Resume     ──────▶     → Summarize → Score     ──────▶  Analysis Report PDF
                               (5 skills, ~30 seconds)
                               
Before: 42/100 ATS score
After:  84/100 ATS score  (+42 points)
```

---

## 3. Prompt Engineering Fundamentals

### The Four Layers of a Good Prompt

Every skill prompt in this agent follows this structure:

```
┌────────────────────────────────────────────────────────────────┐
│  LAYER 1: ROLE                                                  │
│  "You are a [specific expert] who [specific goal]..."           │
│  → Sets persona, activates domain knowledge                     │
├────────────────────────────────────────────────────────────────┤
│  LAYER 2: INPUT CONTRACT                                        │
│  "You will receive: (1) ... (2) ..."                            │
│  → Tells the model exactly what to expect                       │
├────────────────────────────────────────────────────────────────┤
│  LAYER 3: OUTPUT CONTRACT                                       │
│  "Return your output as: ### Section / | Table | ..."           │
│  → Forces deterministic, parseable output                       │
├────────────────────────────────────────────────────────────────┤
│  LAYER 4: CONSTRAINTS                                           │
│  "Never fabricate. Always quantify. Max 60 words..."            │
│  → Guards against hallucination and drift                       │
└────────────────────────────────────────────────────────────────┘
```

### Prompting Principles Used in This Agent

#### Principle 1 — Persona Specificity

❌ Weak:
```
You are an AI assistant. Help with resumes.
```

✅ Strong:
```
You are a resume optimization specialist. You rewrite experience bullets 
to maximize relevance to a specific JD while preserving honesty and 
authenticity.
```

**Why it works:** The model has seen millions of resumes from "resume specialists" — specificity activates that knowledge cluster.

---

#### Principle 2 — Output Schema (the most important one)

Tell the model EXACTLY what format to return. Show an example:

```markdown
### [Company Name] — [Title] ([Dates])

**Original bullet → Rewritten bullet**

1. ORIGINAL: "Built dashboards for the marketing team"
   REWRITTEN: "Designed and deployed 12 Tableau dashboards enabling the 
               marketing team to track campaign ROI across 5 channels, 
               reducing reporting time by 60%"
   CHANGES:   Added tool name, quantified output, added impact metric,
              matched JD keyword "campaign ROI"
```

**Why it works:** When the output format is shown as an example, the model mirrors it exactly. This makes downstream parsing reliable.

---

#### Principle 3 — Enumerated Rules (not paragraphs)

❌ Weak:
```
Try to use keywords from the job description and make sure bullets have 
numbers and don't fabricate things and keep it authentic.
```

✅ Strong:
```
### Quantification Rules
- Every bullet MUST have at least one number — no exceptions
- Acceptable number types: revenue ($), percentage (%), count (N), time saved
- If original has no numbers, embed a reasonable estimate directly
- After rewriting ALL bullets, self-check: count how many lack a number. 
  If any remain, rewrite them before finalising.
```

**Why it works:** The model follows numbered rules more reliably than dense prose. Self-check instructions trigger an internal audit loop.

---

#### Principle 4 — Separation of Concerns

Each skill does ONE job. The gap analyzer doesn't rewrite bullets. The bullet rewriter doesn't score ATS. This is the same principle as good software engineering.

```
Monolithic prompt (bad):              Skill chain (good):
─────────────────────────             ──────────────────
"Parse the JD AND analyze             Skill 1: Parse JD only
gaps AND rewrite bullets              Skill 2: Use Skill 1 output to analyze gaps
AND generate summary AND              Skill 3: Use Skills 1+2 output to rewrite
score ATS compatibility."             ...each step builds on the last
```

---

#### Principle 5 — Negative Constraints Are More Powerful Than Positive Ones

```
Instead of:                        Use:
─────────────────                  ──────────────────────────────────────────
"Be honest"                  →     "Never fabricate skills, experience, or numbers"
"Keep bullets concise"       →     "Maximum 2 lines per bullet"
"Sound professional"         →     "Remove all first-person pronouns. Start every 
                                    bullet with a past-tense action verb. Remove 
                                    soft/vague words: 'helped', 'assisted', 'various'"
```

**Why it works:** LLMs are trained to be agreeable. Negative constraints override default tendencies more reliably than positive nudges.

---

## 4. Agent Architecture: Skills + Orchestrator

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESUME TAILOR AGENT                                │
│                                                                             │
│   USER INPUT                                                                │
│   ┌───────────────┐    ┌───────────────┐                                   │
│   │ Job Description│    │ Current Resume│                                   │
│   └───────┬───────┘    └───────┬───────┘                                   │
│           └──────────┬─────────┘                                           │
│                      ▼                                                      │
│          ┌─────────────────────┐                                           │
│          │    ORCHESTRATOR     │  ← resume_tailor_agent.md                 │
│          │  (Chains 5 skills   │    Controls order, passes context          │
│          │   in strict order)  │    Never skips, never reorders             │
│          └──────────┬──────────┘                                           │
│                     │                                                       │
│        ┌────────────▼────────────────────────────────────────────┐        │
│        │                    SKILL PIPELINE                        │        │
│        │                                                          │        │
│   ┌────▼──────┐                                                   │        │
│   │  SKILL 1  │  jd_parser.md                                     │        │
│   │  Parse JD │  Input:  Raw JD text                              │        │
│   │           │  Output: Role, skills, ATS keywords, signals      │        │
│   └────┬──────┘                                                   │        │
│        │ passes structured JD object ▼                            │        │
│   ┌────▼──────┐                                                   │        │
│   │  SKILL 2  │  gap_analyzer.md                                  │        │
│   │  Analyze  │  Input:  Structured JD + original resume          │        │
│   │  Gaps     │  Output: Match matrix, critical gaps, keyword %   │        │
│   └────┬──────┘                                                   │        │
│        │ passes gap analysis ▼                                     │        │
│   ┌────▼──────┐                                                   │        │
│   │  SKILL 3  │  bullet_rewriter.md                               │        │
│   │  Rewrite  │  Input:  Bullets + ATS keywords + gap analysis    │        │
│   │  Bullets  │  Output: Every bullet rewritten with STAR-K       │        │
│   └────┬──────┘                                                   │        │
│        │ self-check (3b) ▼                                         │        │
│   ┌────▼──────┐                                                   │        │
│   │  SKILL 4  │  summary_generator.md                             │        │
│   │  Generate │  Input:  JD + rewritten bullets + gap analysis    │        │
│   │  Summary  │  Output: 3 scored summary variants                │        │
│   └────┬──────┘                                                   │        │
│        │ passes full package ▼                                     │        │
│   ┌────▼──────┐                                                   │        │
│   │  SKILL 5  │  ats_scorer.md                                    │        │
│   │  Score    │  Input:  Original + tailored resume + parsed JD   │        │
│   │  ATS      │  Output: Before/after scorecard with formula      │        │
│   └────┬──────┘                                                   │        │
│        └────────────────────────────────────────────────────────┘        │
│                      │                                                      │
│                      ▼                                                      │
│          ┌───────────────────────┐                                         │
│          │     FINAL OUTPUT      │                                         │
│          │  Structured Markdown  │                                         │
│          │  1,500 – 2,500 words  │                                         │
│          └───────────┬───────────┘                                         │
│                      │                                                      │
│           ┌──────────▼──────────┐                                         │
│           │     app.py          │                                          │
│           │  (Streamlit + PDF)  │                                          │
│           └──────────┬──────────┘                                         │
│                      │                                                      │
│      ┌───────────────┴────────────────┐                                    │
│      ▼                                ▼                                    │
│  📄 Tailored Resume PDF          📋 Analysis Report PDF                   │
│  (two-column layout)              (gap matrix + ATS + next steps)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

| Design Choice | Reason |
|---------------|--------|
| **Skills as `.md` files** | Easy to edit prompts without touching code; non-engineers can improve the agent |
| **Orchestrator is separate** | You can swap skills without changing the flow logic, and vice versa |
| **Strict ordering** | Each skill's output quality depends on the previous skill — order is load-bearing |
| **Context accumulation** | By Step 3, the model has: parsed JD + gap analysis + original bullets. Richer context = better output |
| **Single API call** | All 5 skills run in one `claude.messages.create()` call — the orchestrator handles internal chaining |

---

## 5. Deep Dive: Each Skill

### Skill 1 — JD Parser

**Purpose:** Turn a messy, boilerplate-heavy job description into a clean structured object.

```
RAW JD (messy)                       PARSED OUTPUT (structured)
──────────────                       ──────────────────────────
"About Us: We're a fast-growing      Role: Senior Data Analyst
startup disrupting the fintech       Seniority: Senior
space. We offer health, dental,      ATS Keywords: Python, SQL, dbt, 
vision, 401k, unlimited PTO.           Snowflake, stakeholder, A/B testing,
                                       LTV, churn, campaign ROI
We're looking for a Senior Data      
Analyst with 5+ years in Python,     Hidden Signals:
SQL, and experience with dbt         - Startup (scaling phase)
and Snowflake..."                    - Small team (no mention of direct reports)
                                     - High output expected (unlimited PTO + speed language)
```

**Key Prompt Decision:** "Preserve exact keyword phrasing from JD (don't synonym-swap)" — this is critical because ATS systems match exact strings, not concepts.

---

### Skill 2 — Gap Analyzer

**Purpose:** Be the honest career coach. Show exactly where the candidate fits and where they don't.

```
MATCH MATRIX (output):

┌─────────────┬────────────────────────┬──────────────────────┬─────────────┐
│  Category   │  JD Requirement        │  Resume Evidence     │  Status     │
├─────────────┼────────────────────────┼──────────────────────┼─────────────┤
│  Technical  │  Python 3+ years       │  "5 yrs of Python"   │  ✅ MATCH   │
│  Technical  │  Snowflake             │  Not mentioned       │  ❌ GAP     │
│  Technical  │  SQL (advanced)        │  "Complex SQL..."    │  🟡 PARTIAL │
│  Domain     │  BFSI experience       │  "Worked at HDFC"    │  ✅ MATCH   │
│  Soft       │  Stakeholder mgmt      │  "Presented to VP"   │  🔄 TRANSF. │
└─────────────┴────────────────────────┴──────────────────────┴─────────────┘
```

**What "TRANSFERABLE" means in prompt design:**
> A transferable skill must be justifiable in a 30-second verbal explanation.

This single constraint prevents the model from calling everything "transferable" just to be encouraging.

---

### Skill 3 — Bullet Rewriter

**Purpose:** The core skill. Transform vague bullets into keyword-rich, quantified STAR-K statements.

#### The STAR-K Formula

```
STAR-K =  Situation / Task  +  Action  +  Result  +  Keyword

Example transformation:
────────────────────────────────────────────────────────────────
BEFORE:  "Built dashboards for the marketing team"

         S/T      A          Result    Keyword
          ▼       ▼             ▼         ▼
AFTER:  "Designed 12 Tableau dashboards enabling marketing to 
         track campaign ROI across 5 channels, reducing 
         reporting time by 60%"
────────────────────────────────────────────────────────────────
What changed:
  + Tool added (Tableau)          → ATS keyword hit
  + Count added (12 dashboards)   → quantified
  + Scale added (5 channels)      → shows scope
  + Impact added (60% reduction)  → shows value
  + JD keyword embedded naturally → "campaign ROI"
```

#### Self-Check Loop (Step 3b)

This is what makes Skill 3 an *agent* behaviour, not just a prompt:

```
┌─────────────────┐
│  Rewrite all    │
│  bullets        │
└────────┬────────┘
         ▼
┌─────────────────┐        ┌──────────────────────────┐
│  CHECK 1:       │  FAIL  │  Rewrite bullets that    │
│  Every bullet   │───────▶│  lack numbers            │
│  has a number?  │        └────────────┬─────────────┘
└────────┬────────┘                     │
         │ PASS                         │ (re-check)
         ▼                              ▼
┌─────────────────┐        ┌──────────────────────────┐
│  CHECK 2:       │  FAIL  │  Replace duplicate       │
│  No duplicate   │───────▶│  opening verbs           │
│  opening verbs  │        └────────────┬─────────────┘
│  within a role? │                     │
└────────┬────────┘                     │ (re-check)
         │ PASS                         ▼
         ▼
┌─────────────────┐        ┌──────────────────────────┐
│  CHECK 3:       │  FAIL  │  Replace any verb used   │
│  No verb used   │───────▶│  3+ times across roles   │
│  3+ times       │        └────────────┬─────────────┘
│  across roles?  │                     │
└────────┬────────┘                     │ (re-check)
         │ PASS ALL                     ▼
         ▼
    Proceed to Skill 4
```

---

### Skill 4 — Summary Generator

**Purpose:** The recruiter reads the summary first. It must hook them in 3 sentences.

```
3 VARIANTS (model scores each):

┌──────────────────────────────────────────────────────────────────────────┐
│  VARIANT A — Technical-heavy                                              │
│  Score: 72/100                                                            │
│  "Python and SQL specialist with 5 years in analytical engineering..."    │
│  ← Strong on tools, weak on business impact                               │
├──────────────────────────────────────────────────────────────────────────┤
│  VARIANT B — Impact-heavy  ← RECOMMENDED                                 │
│  Score: 88/100                                                            │
│  "Data analyst who drove $2M in campaign efficiency gains by building     │
│   a cross-channel attribution system..."                                  │
│  ← Leads with result. Keywords embedded. Under 60 words.                  │
├──────────────────────────────────────────────────────────────────────────┤
│  VARIANT C — Domain-heavy                                                 │
│  Score: 79/100                                                            │
│  "Growth analytics specialist with deep expertise in D2C attribution..."  │
│  ← Strong domain signal, weaker on specific impact                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**The 60-word constraint:** "If over 60, cut from Sentence 2. Never cut the quantified achievement."
This teaches a key prompting pattern: **tell the model which thing to protect when making trade-offs**.

---

### Skill 5 — ATS Scorer

**Purpose:** Quantify the improvement so the candidate knows the tailoring actually worked.

```
SCORING FORMULA:

  (0.5 × keyword%)  ← keyword match is the biggest ATS factor
+ (0.2 × skills%)   ← skills section completeness
+ (0.15 × summary)  ← summary relevance (0-100)
+ (0.15 × format)   ← formatting compliance (0-100)
= ATS Score

BEFORE:                              AFTER:
────────────────────────             ────────────────────────
Keyword match: 36% × 0.5 = 18       Keyword match: 82% × 0.5 = 41
Skills match:  50% × 0.2 = 10       Skills match:  90% × 0.2 = 18
Summary:       40  × 0.15 =  6       Summary:       88  × 0.15 = 13.2
Format:        85  × 0.15 = 12.75    Format:        85  × 0.15 = 12.75
                          ──────                               ──────
                  Total:  46.75                       Total:  84.95
```

---

## 6. The Orchestrator

### What It Does

The orchestrator (`resume_tailor_agent.md`) is the **conductor**. It:
1. Tells the model which skills to run and in what order
2. Defines how context flows between skills
3. Specifies the exact output format for the final response
4. Enforces integrity constraints across the whole pipeline

### Key Orchestrator Concepts

#### Context Accumulation Pattern

```
After Step 1 (JD Parse), model knows:
  → Role title, required skills, ATS keywords, hidden signals

After Step 2 (Gap Analysis), model also knows:
  → What the resume has vs. doesn't have
  → Which gaps to address vs. omit

After Step 3 (Bullet Rewrite), model also knows:
  → All rewritten bullets with verified numbers and no duplicate verbs

By Step 4 (Summary), the model is writing a summary with FULL context:
  → The exact role, the candidate's real strengths, the gaps bridged,
    and the specific keywords that need to appear
```

This is why a single monolithic prompt produces worse results — context isn't available upfront.

#### Output Format as a Contract

```markdown
### 1. TAILORED RESUME

STRICT RULES:
- Zero commentary, analysis, or labels of any kind
- No notes, advisories, or "Note on X:" lines — anywhere in this section
- If you have a concern about a skill, save it for Section 2, never the resume

**[CANDIDATE FULL NAME]**
[email] | [phone] | [LinkedIn]

**PROFESSIONAL SUMMARY**
...
```

Why this matters for the code: `app.py` uses `_extract_section(result, "TAILORED RESUME")` to split the output and route content to the right PDF. If the format is inconsistent, parsing breaks.

---

## 7. Building the App (Streamlit + PDF)

### System Prompt Loading Pattern

```python
@st.cache_data
def load_prompts():
    """
    Concatenate all skill prompts into one system prompt.
    Skills are appended in the exact order the orchestrator calls them.
    """
    system = open("agents/resume_tailor_agent.md").read()
    for skill in ["jd_parser", "gap_analyzer", "bullet_rewriter",
                  "summary_generator", "ats_scorer"]:
        system += "\n\n---\n\n" + open(f"skills/{skill}.md").read()
    return system
```

**Why `@st.cache_data`?** This function reads files from disk. In Streamlit, every user interaction reruns the script. Without caching, you'd re-read all 6 files on every button click.

---

### API Call Pattern

```python
client = anthropic.Anthropic()
msg = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=6000,       # long output — resume + analysis can be ~2,500 words
    system=system,         # all 5 skills + orchestrator concatenated
    messages=[{
        "role": "user",
        "content": f"## Job Description\n{jd}\n\n## My Current Resume\n{resume}"
    }]
)
result = msg.content[0].text
```

**Why `max_tokens=6000`?** The full tailored report (resume + gap analysis + ATS scorecard + next steps) is typically 1,500–2,500 words. Claude's default is often 4,096 — set explicitly to avoid truncation.

---

### Parsing the Output

The agent returns one big markdown string. We split it into sections to route content correctly.

```
FULL RESULT (one string):
─────────────────────────────────────────────────────────
# RESUME TAILOR REPORT
## Target Role: Software Engineer at Google
## Generated: April 21, 2026

### 1. TAILORED RESUME
**Aakash Verma**
...resume content...

### 2. GAP ANALYSIS
| Skill | Status | ...

### 3. ATS SCORECARD
Before: 42 → After: 84

### 4. NEXT STEPS
- [ ] Review bullets
─────────────────────────────────────────────────────────

SPLIT INTO:
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  resume_section             │   │  report_sections             │
│  (Section 1 only)           │   │  (Sections 2, 3, 4)         │
│                             │   │                             │
│  → generate_resume_pdf()    │   │  → generate_report_pdf()    │
│                             │   │                             │
│  Output: Two-column         │   │  Output: Analysis report    │
│  professional layout        │   │  with tables and scorecard  │
└─────────────────────────────┘   └─────────────────────────────┘
```

```python
# Splitting logic
def _extract_section(text, keyword):
    """Find the section heading containing keyword, return its content."""
    heading_re = re.compile(r"^#{1,3}\s+(?:\d+[\.\:]?\s*)?(.+)$", re.MULTILINE)
    matches = list(heading_re.finditer(text))
    for i, m in enumerate(matches):
        if keyword.upper() in m.group(1).upper():
            end = matches[i+1].start() if i+1 < len(matches) else len(text)
            return text[m.end():end].strip()
    return ""

resume_section = _extract_section(result, "TAILORED RESUME")
```

---

### PDF Generation Architecture

```
TWO PDF GENERATORS
──────────────────

generate_resume_pdf(resume_section)              generate_report_pdf(full_result)
────────────────────────────────────            ──────────────────────────────────
┌─────────────────────────────────┐            ┌──────────────────────────────────┐
│ Header (full width):            │            │ Report header + metadata         │
│  [Avatar] Name                  │            │                                  │
│           Role | Contact        │            │ Section 2: GAP ANALYSIS          │
├─────────────────┬───────────────┤            │  Match matrix table              │
│ LEFT COLUMN     │ RIGHT COLUMN  │            │  Critical gaps                   │
│ (60% width)     │ (38% width)   │            │  Keyword overlap                 │
│                 │               │            │                                  │
│ SUMMARY         │ CERTIFICATIONS│            │ Section 3: ATS SCORECARD         │
│ (text)          │ (titles)      │            │  Before/after comparison         │
│                 │               │            │  Formula breakdown               │
│ EXPERIENCE      │ ACHIEVEMENTS  │            │                                  │
│ Company ────    │               │            │ Section 4: NEXT STEPS            │
│ Job Title       │ SKILLS        │            │  Checkbox checklist              │
│ 📅 Date         │ [tag][tag]    │            │                                  │
│ • bullet        │ [tag][tag]    │            │ Footer note                      │
│ • bullet        │               │            └──────────────────────────────────┘
│                 │ EDUCATION     │
│ EDUCATION       │ (if right)    │
└─────────────────┴───────────────┘
                │
                ▼
  KeepInFrame(mode='shrink')
  ← safety net so it never crashes,
    even if content exceeds 1 page
```

---

### ReportLab Key Concepts (Minimal Viable Knowledge)

| Concept | What It Does | Used For |
|---------|-------------|----------|
| `SimpleDocTemplate` | Creates a PDF file with auto page management | Main document container |
| `Paragraph` | Renders styled text (bold, italic, color) | All text content |
| `Table([[col1, col2]])` | Places two lists of content side-by-side | Two-column layout |
| `HRFlowable` | Draws a horizontal line | Section dividers |
| `Spacer(1, N)` | Adds N points of vertical whitespace | Breathing room between elements |
| `ParagraphStyle` | Defines font, size, color, spacing for text | Custom text styles |
| `KeepInFrame` | Scales content down to fit in given dimensions | Prevents LayoutError |
| `Drawing + Ellipse` | Draws shapes (circle for avatar) | Profile avatar circle |

---

## 8. Hosting on Streamlit Cloud

### Directory Structure Required

```
your-repo/
├── app.py                ← entry point (must be named app.py or specified)
├── requirements.txt      ← all Python dependencies
├── skills/               ← skill prompts
│   ├── jd_parser.md
│   ├── gap_analyzer.md
│   ├── bullet_rewriter.md
│   ├── summary_generator.md
│   └── ats_scorer.md
└── agents/
    └── resume_tailor_agent.md
```

### requirements.txt

```
streamlit
anthropic
reportlab
```

That's it. Three lines.

### Deployment Flow

```
Step 1: Push to GitHub
──────────────────────
git init
git add .
git commit -m "initial: resume tailor agent"
git remote add origin https://github.com/YOUR_USERNAME/resume-tailor-agent
git push -u origin main


Step 2: Connect to Streamlit Cloud
────────────────────────────────────
1. Go to  share.streamlit.io
2. Click  New App
3. Select  your GitHub repo
4. Set    Main file path: app.py
5. Click  Deploy


Step 3: Add API Key as Secret
──────────────────────────────
In Streamlit Cloud:
  Settings → Secrets → Add:
  
  ANTHROPIC_API_KEY = "sk-ant-..."

In app.py, the API key is read automatically:
  client = anthropic.Anthropic()
  # Reads ANTHROPIC_API_KEY from environment — works locally AND on cloud
```

### Deployment Architecture

```
                              STREAMLIT CLOUD
┌──────────┐   push    ┌─────────────────────────────────────────────┐
│  GitHub  │──────────▶│                                             │
│  Repo    │           │   ┌─────────────┐   runs    ┌───────────┐  │
└──────────┘           │   │  Python env │──────────▶│  app.py   │  │
                       │   │  (Docker)   │           └─────┬─────┘  │
                       │   └─────────────┘                 │        │
                       │                                   │        │
                       │   ┌─────────────┐                 │ HTTP   │
                       │   │  Secrets    │ API key         │        │
                       │   │  (encrypted)│─────────────────▼        │
                       │   └─────────────┘           Anthropic API  │
                       └─────────────────────────────────────────────┘
                                         │
                                         │  HTTPS
                                         ▼
                              ┌─────────────────────┐
                              │    Browser (User)    │
                              │  yourapp.streamlit.  │
                              │       app/           │
                              └─────────────────────┘
```

---

## 9. Live Build Walkthrough

Use this checklist to build the agent live in the session:

### Phase 1 — Prompts (15 min)

```
□ Create folder structure:
  mkdir resume-tailor-agent
  cd resume-tailor-agent
  mkdir skills agents

□ Write Skill 1 (jd_parser.md) live:
  - Role definition
  - Input description
  - Output schema with example
  - Constraints list

□ Explain: why this structure vs. one big prompt?
  DEMO: run same JD through (a) bare prompt, (b) structured skill
  → show how structured output is parseable
```

### Phase 2 — Orchestrator (10 min)

```
□ Write resume_tailor_agent.md:
  - Strict ordering constraint
  - Context flow between steps
  - Self-check loop (Step 3b)
  - Final output format

□ Key point to emphasize:
  The output format IS the API contract.
  If the format is inconsistent, the parsing in app.py breaks.
  Prompt engineering and software engineering are the same discipline.
```

### Phase 3 — App (20 min)

```
□ Create app.py with:
  1. load_prompts()          → concatenate all .md files
  2. Text input boxes        → JD and resume
  3. API call                → one claude.messages.create()
  4. _extract_section()      → split output by section
  5. Download buttons        → two PDFs

□ Run locally:
  export ANTHROPIC_API_KEY=sk-ant-...
  streamlit run app.py

□ Demo: paste sample JD + resume, show live output
```

### Phase 4 — Deploy (10 min)

```
□ git init && git add . && git commit -m "initial"
□ Create GitHub repo → push
□ Open share.streamlit.io → New App → select repo
□ Add ANTHROPIC_API_KEY as secret → Deploy
□ Share URL — your agent is live for anyone in the world to use
```

---

## 10. Key Learnings & What to Build Next

### The 5 Big Ideas From This Session

```
┌─────┬────────────────────────────────────────────────────────────────────┐
│  1  │  AGENTS = sequential skills, not magic                             │
│     │  An agent is just an LLM that calls itself (or other prompts)      │
│     │  multiple times, where each call gets better context               │
├─────┼────────────────────────────────────────────────────────────────────┤
│  2  │  OUTPUT FORMAT IS EVERYTHING                                        │
│     │  If you can't parse the output, you can't build on top of it.      │
│     │  Design your schema before you write the prompt body.              │
├─────┼────────────────────────────────────────────────────────────────────┤
│  3  │  CONSTRAINTS > INSTRUCTIONS                                         │
│     │  "Never fabricate" works better than "be honest".                  │
│     │  Negative constraints override default model tendencies.           │
├─────┼────────────────────────────────────────────────────────────────────┤
│  4  │  SELF-CHECKS TURN PROMPTS INTO AGENTS                              │
│     │  Adding "audit your output before proceeding" triggers             │
│     │  an internal loop — the model catches its own mistakes.            │
├─────┼────────────────────────────────────────────────────────────────────┤
│  5  │  SHIP FAST                                                          │
│     │  3 lines in requirements.txt. GitHub push. Streamlit deploy.       │
│     │  You can go from prompt to live product in under 1 hour.           │
└─────┴────────────────────────────────────────────────────────────────────┘
```

### The Agent Design Pattern (Reusable Template)

```
For ANY agent you build, follow this template:

1. DECOMPOSE the task into 3-7 sequential sub-tasks
   → What must be known BEFORE each step can run?

2. WRITE A SKILL for each sub-task
   → Role + Input Contract + Output Schema + Constraints

3. WRITE AN ORCHESTRATOR that chains them
   → Strict order + Context flow + Final output format

4. BUILD A THIN WRAPPER (Streamlit, CLI, API endpoint)
   → Load prompts → Call API → Parse output → Render/export

5. DEPLOY
   → GitHub + Streamlit Cloud (or Vercel/Railway for APIs)
```

### What You Can Build With This Pattern

| Agent | Skills Needed | Time to Build |
|-------|--------------|---------------|
| **Cover Letter Generator** | jd_parser → tone_analyzer → letter_writer | 2 hrs |
| **LinkedIn Post Writer** | topic_extractor → hook_generator → post_writer → cta_optimizer | 3 hrs |
| **Interview Prep Coach** | jd_parser → question_generator → answer_frameworks → feedback_scorer | 4 hrs |
| **Cold Email Personalization** | prospect_researcher → pain_identifier → email_writer → subject_tester | 3 hrs |
| **Proposal Writer** | rfp_parser → scope_analyzer → proposal_writer → executive_summary | 4 hrs |

---

## Appendix A — Prompting Cheat Sheet

```
STRUCTURE A SKILL PROMPT
─────────────────────────
## Role
You are a [specific expert] who [specific action verb + goal].

## Input
[Numbered list of exactly what the skill receives]

## Output Format
[Exact schema with headers, tables, examples — show, don't just describe]

## Constraints
- [Negative constraint: never, must not, always]
- [Quantitative constraint: maximum X words, at least N items]
- [Quality constraint: what self-check to perform before finalizing]
```

```
PROMPTING PATTERNS THAT WORK
──────────────────────────────
Force structured output:     "Return your output as a markdown table with columns: X, Y, Z"
Prevent hallucination:       "Never add [X] not present in the input"
Force self-check:            "After completing [task], count [condition]. If [violation], fix before finalising."
Protect key content:         "If you must cut for length, cut from Sentence 2. Never cut the quantified achievement."
Define exact boundaries:     "Include only sections that exist in the original. Do NOT add sections that weren't there."
Grade outputs explicitly:    "Score each variant 1-100. Justify the score. Recommend the highest."
```

---

## Appendix B — Common Mistakes & Fixes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Vague role definition | Generic, unhelpful output | Add specific domain + action verb to role |
| No output schema | Inconsistent formatting across runs | Define exact markdown structure with examples |
| Missing constraints | Model adds commentary, makes things up | Add explicit "Never X", "Always Y" rules |
| Monolithic prompt | Quality drops on complex tasks | Break into sequential skills |
| No self-check step | Missed requirements, duplicate verbs | Add "Before finalising, verify: [checklist]" |
| `width="100%"` in Table cells | ReportLab LayoutError | Use absolute pixel width or `Spacer` |
| Single-row Table (multi-page) | LayoutError when content overflows | Wrap cells in `KeepInFrame(mode='shrink')` |
| `_extract_section` returning `""` | Blank PDF | Two-pass extraction: markdown headings first, bold-heading fallback second |

---

*Built with ❤️ for Agent 101 · Resume Tailor Agent v1.2 · github.com/akv803101/resume-tailor-agent*
