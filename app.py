# app.py — Resume Tailor Agent UI

import streamlit as st
import anthropic
import io
import re
from datetime import date
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Resume Tailor Agent",
    page_icon="📄",
    layout="wide"
)

# ── Custom CSS ─────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    .main-header {
        font-size: 2.2rem;
        font-weight: 700;
        color: #1a1a2e;
        margin-bottom: 0.2rem;
    }
    .sub-header {
        font-size: 1rem;
        color: #555;
        margin-bottom: 1.5rem;
    }
    .download-section {
        background: #f8faff;
        border: 1px solid #dde3ff;
        border-radius: 10px;
        padding: 20px 24px;
        margin-top: 8px;
    }
    .dl-label {
        font-size: 0.85rem;
        color: #64748b;
        margin-bottom: 4px;
    }
    .stButton > button {
        background-color: #4361ee;
        color: white;
        border: none;
        padding: 0.6rem 2rem;
        font-size: 1rem;
        border-radius: 6px;
        font-weight: 600;
    }
    .stButton > button:hover { background-color: #3a52d4; }
</style>
""", unsafe_allow_html=True)


# ── System Prompt Loader ───────────────────────────────────────────────────────
@st.cache_data
def load_prompts():
    import os
    base_path = os.path.dirname(__file__)
    system = open(os.path.join(base_path, "agents/resume_tailor_agent.md")).read()
    for s in ["jd_parser", "gap_analyzer", "bullet_rewriter", "summary_generator", "ats_scorer"]:
        system += "\n\n---\n\n" + open(os.path.join(base_path, f"skills/{s}.md")).read()
    return system


# ── Helpers ───────────────────────────────────────────────────────────────────
def _md_inline(text: str) -> str:
    """Convert inline markdown to ReportLab XML."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    text = re.sub(r"__(.+?)__", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font name="Courier" size="9">\1</font>', text)
    text = text.replace("⚠️", "⚠").replace("☑", "&#x2611;").replace("☐", "&#x2610;")
    return text


def _parse_md_table(lines, cell_style, header_style):
    """Parse Markdown table lines into a ReportLab Table."""
    rows = []
    for line in lines:
        if re.match(r"^\|[\s\-:|]+\|[\s\-:|]*$", line.strip()):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)
    if not rows:
        return None
    table_data = []
    for r_idx, row in enumerate(rows):
        s = header_style if r_idx == 0 else cell_style
        table_data.append([Paragraph(_md_inline(c), s) for c in row])
    col_count = max(len(r) for r in table_data)
    col_width = 6.5 * inch / col_count
    tbl = Table(table_data, colWidths=[col_width] * col_count, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4361ee")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f7f9ff"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#c8d0f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tbl


def _extract_section(text: str, keyword: str) -> str:
    """Extract a named ### section from the full report markdown."""
    # Try to find ### 1. TAILORED RESUME or ### TAILORED RESUME etc.
    pattern = re.compile(
        r"(###\s+\d*\.?\s*" + re.escape(keyword) + r".*?)(?=\n###\s+\d*\.?\s+|\Z)",
        re.IGNORECASE | re.DOTALL
    )
    m = pattern.search(text)
    if m:
        return m.group(1).strip()
    # Fallback: split on ### and match
    for chunk in text.split("### "):
        if keyword.upper() in chunk[:40].upper():
            return "### " + chunk.strip()
    return ""


# ── FULL REPORT PDF ───────────────────────────────────────────────────────────
def generate_report_pdf(markdown_text: str, target_role: str = "") -> bytes:
    """Render the complete Resume Tailor Report (all 4 sections) as a styled PDF."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=0.75*inch, leftMargin=0.75*inch,
        topMargin=0.75*inch,   bottomMargin=0.75*inch,
    )

    def ps(name, font="Helvetica", size=10, leading=14, color=colors.HexColor("#1e293b"),
           align=TA_LEFT, **kw):
        return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading,
                              textColor=color, alignment=align, **kw)

    NAVY  = colors.HexColor("#0f172a")
    BLUE  = colors.HexColor("#4361ee")
    GREY  = colors.HexColor("#64748b")
    WHITE = colors.white

    title_s  = ps("RT", "Helvetica-Bold", 20, 24, NAVY,  TA_LEFT)
    meta_s   = ps("RM", size=9,  color=GREY)
    h1_s     = ps("H1", "Helvetica-Bold", 14, 18, BLUE,  spaceBefore=16, spaceAfter=4)
    h2_s     = ps("H2", "Helvetica-Bold", 12, 16, colors.HexColor("#1e293b"), spaceBefore=10, spaceAfter=3)
    h3_s     = ps("H3", "Helvetica-BoldOblique", 10, 14, colors.HexColor("#334155"), spaceBefore=6, spaceAfter=2)
    body_s   = ps("BD", size=10, leading=14, spaceAfter=3)
    bullet_s = ps("BL", size=10, leading=14, spaceAfter=3, leftIndent=14, firstLineIndent=-8)
    warn_s   = ps("WN", size=10, leading=14, color=colors.HexColor("#b45309"), leftIndent=8)
    th_s     = ps("TH", "Helvetica-Bold", 9, 12, WHITE,  TA_CENTER)
    td_s     = ps("TD", size=9, leading=12)

    story = []
    # Banner header
    banner = Table([[
        Paragraph("Resume Tailor Report", title_s),
        Paragraph(f"Generated: {date.today().strftime('%B %d, %Y')}", ps("dt", size=9, color=GREY, align=TA_RIGHT))
    ]], colWidths=[4.5*inch, 2*inch])
    banner.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                                 ("BOTTOMPADDING",(0,0),(-1,-1),4)]))
    story.append(banner)
    if target_role:
        story.append(Paragraph(f"Target Role: <b>{_md_inline(target_role)}</b>", meta_s))
    story.append(HRFlowable(width="100%", thickness=2.5, color=BLUE, spaceAfter=10))

    # Parse markdown
    lines = markdown_text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if re.match(r"^#\s+RESUME TAILOR REPORT", line, re.IGNORECASE):
            i += 1; continue
        if re.match(r"^##\s+(Target Role|Generated):", line):
            i += 1; continue

        if line.startswith("### "):
            story.append(Paragraph(_md_inline(line[4:].strip()), h2_s))
        elif line.startswith("## "):
            story.append(Paragraph(_md_inline(line[3:].strip()), h1_s))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#dde3ff"), spaceAfter=4))
        elif line.startswith("# "):
            story.append(Paragraph(_md_inline(line[2:].strip()), h1_s))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#dde3ff"), spaceAfter=4))
        elif line.strip() in ("---", "***", "___"):
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=5))
        elif line.startswith("- [ ] ") or line.startswith("- [x] ") or line.startswith("- [X] "):
            checked = line[3] in ("x","X")
            story.append(Paragraph(("&#x2611; " if checked else "&#x2610; ") + _md_inline(line[6:].strip()), bullet_s))
        elif line.startswith("- ") or line.startswith("* "):
            txt = line[2:].strip()
            style = warn_s if ("⚠" in txt or "WARNING" in txt.upper()) else bullet_s
            story.append(Paragraph("\u2022 " + _md_inline(txt), style))
        elif re.match(r"^\d+\.\s", line):
            num = re.match(r"^(\d+)\.", line).group(1)
            story.append(Paragraph(f"{num}. " + _md_inline(re.sub(r"^\d+\.\s*","",line).strip()), bullet_s))
        elif line.startswith("|"):
            tbl_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                tbl_lines.append(lines[i]); i += 1
            tbl = _parse_md_table(tbl_lines, td_s, th_s)
            if tbl:
                story.append(tbl); story.append(Spacer(1,5))
            continue
        elif re.match(r"^\*\*[^*]+\*\*$", line.strip()):
            story.append(Paragraph(_md_inline(line.strip()), h3_s))
        elif line.strip():
            story.append(Paragraph(_md_inline(line), body_s))
        else:
            story.append(Spacer(1, 4))
        i += 1

    doc.build(story)
    return buffer.getvalue()


# ── TAILORED RESUME (FINAL) PDF ───────────────────────────────────────────────
def generate_resume_pdf(resume_section: str, target_role: str = "", candidate_name: str = "") -> bytes:
    """
    Render ONLY the Tailored Resume section as a clean, submission-ready PDF.
    Styled like a real resume — no gap analysis, no ATS scores.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=0.75*inch, leftMargin=0.75*inch,
        topMargin=0.65*inch,   bottomMargin=0.65*inch,
    )

    NAVY   = colors.HexColor("#0f172a")
    BLUE   = colors.HexColor("#4361ee")
    GREY   = colors.HexColor("#64748b")
    LGREY  = colors.HexColor("#f8faff")
    BORDER = colors.HexColor("#dde3ff")
    WHITE  = colors.white

    def ps(name, font="Helvetica", size=10, leading=14,
           color=colors.HexColor("#1e293b"), align=TA_LEFT, **kw):
        return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading,
                              textColor=color, alignment=align, **kw)

    # Resume-specific styles
    name_s    = ps("NAME",  "Helvetica-Bold", 22, 26, NAVY, TA_CENTER, spaceAfter=2)
    role_s    = ps("ROLE",  "Helvetica",      11, 15, BLUE, TA_CENTER, spaceAfter=6)
    date_s    = ps("DATE",  "Helvetica",       8, 12, GREY, TA_RIGHT)
    sec_s     = ps("SEC",   "Helvetica-Bold", 10, 14, WHITE, TA_LEFT,
                   spaceBefore=0, spaceAfter=0)
    job_co_s  = ps("JOBCO", "Helvetica-Bold", 10, 14, NAVY, spaceAfter=0)
    job_ti_s  = ps("JOBTI", "Helvetica-BoldOblique", 9.5, 13, BLUE, spaceAfter=1)
    bullet_s  = ps("BUL",   size=9.5, leading=14, spaceAfter=2,
                   leftIndent=14, firstLineIndent=-8)
    body_s    = ps("BODY",  size=9.5, leading=14, spaceAfter=3)
    edu_s     = ps("EDU",   "Helvetica-Bold", 9.5, 13, NAVY, spaceAfter=1)
    skill_s   = ps("SKL",   size=9.5, leading=14, spaceAfter=3)
    note_s    = ps("NOTE",  size=8, color=GREY, align=TA_CENTER, spaceAfter=2)

    def section_header(title):
        """Blue banner section header."""
        tbl = Table([[Paragraph(title.upper(), sec_s)]], colWidths=[6.5*inch])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0,0),(-1,-1), BLUE),
            ("TOPPADDING", (0,0),(-1,-1), 4),
            ("BOTTOMPADDING",(0,0),(-1,-1), 4),
            ("LEFTPADDING",(0,0),(-1,-1), 8),
        ]))
        return tbl

    story = []

    # ── Candidate header block ────────────────────────────────────────────────
    # Try to extract name from the resume section (first bold line or first heading)
    name = candidate_name
    if not name:
        m = re.search(r"^\*\*([A-Z][A-Z\s]+)\*\*", resume_section, re.MULTILINE)
        if m:
            name = m.group(1).strip()
        else:
            m = re.search(r"^#\s+(.+)$", resume_section, re.MULTILINE)
            if m:
                name = m.group(1).strip()
            else:
                name = "Candidate Name"

    story.append(Paragraph(name, name_s))
    if target_role:
        story.append(Paragraph(target_role, role_s))
    story.append(HRFlowable(width="100%", thickness=2, color=BLUE, spaceAfter=2))
    story.append(Paragraph(
        f"ATS-Optimised Resume \u00a0|\u00a0 Generated {date.today().strftime('%B %d, %Y')}",
        note_s
    ))
    story.append(Spacer(1, 8))

    # ── Parse resume section content ─────────────────────────────────────────
    # Remove the section header itself (### 1. TAILORED RESUME)
    clean = re.sub(r"^###\s+\d*\.?\s*TAILORED RESUME.*\n?", "", resume_section,
                   flags=re.IGNORECASE).strip()

    lines = clean.split("\n")
    i = 0
    current_section = None

    while i < len(lines):
        line = lines[i].rstrip()

        # Skip duplicate name at top if it matches
        if line.strip().replace("**","") == name:
            i += 1; continue

        # Section banners from bold all-caps or ## headings
        if line.startswith("## ") or line.startswith("### "):
            txt = re.sub(r"^#+\s*","", line).strip()
            story.append(Spacer(1, 6))
            story.append(section_header(txt))
            story.append(Spacer(1, 4))
            current_section = txt.upper()

        # Bold line as company / role name
        elif re.match(r"^\*\*[^*]+\*\*", line.strip()) and not re.match(r"^\*\*[^*]+\*\*$", line.strip()):
            # Bold + regular text on same line (e.g. **Company** — Title (dates))
            story.append(Paragraph(_md_inline(line.strip()), job_co_s))

        elif re.match(r"^\*\*[^*]+\*\*$", line.strip()):
            txt = line.strip()[2:-2]
            # All-caps or contains date pattern → company header
            if re.search(r"\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec", txt):
                story.append(Spacer(1, 5))
                story.append(Paragraph(_md_inline(line.strip()), job_co_s))
            else:
                story.append(Spacer(1, 5))
                story.append(Paragraph(_md_inline(line.strip()), job_co_s))

        # Job title lines (italic)
        elif line.strip().startswith("*") and line.strip().endswith("*") and not line.strip().startswith("**"):
            story.append(Paragraph(_md_inline(line.strip()), job_ti_s))

        # Bullet points
        elif line.startswith("- ") or line.startswith("* "):
            txt = line[2:].strip()
            story.append(Paragraph("\u2013 " + _md_inline(txt), bullet_s))

        # Numbered list
        elif re.match(r"^\d+\.\s", line):
            num = re.match(r"^(\d+)\.", line).group(1)
            story.append(Paragraph(f"{num}. " + _md_inline(re.sub(r"^\d+\.\s*","",line).strip()), bullet_s))

        # HR
        elif line.strip() in ("---","***","___"):
            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=colors.HexColor("#e2e8f0"), spaceAfter=3))

        # Non-empty body
        elif line.strip():
            story.append(Paragraph(_md_inline(line), body_s))

        else:
            story.append(Spacer(1, 3))

        i += 1

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=4))
    story.append(Paragraph(
        "Generated by Resume Tailor Agent \u00a0|\u00a0 github.com/akv803101/resume-tailor-agent",
        note_s
    ))

    doc.build(story)
    return buffer.getvalue()


# ── Main UI ───────────────────────────────────────────────────────────────────
st.markdown('<div class="main-header">📄 Resume Tailor Agent</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-header">Paste a LinkedIn JD + your resume → get an ATS-optimised tailored resume + full report as PDF</div>', unsafe_allow_html=True)

col1, col2 = st.columns(2)

with col1:
    jd = st.text_area(
        "📋 Paste LinkedIn Job Description",
        height=320,
        placeholder="Copy the full JD from LinkedIn or any job board..."
    )

with col2:
    resume = st.text_area(
        "📄 Paste Your Current Resume",
        height=320,
        placeholder="Paste your resume text here (plain text or markdown)..."
    )

st.markdown("")
run_col, _ = st.columns([2, 6])
with run_col:
    run = st.button("🚀 Tailor My Resume", type="primary")

if run:
    if not jd.strip() or not resume.strip():
        st.error("⚠️ Both fields are required.")
    else:
        with st.spinner("Analyzing JD → Finding gaps → Rewriting bullets → Generating summary → Scoring ATS…"):
            try:
                system = load_prompts()
                client = anthropic.Anthropic()
                msg = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=6000,
                    system=system,
                    messages=[{
                        "role": "user",
                        "content": f"## Job Description\n{jd}\n\n## My Current Resume\n{resume}"
                    }]
                )
                result = msg.content[0].text
                st.session_state["result"] = result
                st.session_state["jd_snippet"] = jd[:80]
            except Exception as e:
                st.error(f"❌ Error: {e}")

# ── Results ───────────────────────────────────────────────────────────────────
if "result" in st.session_state:
    result = st.session_state["result"]
    jd_snippet = st.session_state.get("jd_snippet", "")

    st.success("✅ Done! Your tailored resume package is ready.")
    st.markdown("---")

    # ── Tabs ──────────────────────────────────────────────────────────────────
    tab1, tab2, tab3, tab4 = st.tabs([
        "📝 Tailored Resume", "🔍 Gap Analysis", "📊 ATS Score", "📄 Full Report"
    ])

    resume_section  = _extract_section(result, "TAILORED RESUME")
    gap_section     = _extract_section(result, "GAP ANALYSIS")
    ats_section     = _extract_section(result, "ATS SCORECARD")
    next_section    = _extract_section(result, "NEXT STEPS")

    with tab1:
        st.markdown(resume_section if resume_section else result)
    with tab2:
        st.markdown(gap_section if gap_section else "*Gap analysis not found in output.*")
    with tab3:
        st.markdown(ats_section if ats_section else "*ATS scorecard not found in output.*")
    with tab4:
        st.markdown(result)

    # ── Extract metadata ──────────────────────────────────────────────────────
    role_match   = re.search(r"Target Role:\s*(.+)", result)
    target_role  = role_match.group(1).strip() if role_match else jd_snippet
    safe_role    = re.sub(r"[^\w\s-]", "", target_role)[:40].strip().replace(" ", "_")

    # ── Download section ──────────────────────────────────────────────────────
    st.markdown("---")
    st.markdown("### 📥 Download")

    dl1, dl2 = st.columns(2)

    with dl1:
        st.markdown('<p class="dl-label">📄 Clean resume only — ready to submit to employers</p>', unsafe_allow_html=True)
        resume_pdf = generate_resume_pdf(
            resume_section if resume_section else result,
            target_role
        )
        st.download_button(
            label="⬇️ Tailored Resume (Final)",
            data=resume_pdf,
            file_name=f"resume_{safe_role}.pdf" if safe_role else "resume_tailored.pdf",
            mime="application/pdf",
            type="primary",
            key="dl_resume"
        )

    with dl2:
        st.markdown('<p class="dl-label">📋 Full report — gap analysis + ATS scorecard included</p>', unsafe_allow_html=True)
        report_pdf = generate_report_pdf(result, target_role)
        st.download_button(
            label="⬇️ Full Report (PDF)",
            data=report_pdf,
            file_name=f"report_{safe_role}.pdf" if safe_role else "report_full.pdf",
            mime="application/pdf",
            key="dl_report"
        )

    st.caption("💡 Submit the **Tailored Resume** to employers. Keep the **Full Report** for your own reference.")
