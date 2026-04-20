---
name: resume-tailor-agent
description: "Tailor a resume to a specific LinkedIn job description and download it as a PDF. Use this skill when the user wants to: tailor their resume, optimize resume for ATS, match resume to a job description, rewrite resume bullets, get an ATS score, or prepare a job application. Triggers: 'tailor my resume', 'optimize resume for this job', 'rewrite my resume', 'ATS score', 'match resume to JD', 'job application resume'."
---

# Resume Tailor Agent Skill

## What This Skill Does

Runs the full 5-skill Resume Tailor Agent pipeline when the user wants to tailor their resume to a job description.

## Trigger Conditions

Use this skill when the user says anything like:
- "Tailor my resume to this job"
- "Help me optimize my resume for ATS"
- "Rewrite my resume for this role"
- "What's my ATS score for this job?"
- "I want to apply to [role] — help me with my resume"
- "Match my resume to this job description"

## Workflow

When this skill is triggered, follow these steps:

### Step 1 — Gather Inputs
Ask the user for two things (if not already provided):
1. The LinkedIn job description (paste as text, or provide URL)
2. Their current resume (paste as text, or upload a file)

Use AskUserQuestion if either is missing.

### Step 2 — Run the Pipeline
Load the full system prompt by combining:
- `agents/resume_tailor_agent.md` (orchestrator)
- `skills/jd_parser.md`
- `skills/gap_analyzer.md`
- `skills/bullet_rewriter.md`
- `skills/summary_generator.md`
- `skills/ats_scorer.md`

Then process both inputs through the pipeline in strict order:
1. **Parse the JD** → extract role, seniority, ATS keywords
2. **Analyze gaps** → match matrix (MATCH / GAP / PARTIAL / TRANSFERABLE)
3. **Rewrite bullets** → STAR-K formula with JD keywords woven in
4. **Generate summary** → 3 variants scored on JD alignment, differentiation, ATS density
5. **Score ATS** → before/after scorecard with keyword audit

### Step 3 — Deliver Output
Present results in four sections:
1. **Tailored Resume** — full resume with rewritten bullets and recommended summary
2. **Gap Analysis** — match matrix + strategies for each gap
3. **ATS Scorecard** — before/after scores + keyword audit + formatting checklist
4. **Next Steps** — checklist of actions before submitting

### Step 4 — PDF Export
Generate a styled PDF of the full report using ReportLab and offer it as a download.
File name: `tailored_resume_[role]_[company].pdf`

## Key Rules

- **Never fabricate experience** — only reframe what exists in the original resume
- Flag any suspect rewrite with ⚠️ FABRICATED
- If keyword overlap < 30%, warn the user: "This role may be a significant stretch"
- Keep summaries under 60 words — count them
- TRANSFERABLE status requires a genuine connection justifiable in 30 seconds

## Reference Files

All prompt files live in the Resume Tailor Agent project folder:
```
Resume Tailor Agent/
├── agents/resume_tailor_agent.md   ← orchestrator
├── skills/jd_parser.md
├── skills/gap_analyzer.md
├── skills/bullet_rewriter.md
├── skills/summary_generator.md
└── skills/ats_scorer.md
```

GitHub: https://github.com/akv803101/resume-tailor-agent

## Cost
~$0.03 per run on Claude Sonnet 4.6 (~7,000 tokens total)
