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


# ── FULL ANALYSIS REPORT PDF (sections 2-4 only) ─────────────────────────────
def generate_report_pdf(markdown_text: str, target_role: str = "") -> bytes:
    """
    Render the analysis-only report: Gap Analysis + ATS Scorecard + Next Steps.
    The Tailored Resume section is intentionally excluded (it has its own PDF).
    """
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
    info_s   = ps("IF", size=9.5, leading=14, color=colors.HexColor("#1d4ed8"),
                  leftIndent=10, spaceAfter=6,
                  backColor=colors.HexColor("#eff6ff"), borderPad=6)
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
        Paragraph("Resume Analysis Report", title_s),
        Paragraph(f"Generated: {date.today().strftime('%B %d, %Y')}",
                  ps("dt", size=9, color=GREY, align=TA_RIGHT))
    ]], colWidths=[4.5*inch, 2*inch])
    banner.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                                 ("BOTTOMPADDING",(0,0),(-1,-1),4)]))
    story.append(banner)
    if target_role:
        story.append(Paragraph(f"Target Role: <b>{_md_inline(target_role)}</b>", meta_s))
    story.append(HRFlowable(width="100%", thickness=2.5, color=BLUE, spaceAfter=6))
    story.append(Paragraph(
        "The tailored resume is available as a separate PDF download.",
        info_s
    ))
    story.append(Spacer(1, 4))

    # Parse markdown — skip section 1 (TAILORED RESUME)
    lines = markdown_text.split("\n")
    i = 0
    skip_resume_section = False

    while i < len(lines):
        line = lines[i].rstrip()

        # Skip report-level meta headers
        if re.match(r"^#\s+RESUME TAILOR REPORT", line, re.IGNORECASE):
            i += 1; continue
        if re.match(r"^##\s+(Target Role|Generated):", line):
            i += 1; continue

        # Enter skip mode at "### 1. TAILORED RESUME"
        if re.match(r"^###\s+1[\.\:]?\s+TAILORED RESUME", line, re.IGNORECASE):
            skip_resume_section = True
            i += 1; continue

        # Exit skip mode when we hit "### 2." or later
        if skip_resume_section and re.match(r"^###\s+[2-9]", line):
            skip_resume_section = False

        if skip_resume_section:
            i += 1; continue

        # --- Render remaining content ---
        if line.startswith("### "):
            story.append(Paragraph(_md_inline(line[4:].strip()), h2_s))
        elif line.startswith("## "):
            story.append(Paragraph(_md_inline(line[3:].strip()), h1_s))
            story.append(HRFlowable(width="100%", thickness=1,
                                    color=colors.HexColor("#dde3ff"), spaceAfter=4))
        elif line.startswith("# "):
            story.append(Paragraph(_md_inline(line[2:].strip()), h1_s))
            story.append(HRFlowable(width="100%", thickness=1,
                                    color=colors.HexColor("#dde3ff"), spaceAfter=4))
        elif line.strip() in ("---", "***", "___"):
            story.append(HRFlowable(width="100%", thickness=0.5,
                                    color=colors.HexColor("#cbd5e1"), spaceAfter=5))
        elif line.startswith("- [ ] ") or line.startswith("- [x] ") or line.startswith("- [X] "):
            checked = line[3] in ("x", "X")
            story.append(Paragraph(("&#x2611; " if checked else "&#x2610; ") +
                                   _md_inline(line[6:].strip()), bullet_s))
        elif line.startswith("- ") or line.startswith("* "):
            txt = line[2:].strip()
            style = warn_s if ("⚠" in txt or "WARNING" in txt.upper()) else bullet_s
            story.append(Paragraph("\u2022 " + _md_inline(txt), style))
        elif re.match(r"^\d+\.\s", line):
            num = re.match(r"^(\d+)\.", line).group(1)
            story.append(Paragraph(f"{num}. " + _md_inline(
                re.sub(r"^\d+\.\s*", "", line).strip()), bullet_s))
        elif line.startswith("|"):
            tbl_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                tbl_lines.append(lines[i]); i += 1
            tbl = _parse_md_table(tbl_lines, td_s, th_s)
            if tbl:
                story.append(tbl); story.append(Spacer(1, 5))
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


# ── TAILORED RESUME PDF (clean, aesthetic, submission-ready) ──────────────────
def generate_resume_pdf(resume_section: str, target_role: str = "") -> bytes:
    """
    A true resume PDF — looks like an actual professional resume document.
    Clean sections, company/date alignment, STAR-K bullets. No analysis content.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=0.75*inch, leftMargin=0.75*inch,
        topMargin=0.65*inch,   bottomMargin=0.65*inch,
    )

    W     = letter[0] - 1.5 * inch   # 7.0 inch usable width
    NAVY  = colors.HexColor("#0f172a")
    BLUE  = colors.HexColor("#4361ee")
    GREY  = colors.HexColor("#64748b")
    LGREY = colors.HexColor("#f1f5f9")
    BLACK = colors.HexColor("#1e293b")
    WHITE = colors.white

    def ps(name, font="Helvetica", size=10, leading=14,
           color=BLACK, align=TA_LEFT, **kw):
        return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading,
                              textColor=color, alignment=align, **kw)

    NAME_S    = ps("RN",  "Helvetica-Bold", 24, 28, NAVY,  TA_CENTER)
    CONTACT_S = ps("RC",  "Helvetica",       9, 13, GREY,  TA_CENTER, spaceAfter=2)
    SEC_S     = ps("RS",  "Helvetica-Bold", 9.5,13, WHITE, TA_LEFT)
    CO_S      = ps("RCO", "Helvetica-Bold",10.5,14, NAVY)
    DATE_S    = ps("RD",  "Helvetica",       9, 13, GREY,  TA_RIGHT)
    TITLE_S   = ps("RT",  "Helvetica-BoldOblique", 9.5, 13, BLUE, spaceAfter=2)
    BULLET_S  = ps("RB",  "Helvetica",       9.5,14, BLACK,
                   leftIndent=14, firstLineIndent=-8, spaceAfter=2)
    BODY_S    = ps("RBD", "Helvetica",       9.5,14, BLACK, spaceAfter=3)
    NOTE_S    = ps("RFT", "Helvetica",       7.5,11, GREY,  TA_CENTER)

    def sec_hdr(title):
        """Full-width blue banner section header — no nested table."""
        t = Table([[Paragraph(title.upper(), SEC_S)]], colWidths=[W])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), BLUE),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ]))
        return t

    def co_date_row(left_text, right_text):
        """Company name left-aligned, date right-aligned on the same line."""
        t = Table(
            [[Paragraph(_md_inline(left_text), CO_S),
              Paragraph(_md_inline(right_text), DATE_S)]],
            colWidths=[W * 0.70, W * 0.30]
        )
        t.setStyle(TableStyle([
            ("VALIGN",         (0,0), (-1,-1), "BOTTOM"),
            ("LEFTPADDING",    (0,0), (-1,-1), 0),
            ("RIGHTPADDING",   (0,0), (-1,-1), 0),
            ("TOPPADDING",     (0,0), (-1,-1), 0),
            ("BOTTOMPADDING",  (0,0), (-1,-1), 0),
        ]))
        return t

    story = []

    # ── Strip the ### 1. TAILORED RESUME header ───────────────────────────────
    text = re.sub(r"^###\s+\d*\.?\s*TAILORED RESUME[^\n]*\n?", "",
                  resume_section, flags=re.IGNORECASE).strip()
    lines = text.split("\n")

    # ── Extract candidate name (first non-empty bold line or plain first line) ─
    name = ""
    contact = ""
    name_line_idx = -1

    for idx, raw in enumerate(lines[:8]):
        stripped = raw.strip()
        if not stripped:
            continue
        # Bold name: **Name Here**
        m = re.match(r"^\*\*([^*\|]+)\*\*\s*$", stripped)
        if m and not re.match(r"^(PROFESSIONAL|EXPERIENCE|EDUCATION|SKILLS|SUMMARY)", m.group(1).upper()):
            name = m.group(1).strip()
            name_line_idx = idx
            break
        # Plain name line (Title Case, no special chars, short)
        if (re.match(r"^[A-Z][a-z]+ [A-Z]", stripped)
                and len(stripped) < 50
                and "|" not in stripped
                and "@" not in stripped
                and not stripped.startswith("#")):
            name = stripped
            name_line_idx = idx
            break

    # Contact line: has | or @ and is close to the name
    if name_line_idx >= 0:
        for idx in range(name_line_idx + 1, min(name_line_idx + 4, len(lines))):
            s = lines[idx].strip()
            if ("|" in s or "@" in s) and not s.startswith("#") and not s.startswith("**"):
                contact = re.sub(r"\*+", "", s).strip()
                break

    # ── Header block ─────────────────────────────────────────────────────────
    story.append(Paragraph(name or "Candidate", NAME_S))
    if contact:
        story.append(Paragraph(contact, CONTACT_S))
    story.append(HRFlowable(width=W, thickness=2.5, color=BLUE, spaceAfter=2))
    story.append(Paragraph(
        f"ATS-Optimised \u00a0|\u00a0 {date.today().strftime('%B %d, %Y')}",
        NOTE_S
    ))
    story.append(Spacer(1, 8))

    # ── Parse and render body ─────────────────────────────────────────────────
    i = 0
    SECTION_WORDS = {"PROFESSIONAL", "EXPERIENCE", "EDUCATION", "SKILLS",
                     "SUMMARY", "CERTIFICATIONS", "PROJECTS", "AWARDS",
                     "WORK", "TECHNICAL", "ADDITIONAL"}

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        # Skip lines already used for the header block
        if i <= name_line_idx + 3:
            clean_s = re.sub(r"\*+", "", stripped)
            if clean_s == name or clean_s == contact or not stripped:
                i += 1; continue
            # Also skip any "### TAILORED RESUME" leftovers
            if re.match(r"^###?\s+\d*\.?\s*TAILORED RESUME", stripped, re.IGNORECASE):
                i += 1; continue

        # ── Section headers ── (## / ### heading OR bold ALL-CAPS)
        is_heading = re.match(r"^##\s+", stripped) or re.match(r"^###\s+", stripped)
        is_bold_caps = (re.match(r"^\*\*[A-Z][A-Z\s]+\*\*\s*$", stripped)
                        and any(w in stripped.upper() for w in SECTION_WORDS))

        if is_heading or is_bold_caps:
            txt = re.sub(r"^#+\s*|\*+", "", stripped).strip()
            story.append(Spacer(1, 7))
            story.append(sec_hdr(txt))
            story.append(Spacer(1, 5))
            i += 1; continue

        # ── Experience entry: **Company** — Job Title | Dates ─────────────────
        if re.match(r"^\*\*[^*]+\*\*", stripped):
            full = re.sub(r"\*+", "", stripped)
            # Try to split off a trailing date
            date_pat = re.search(
                r"[\|—\-]\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
                r"|20\d\d|Present)[^|]*)$",
                full, re.IGNORECASE
            )
            if date_pat:
                right = date_pat.group(1).strip()
                left  = full[:date_pat.start()].strip().rstrip("|—- ")
                story.append(Spacer(1, 6))
                story.append(co_date_row(left, right))
            else:
                story.append(Spacer(1, 5))
                story.append(Paragraph(_md_inline(stripped), CO_S))
            i += 1; continue

        # ── Italic job title ──────────────────────────────────────────────────
        if (stripped.startswith("*") and stripped.endswith("*")
                and not stripped.startswith("**") and len(stripped) > 2):
            story.append(Paragraph(_md_inline(stripped[1:-1]), TITLE_S))
            i += 1; continue

        # ── Bullets ───────────────────────────────────────────────────────────
        if stripped.startswith("- ") or stripped.startswith("• "):
            story.append(Paragraph("\u2013 " + _md_inline(stripped[2:].strip()), BULLET_S))
            i += 1; continue

        # ── Numbered items ────────────────────────────────────────────────────
        if re.match(r"^\d+\.\s", stripped):
            num = re.match(r"^(\d+)\.", stripped).group(1)
            story.append(Paragraph(
                f"{num}. " + _md_inline(re.sub(r"^\d+\.\s*", "", stripped).strip()),
                BULLET_S))
            i += 1; continue

        # ── HR rule ───────────────────────────────────────────────────────────
        if stripped in ("---", "***", "___"):
            story.append(HRFlowable(width=W, thickness=0.4,
                                    color=colors.HexColor("#e2e8f0"), spaceAfter=3))
            i += 1; continue

        # ── Skills / body lines ───────────────────────────────────────────────
        if stripped:
            story.append(Paragraph(_md_inline(stripped), BODY_S))
        else:
            story.append(Spacer(1, 2))
        i += 1

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width=W, thickness=0.5,
                            color=colors.HexColor("#e2e8f0"), spaceAfter=4))
    story.append(Paragraph(
        "ATS-Optimised by Resume Tailor Agent \u00a0|\u00a0 github.com/akv803101/resume-tailor-agent",
        NOTE_S
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
    result     = st.session_state["result"]
    jd_snippet = st.session_state.get("jd_snippet", "")

    # ── Extract metadata ──────────────────────────────────────────────────────
    role_match  = re.search(r"Target Role:\s*(.+)", result)
    target_role = role_match.group(1).strip() if role_match else jd_snippet
    safe_role   = re.sub(r"[^\w\s-]", "", target_role)[:40].strip().replace(" ", "_")

    resume_section = _extract_section(result, "TAILORED RESUME")

    # ── Generate PDFs (cached in session so re-renders don't re-generate) ─────
    if "resume_pdf" not in st.session_state or st.session_state.get("pdf_role") != safe_role:
        st.session_state["resume_pdf"] = generate_resume_pdf(
            resume_section if resume_section else result,
            target_role
        )
        st.session_state["report_pdf"] = generate_report_pdf(result, target_role)
        st.session_state["pdf_role"]   = safe_role

    resume_pdf = st.session_state["resume_pdf"]
    report_pdf = st.session_state["report_pdf"]

    # ── Success + download buttons (left column only, no tabs, no text output) ─
    left_col, _ = st.columns([1, 1])
    with left_col:
        st.success("✅ Done! Your tailored resume package is ready.")
        st.markdown("#### 📥 Download")

        st.markdown(
            '<p class="dl-label">📄 Clean resume — ready to submit to employers</p>',
            unsafe_allow_html=True
        )
        st.download_button(
            label="⬇️  Tailored Resume PDF",
            data=resume_pdf,
            file_name=f"resume_{safe_role}.pdf" if safe_role else "resume_tailored.pdf",
            mime="application/pdf",
            type="primary",
            use_container_width=True,
            key="dl_resume"
        )

        st.markdown("<br>", unsafe_allow_html=True)

        st.markdown(
            '<p class="dl-label">📋 Gap analysis · ATS scorecard · next steps</p>',
            unsafe_allow_html=True
        )
        st.download_button(
            label="⬇️  Full Analysis Report PDF",
            data=report_pdf,
            file_name=f"report_{safe_role}.pdf" if safe_role else "report_analysis.pdf",
            mime="application/pdf",
            use_container_width=True,
            key="dl_report"
        )
