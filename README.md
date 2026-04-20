<div align="center">

# 📄 Resume Tailor Agent

### AI-powered resume tailoring that turns a generic CV into an ATS-optimized application — in under 30 seconds.

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Claude](https://img.shields.io/badge/Claude-Sonnet_4.6-D97706?style=for-the-badge&logo=anthropic&logoColor=white)](https://www.anthropic.com/)
[![Streamlit](https://img.shields.io/badge/Streamlit-App-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white)](https://streamlit.io/)
[![ReportLab](https://img.shields.io/badge/ReportLab-PDF_Export-2D9CDB?style=for-the-badge)](https://www.reportlab.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

**Paste a LinkedIn JD + your resume → get a tailored, ATS-scored resume downloaded as PDF**

[🚀 Quick Start](#-quick-start) · [🏗 Architecture](#-architecture) · [✨ Features](#-features) · [📸 Output](#-sample-output) · [☁️ Deploy](#️-deploy-to-streamlit-cloud)

</div>

---

## 🎯 What It Does

Most job seekers send the same resume to every role. ATS systems reject 75% of applications before a human ever sees them — not because candidates are underqualified, but because their resume doesn't speak the job description's language.

This agent fixes that. You paste a job description and your current resume, and in ~30 seconds it produces:

| Output | What's Inside |
|--------|--------------|
| 📝 **Tailored Resume** | Every bullet rewritten with STAR-K formula + JD keywords |
| 🔍 **Gap Analysis** | Match matrix showing what aligns, what's missing, what's transferable |
| 📊 **ATS Scorecard** | Before vs. after score (typically 35% → 82%+) |
| ⬇️ **PDF Download** | Styled, professional report ready to share |

---

## ✨ Features

- **5-skill sequential pipeline** — each skill enriches the output of the previous one
- **STAR-K bullet formula** — Situation, Task, Action, Result + Keyword naturally embedded
- **Honest gap analysis** — never fabricates experience; flags anything questionable with ⚠️
- **3 professional summary variants** — Technical-heavy, Impact-heavy, Domain-heavy, auto-scored
- **ATS compatibility scoring** — deterministic formula: `(0.5 × keyword%) + (0.2 × skills%) + (0.15 × summary) + (0.15 × format)`
- **PDF export** — styled ReportLab PDF with tables, color headers, and keyword audit
- **~$0.03 per run** — ~7,000 tokens on Claude Sonnet

---

## 🏗 Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│  LinkedIn JD (text) │     │  Current Resume (text)│
└──────────┬──────────┘     └───────────┬───────────┘
           │                            │
           └──────────┬─────────────────┘
                      ▼
          ┌───────────────────────┐
          │  resume_tailor_agent  │  ← Orchestrator
          │  (chains 5 skills)    │
          └──────────┬────────────┘
                     │
        ┌────────────▼────────────────────────────────┐
        │                                             │
   ┌────▼─────┐  ┌──────────┐  ┌──────────┐  ┌──────▼──────┐  ┌───────────┐
   │ Skill 1  │→ │ Skill 2  │→ │ Skill 3  │→ │  Skill 4    │→ │  Skill 5  │
   │jd_parser │  │gap_       │  │bullet_   │  │summary_     │  │ats_scorer │
   │          │  │analyzer  │  │rewriter  │  │generator    │  │           │
   └──────────┘  └──────────┘  └──────────┘  └─────────────┘  └─────┬─────┘
                                                                      │
                              ┌───────────────────────────────────────▼──────┐
                              │              FINAL OUTPUT                     │
                              │  Tailored Resume + Gap Report + ATS Score     │
                              │  → Downloadable as styled PDF                 │
                              └───────────────────────────────────────────────┘
```

### Pipeline Data Flow

| Step | Skill | Input | Output | Why It Matters |
|------|-------|-------|--------|----------------|
| 1 | `jd_parser.md` | Raw JD text | Structured role object (title, skills, ATS keywords) | You must understand the target before adapting |
| 2 | `gap_analyzer.md` | Parsed JD + Resume | Match matrix: matched / missing / transferable skills | Diagnosis before treatment |
| 3 | `bullet_rewriter.md` | Resume bullets + JD keywords + gaps | Rewritten bullets with keywords woven in naturally | Keyword alignment is the #1 ATS factor |
| 4 | `summary_generator.md` | JD + rewritten bullets + gap report | 2-3 sentence summary tailored to this specific role | Summary is read first — must hook the recruiter |
| 5 | `ats_scorer.md` | Original + tailored resume + JD | ATS score (before/after), keyword audit, formatting flags | Quality gate before submission |

---

## 📁 Project Structure

```
resume-tailor-agent/
├── skills/
│   ├── jd_parser.md           # Skill 1: Extract role structure & ATS keywords
│   ├── gap_analyzer.md        # Skill 2: Match matrix & gap strategies
│   ├── bullet_rewriter.md     # Skill 3: STAR-K bullet rewrites
│   ├── summary_generator.md   # Skill 4: 3 scored summary variants
│   └── ats_scorer.md          # Skill 5: Before/after ATS scorecard
├── agents/
│   └── resume_tailor_agent.md # Orchestrator — chains all 5 skills
├── examples/
│   ├── sample_jd.txt          # Sample Senior Data Analyst JD
│   ├── sample_resume.txt      # Sample generic resume
│   └── sample_output.md       # Sample tailored report (before/after)
├── app.py                     # Streamlit web app with PDF download
├── resume_agent.py            # CLI runner
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- [Anthropic API key](https://console.anthropic.com) (~$0.03/run on Sonnet)

### Option A — Streamlit Web App (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/akv803101/resume-tailor-agent.git
cd resume-tailor-agent

# 2. Install dependencies
pip install streamlit anthropic reportlab

# 3. Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# 4. Run
streamlit run app.py
```

Open **http://localhost:8501**, paste a JD + resume, and hit **Tailor My Resume**. Download the PDF report when done.

---

### Option B — CLI Script

```bash
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-...

python resume_agent.py examples/sample_jd.txt examples/sample_resume.txt
# → saves to output/tailored_report.md
```

---

## 📸 Sample Output

### Before → After ATS Score

```
Original Resume:  ████░░░░░░  42 / 100  (36% keyword match)
Tailored Resume:  ████████░░  84 / 100  (82% keyword match)  ✅
```

### Bullet Rewrite Example

**Original:**
> "Built dashboards for the marketing team"

**Rewritten (STAR-K):**
> "Designed and deployed 12 Tableau dashboards enabling the marketing team to track campaign ROI across 5 channels, reducing reporting time by 60%"

*Changes made: Added tool (Tableau), quantified output (12 dashboards, 5 channels), added impact metric (60% reduction), matched JD keyword "campaign ROI"*

### Professional Summary (Impact-heavy variant)
> "Data analyst with 5 years of experience in growth analytics, specializing in SQL, Python, and A/B testing for D2C environments. Delivered ~$2M in campaign efficiency gains at Acme Corp by building a cross-channel attribution dashboard tracking ROAS across 5 paid media channels. Seeking a Senior Data Analyst role to bring structured LTV and churn frameworks to a data-driven growth team."

---

## 🧠 The Core Innovation: STAR-K Formula

Standard resume advice says STAR (Situation-Task-Action-Result). Adding **K (Keyword)** makes every bullet do double duty: it tells a story AND matches the ATS scan.

```
[Action Verb] + [What you did] + [Scale/scope] + [Result with number] + [JD keyword naturally embedded]
```

This is what separates a **40% ATS score from an 85%**.

---

## 🔒 Integrity First

The agent **never fabricates experience**. Constraints baked into every skill:

- Only reframes what exists — never invents skills or numbers
- Flags any suspect rewrite with `⚠️ FABRICATED`
- `TRANSFERABLE` status requires a genuine connection justifiable in a 30-second verbal explanation
- If keyword overlap < 30%, warns the user: *"This role may be a significant stretch"*

---

## ☁️ Deploy to Streamlit Cloud

1. Fork this repo
2. Go to [streamlit.io/cloud](https://streamlit.io/cloud) → **New App** → select your fork
3. Set **Main file:** `app.py`
4. Add `ANTHROPIC_API_KEY` under **Secrets**
5. Deploy — share the URL in your LinkedIn Featured section 🚀

---

## 💰 Cost & API

| Item | Detail |
|------|--------|
| Model | `claude-sonnet-4-6` |
| Input tokens | ~4,000 per run |
| Output tokens | ~3,000 per run |
| Cost per run | **~$0.03** |
| 100 runs/month | **~$3.00** |

Get your API key: [console.anthropic.com](https://console.anthropic.com)

---

## 🧪 Test Scenarios

| Scenario | JD vs Resume | Expected Behaviour |
|----------|-------------|-------------------|
| Easy (High Match) | Senior Data Analyst / Data Analyst resume, 70%+ overlap | Surgical keyword swaps, ATS score: 65% → 88% |
| Medium (Career Pivot) | AI Consultant / Data Engineer resume, 40-50% overlap | Reframes engineering work as consulting-adjacent |
| Hard (Low Match) | Product Manager / Backend Engineer resume, 20-30% | Warns "significant stretch", surfaces transferable skills |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / LLM | Anthropic Claude Sonnet 4.6 |
| Web UI | Streamlit |
| PDF Generation | ReportLab |
| Language | Python 3.9+ |
| Prompt Architecture | Multi-skill agent with sequential orchestration |

---

## 📄 License

MIT License — free to use, modify, and deploy. If you build something cool on top of this, a ⭐ is appreciated!

---

<div align="center">

Built by [Aakash](https://github.com/akv803101) · Powered by [Claude](https://www.anthropic.com/) · Inspired by the IntelliBridge Build & Sell AI curriculum

*The most powerful version of this agent is the one you deploy for yourself, land a better job with, and then add to your portfolio: "I built an AI agent that tailored my resume and got me this role."*

</div>
