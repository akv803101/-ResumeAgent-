# app.py — Resume Tailor Agent UI

import streamlit as st
import anthropic
import io
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

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
    .score-box {
        background: #f0f4ff;
        border-left: 4px solid #4361ee;
        padding: 12px 16px;
        border-radius: 4px;
        margin: 8px 0;
    }
    .warning-box {
        background: #fff8e1;
        border-left: 4px solid #ff9800;
        padding: 12px 16px;
        border-radius: 4px;
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
    .stButton > button:hover {
        background-color: #3a52d4;
    }
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


# ── PDF Generator ─────────────────────────────────────────────────────────────
def generate_pdf(markdown_text: str, target_role: str = "") -> bytes:
    """Convert the tailored resume report markdown to a styled PDF."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=22,
        textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=6,
        fontName="Helvetica-Bold",
    )
    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=colors.HexColor("#4361ee"),
        spaceBefore=18,
        spaceAfter=6,
        fontName="Helvetica-Bold",
        borderPad=4,
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=colors.HexColor("#1a1a2e"),
        spaceBefore=12,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    h3_style = ParagraphStyle(
        "H3",
        parent=styles["Heading3"],
        fontSize=11,
        textColor=colors.HexColor("#333"),
        spaceBefore=8,
        spaceAfter=3,
        fontName="Helvetica-BoldOblique",
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        spaceAfter=4,
        fontName="Helvetica",
    )
    bullet_style = ParagraphStyle(
        "Bullet",
        parent=body_style,
        leftIndent=16,
        firstLineIndent=-10,
        spaceAfter=3,
    )
    meta_style = ParagraphStyle(
        "Meta",
        parent=body_style,
        fontSize=9,
        textColor=colors.HexColor("#666"),
        spaceAfter=2,
    )
    warning_style = ParagraphStyle(
        "Warning",
        parent=body_style,
        textColor=colors.HexColor("#b45309"),
        fontSize=10,
        leftIndent=8,
    )

    story = []

    # Title block
    story.append(Paragraph("Resume Tailor Report", title_style))
    if target_role:
        story.append(Paragraph(f"Target Role: {target_role}", meta_style))
    from datetime import date
    story.append(Paragraph(f"Generated: {date.today().strftime('%B %d, %Y')}", meta_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#4361ee"), spaceAfter=12))

    # Parse markdown line by line
    lines = markdown_text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()

        # Skip the top-level report header (already added)
        if line.startswith("# RESUME TAILOR REPORT") or line.startswith("# Resume Tailor Report"):
            i += 1
            continue

        # H1
        if line.startswith("### "):
            text = line[4:].strip()
            story.append(Paragraph(_md_inline(text), h2_style))
        elif line.startswith("## "):
            text = line[3:].strip()
            # Skip duplicate Target Role / Generated lines
            if "Target Role:" in text or "Generated:" in text:
                i += 1
                continue
            story.append(Paragraph(_md_inline(text), h1_style))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#dde3ff"), spaceAfter=4))
        elif line.startswith("# "):
            text = line[2:].strip()
            story.append(Paragraph(_md_inline(text), h1_style))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#dde3ff"), spaceAfter=4))

        # Horizontal rule
        elif line.strip() in ("---", "***", "___"):
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#ccc"), spaceAfter=6))

        # Bullet / checkbox list items
        elif line.startswith("- [ ] ") or line.startswith("- [x] ") or line.startswith("- [X] "):
            checked = line[3] in ("x", "X")
            text = line[6:].strip()
            prefix = "☑ " if checked else "☐ "
            story.append(Paragraph(prefix + _md_inline(text), bullet_style))

        elif line.startswith("- ") or line.startswith("* "):
            text = line[2:].strip()
            if text.startswith("⚠️") or "WARNING" in text.upper():
                story.append(Paragraph("⚠ " + _md_inline(text[2:].strip()), warning_style))
            else:
                story.append(Paragraph("• " + _md_inline(text), bullet_style))

        # Numbered list
        elif re.match(r"^\d+\.\s", line):
            text = re.sub(r"^\d+\.\s*", "", line).strip()
            num = re.match(r"^(\d+)\.", line).group(1)
            story.append(Paragraph(f"{num}. " + _md_inline(text), bullet_style))

        # Table (simple Markdown table)
        elif line.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i])
                i += 1
            tbl = _parse_md_table(table_lines, body_style)
            if tbl:
                story.append(tbl)
                story.append(Spacer(1, 6))
            continue  # already advanced i

        # Bold-only lines (act as sub-headers)
        elif re.match(r"^\*\*[^*]+\*\*$", line.strip()) or re.match(r"^__[^_]+__$", line.strip()):
            story.append(Paragraph(_md_inline(line.strip()), h3_style))

        # Non-empty body text
        elif line.strip():
            story.append(Paragraph(_md_inline(line), body_style))

        # Empty line — small spacer
        else:
            story.append(Spacer(1, 4))

        i += 1

    doc.build(story)
    return buffer.getvalue()


def _md_inline(text: str) -> str:
    """Convert inline markdown (bold, italic, code) to ReportLab XML."""
    # Escape XML special chars first (except ones we're about to add)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Bold+italic ***text***
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", text)
    # Bold **text**
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Italic *text*
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    # Bold __text__
    text = re.sub(r"__(.+?)__", r"<b>\1</b>", text)
    # Inline code `text`
    text = re.sub(r"`(.+?)`", r'<font name="Courier" size="9">\1</font>', text)
    # Warning emoji
    text = text.replace("⚠️", "⚠")
    return text


def _parse_md_table(lines, body_style):
    """Parse Markdown table lines into a ReportLab Table."""
    rows = []
    for line in lines:
        # Skip separator lines like |---|---|
        if re.match(r"^\|[\s\-:|]+\|[\s\-:|]*$", line.strip()):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)

    if not rows:
        return None

    # Build Paragraph cells
    header_style = ParagraphStyle(
        "TH", parent=body_style, fontName="Helvetica-Bold", fontSize=9, textColor=colors.white
    )
    cell_style = ParagraphStyle(
        "TD", parent=body_style, fontSize=9, leading=12
    )

    table_data = []
    for r_idx, row in enumerate(rows):
        s = header_style if r_idx == 0 else cell_style
        table_data.append([Paragraph(_md_inline(c), s) for c in row])

    col_count = max(len(r) for r in table_data)
    available = 6.5 * inch
    col_width = available / col_count

    tbl = Table(table_data, colWidths=[col_width] * col_count, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4361ee")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f7f9ff"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#ccd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tbl


# ── Main UI ───────────────────────────────────────────────────────────────────
st.markdown('<div class="main-header">📄 Resume Tailor Agent</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-header">Paste a LinkedIn JD + your resume → get an ATS-optimised tailored resume as PDF</div>', unsafe_allow_html=True)

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
        st.error("⚠️ Both fields are required. Please paste a job description AND your resume.")
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

    # Tabs
    tab1, tab2, tab3, tab4 = st.tabs([
        "📝 Tailored Resume", "🔍 Gap Analysis", "📊 ATS Score", "📥 Full Report"
    ])

    sections = result.split("### ")

    def get_section(keyword):
        for s in sections:
            if keyword.upper() in s[:30].upper():
                return "### " + s
        return ""

    with tab1:
        section = get_section("TAILORED RESUME")
        st.markdown(section if section else result)

    with tab2:
        section = get_section("GAP ANALYSIS")
        st.markdown(section if section else "*Gap analysis not found in output.*")

    with tab3:
        section = get_section("ATS SCORECARD")
        st.markdown(section if section else "*ATS scorecard not found in output.*")

    with tab4:
        st.markdown(result)

    # ── PDF Download ─────────────────────────────────────────────────────────
    st.markdown("---")
    st.markdown("### 📥 Download Your Report")

    # Extract target role for PDF title
    role_match = re.search(r"Target Role:\s*(.+)", result)
    target_role = role_match.group(1).strip() if role_match else jd_snippet

    pdf_bytes = generate_pdf(result, target_role)

    safe_role = re.sub(r"[^\w\s-]", "", target_role)[:40].strip().replace(" ", "_")
    filename = f"tailored_resume_{safe_role}.pdf" if safe_role else "tailored_resume.pdf"

    dl_col, _ = st.columns([2, 6])
    with dl_col:
        st.download_button(
            label="⬇️ Download PDF Report",
            data=pdf_bytes,
            file_name=filename,
            mime="application/pdf",
            type="primary"
        )

    st.caption("💡 Tip: Review the rewritten bullets and edit anything that doesn't sound like you before sending.")
