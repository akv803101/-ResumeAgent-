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
    SimpleDocTemplate, BaseDocTemplate, PageTemplate, Frame, FrameBreak,
    Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak, Flowable
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
    # Replace non-Latin-1 chars that Helvetica can't render
    text = text.replace("\u2192", "->").replace("\u2190", "<-").replace("\u2013", "-").replace("\u2014", "--")
    text = "".join(c if ord(c) < 256 else "?" for c in text)
    return text


def _parse_md_table(lines, cell_style, header_style):
    """Parse Markdown table lines into a ReportLab Table."""
    rows = []
    for line in lines:
        # Skip separator rows (|---|---|) including variants with spaces/colons
        if re.match(r"^\|[\s\-:|]+$", line.strip().replace("|", "|", 1)) or \
           re.sub(r"[|\-:\s]", "", line.strip()) == "":
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells:
            rows.append(cells)
    if not rows:
        return None
    col_count = max(len(r) for r in rows)
    # Pad all rows to the same column count so ReportLab doesn't choke
    padded = [r + [""] * (col_count - len(r)) for r in rows]
    table_data = []
    for r_idx, row in enumerate(padded):
        s = header_style if r_idx == 0 else cell_style
        table_data.append([Paragraph(_md_inline(c), s) for c in row])
    col_width = 6.5 * inch / col_count
    tbl = Table(table_data, colWidths=[col_width] * col_count, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#4361ee")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.HexColor("#f7f9ff"), colors.white]),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#c8d0f0")),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return tbl


def _split_sections(text: str) -> dict:
    """
    Split full Claude output into named sections.
    Handles any heading level (#/##/###) with or without numbering.
    Returns dict: { 'TAILORED RESUME': '...', 'GAP ANALYSIS': '...', ... }
    """
    # Match any heading line: # / ## / ### optionally followed by a number
    heading_re = re.compile(r"^(#{1,3})\s+(?:\d+[\.\:]?\s*)?(.+)$", re.MULTILINE)
    sections = {}
    matches  = list(heading_re.finditer(text))

    for idx, m in enumerate(matches):
        title = m.group(2).strip().upper()
        start = m.end()
        end   = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        sections[title] = text[start:end].strip()

    return sections


def _extract_section(text: str, keyword: str) -> str:
    """Return content of the section whose heading contains keyword."""
    sections = _split_sections(text)
    keyword_up = keyword.upper()
    for title, content in sections.items():
        if keyword_up in title:
            return content
    return ""


def _exclude_section(text: str, keyword: str) -> str:
    """Return full text with the section matching keyword removed."""
    heading_re = re.compile(r"^(#{1,3})\s+(?:\d+[\.\:]?\s*)?(.+)$", re.MULTILINE)
    matches = list(heading_re.finditer(text))
    keyword_up = keyword.upper()

    for idx, m in enumerate(matches):
        if keyword_up in m.group(2).strip().upper():
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            return (text[:m.start()] + text[end:]).strip()

    return text


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

    # Strip the tailored resume section entirely before parsing
    clean_text = _exclude_section(markdown_text, "TAILORED RESUME")
    lines = clean_text.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i].rstrip()

        # Skip report-level meta headers
        if re.match(r"^#\s+RESUME TAILOR REPORT", line, re.IGNORECASE):
            i += 1; continue
        if re.match(r"^##\s+(Target Role|Generated):", line):
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


# ── VISUAL RESUME PDF (single-column, teal styling, avatar) ──────────────────
def generate_resume_pdf(resume_section: str, target_role: str = "") -> bytes:
    """
    Single-column visual resume with teal section headers and avatar circle.
    Uses SimpleDocTemplate — works reliably for any resume length.
    """
    buffer = io.BytesIO()

    TEAL  = colors.HexColor("#1a6b6b")
    NAVY  = colors.HexColor("#0f172a")
    GREY  = colors.HexColor("#64748b")
    BLACK = colors.HexColor("#1e293b")
    WHITE = colors.white

    LM = RM = 0.65 * inch
    W  = letter[0] - LM - RM
    AVATAR_R = 22

    SECTION_KW = {"PROFESSIONAL", "EXPERIENCE", "EDUCATION", "SKILLS",
                  "SUMMARY", "CERTIFICATIONS", "PROJECTS", "AWARDS",
                  "WORK", "TECHNICAL", "ADDITIONAL", "CORE", "COMPETENCIES",
                  "KEY", "ACHIEVEMENT", "TOOLS"}

    def ps(name, font="Helvetica", size=10, leading=14,
           color=BLACK, align=TA_LEFT, **kw):
        return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading,
                              textColor=color, alignment=align, **kw)

    name_s    = ps("VN", "Helvetica-Bold",    20, 24, NAVY)
    contact_s = ps("VC", "Helvetica",          8, 12, GREY, spaceAfter=2)
    sec_s     = ps("VS", "Helvetica-Bold",     9, 12, WHITE)
    co_s      = ps("VO", "Helvetica-Bold",    10, 14, TEAL)
    date_s    = ps("VD", "Helvetica",          8, 11, GREY, TA_RIGHT)
    role_s    = ps("VR", "Helvetica-Oblique",  9, 12, GREY, spaceAfter=1)
    bullet_s  = ps("VB", "Helvetica",          9, 13, BLACK, leftIndent=12, firstLineIndent=-6, spaceAfter=1)
    body_s    = ps("VY", "Helvetica",          9, 13, BLACK, spaceAfter=2)
    note_s    = ps("VF", "Helvetica",          7, 10, GREY,  TA_CENTER)

    def sec_hdr(title):
        t = Table([[Paragraph(title.upper(), sec_s)]], colWidths=[W])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), TEAL),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ("RIGHTPADDING",  (0,0), (-1,-1), 8),
        ]))
        return t

    def co_date_row(left_txt, right_txt):
        t = Table(
            [[Paragraph(_md_inline(left_txt), co_s),
              Paragraph(_md_inline(right_txt), date_s)]],
            colWidths=[W * 0.68, W * 0.32]
        )
        t.setStyle(TableStyle([
            ("VALIGN",        (0,0), (-1,-1), "BOTTOM"),
            ("LEFTPADDING",   (0,0), (-1,-1), 0),
            ("RIGHTPADDING",  (0,0), (-1,-1), 0),
            ("TOPPADDING",    (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ]))
        return t

    # ── Parse markdown ────────────────────────────────────────────────────────
    body = re.sub(r"(?m)^#{1,3}\s+(?:\d+[\.\:]?\s*)?TAILORED RESUME[^\n]*\n?",
                  "", resume_section, flags=re.IGNORECASE).strip()
    lines = body.split("\n")

    name, contact = "", ""
    skip = set()
    for idx, raw in enumerate(lines[:8]):
        s = raw.strip()
        if not s: continue
        bold_m  = re.match(r"^\*\*([^*|]+)\*\*\s*$", s)
        plain_m = re.match(r"^[A-Z][a-z]+(?: [A-Z][a-z]*)+$", s) and len(s) < 45
        if not name and (bold_m or plain_m):
            candidate = bold_m.group(1).strip() if bold_m else s
            if not any(kw in candidate.upper() for kw in SECTION_KW):
                name = candidate; skip.add(idx); continue
        if not contact and ("|" in s or "@" in s) and not s.startswith("#"):
            contact = re.sub(r"\*+", "", s).strip(); skip.add(idx); continue

    initials = "".join(w[0].upper() for w in name.split()[:2]) if name else "CV"

    # ── Avatar drawn on canvas so it doesn't affect flow ─────────────────────
    def _on_page(canvas, doc):
        ax = letter[0] - RM - AVATAR_R
        ay = letter[1] - 0.55*inch - AVATAR_R
        canvas.saveState()
        canvas.setFillColor(TEAL)
        canvas.circle(ax, ay, AVATAR_R, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", int(AVATAR_R * 0.7))
        canvas.drawCentredString(ax, ay - AVATAR_R * 0.22, initials)
        canvas.restoreState()

    # ── Build story ───────────────────────────────────────────────────────────
    story = [
        Paragraph(name or "Candidate", name_s),
        Paragraph(_md_inline(contact), contact_s) if contact else Spacer(1, 2),
        HRFlowable(width=W, thickness=2, color=TEAL, spaceAfter=6),
    ]

    for idx, raw in enumerate(lines):
        if idx in skip: continue
        s = raw.strip()

        hm       = re.match(r"^#{2,3}\s+(?:\d+[\.\:]?\s*)?(.+)$", s)
        bold_sec = re.match(r"^\*\*([^*]+)\*\*\s*$", s)
        heading_txt = None
        if hm:
            heading_txt = hm.group(1).strip()
        elif bold_sec and any(kw in bold_sec.group(1).upper() for kw in SECTION_KW):
            heading_txt = bold_sec.group(1).strip()

        if heading_txt:
            story.append(Spacer(1, 6))
            story.append(sec_hdr(heading_txt))
            story.append(Spacer(1, 4))
            continue

        if bold_sec:
            inner  = bold_sec.group(1).strip()
            date_m = re.search(
                r"[\|—\-]\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
                r"|20\d\d|Present)[^\|]*)", inner, re.IGNORECASE)
            if date_m:
                story.append(Spacer(1, 5))
                story.append(co_date_row(
                    inner[:date_m.start()].strip().rstrip("|—- "),
                    date_m.group(1).strip()))
            else:
                story.append(Spacer(1, 4))
                story.append(Paragraph(_md_inline(s), co_s))
            continue

        if re.match(r"^\*[^*].+[^*]\*$", s):
            story.append(Paragraph(_md_inline(s[1:-1]), role_s)); continue

        if s.startswith("**") and "**" in s[2:]:
            story.append(Paragraph(_md_inline(s), body_s)); continue

        if s.startswith("- ") or s.startswith("* "):
            story.append(Paragraph("- " + _md_inline(s[2:].strip()), bullet_s)); continue

        if re.match(r"^\d+\.\s", s):
            num = re.match(r"^(\d+)\.", s).group(1)
            story.append(Paragraph(f"{num}. " + _md_inline(
                re.sub(r"^\d+\.\s*", "", s).strip()), bullet_s)); continue

        if s in ("---", "***", "___"):
            story.append(HRFlowable(width=W, thickness=0.3,
                                    color=colors.HexColor("#c8d8d8"), spaceAfter=2)); continue
        if s:
            story.append(Paragraph(_md_inline(s), body_s))
        else:
            story.append(Spacer(1, 3))

    story += [
        Spacer(1, 10),
        HRFlowable(width=W, thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=3),
        Paragraph(f"Visual Resume  |  {date.today().strftime('%B %d, %Y')}  |  "
                  "Submit ATS-Friendly PDF to job portals", note_s),
    ]

    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=RM, leftMargin=LM,
        topMargin=0.55*inch, bottomMargin=0.5*inch,
    )
    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    return buffer.getvalue()


# ── ATS-FRIENDLY RESUME PDF (single-column, no tables/images) ────────────────
def generate_ats_pdf(resume_section: str, target_role: str = "") -> bytes:
    """
    Single-column, no-frills PDF for ATS submission.
    No tables, no columns, no images — maximises machine parsability.
    """
    buffer = io.BytesIO()
    W = letter[0] - 1.4 * inch

    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=0.7*inch, leftMargin=0.7*inch,
        topMargin=0.65*inch,  bottomMargin=0.65*inch,
    )

    BLACK = colors.HexColor("#1e293b")
    GREY  = colors.HexColor("#64748b")
    WHITE = colors.white

    SECTION_KW = {"PROFESSIONAL", "EXPERIENCE", "EDUCATION", "SKILLS",
                  "SUMMARY", "CERTIFICATIONS", "PROJECTS", "AWARDS",
                  "WORK", "TECHNICAL", "ADDITIONAL", "CORE", "COMPETENCIES",
                  "KEY", "ACHIEVEMENT", "TOOLS"}

    def ps(name, font="Helvetica", size=10, leading=14,
           color=BLACK, align=TA_LEFT, **kw):
        return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading,
                              textColor=color, alignment=align, **kw)

    name_s    = ps("AN", "Helvetica-Bold",   16, 20, BLACK, TA_LEFT)
    contact_s = ps("AC", "Helvetica",         9, 13, GREY,  TA_LEFT, spaceAfter=4)
    sec_s     = ps("AS", "Helvetica-Bold",   10, 14, BLACK, spaceBefore=10, spaceAfter=2)
    co_s      = ps("AO", "Helvetica-Bold",   10, 14, BLACK)
    role_s    = ps("AR", "Helvetica-Oblique", 9, 13, GREY,  spaceAfter=1)
    date_s    = ps("AD", "Helvetica",         9, 13, GREY)
    bullet_s  = ps("AB", "Helvetica",         9, 13, BLACK, leftIndent=12, firstLineIndent=-6, spaceAfter=1)
    body_s    = ps("BD", "Helvetica",         9, 13, BLACK, spaceAfter=2)

    body = re.sub(r"(?m)^#{1,3}\s+(?:\d+[\.\:]?\s*)?TAILORED RESUME[^\n]*\n?",
                  "", resume_section, flags=re.IGNORECASE).strip()
    lines = body.split("\n")

    name, contact = "", ""
    skip = set()
    for idx, raw in enumerate(lines[:8]):
        s = raw.strip()
        if not s: continue
        bold_m  = re.match(r"^\*\*([^*|]+)\*\*\s*$", s)
        plain_m = re.match(r"^[A-Z][a-z]+(?: [A-Z][a-z]*)+$", s) and len(s) < 45
        if not name and (bold_m or plain_m):
            candidate = bold_m.group(1).strip() if bold_m else s
            if not any(kw in candidate.upper() for kw in SECTION_KW):
                name = candidate; skip.add(idx); continue
        if not contact and ("|" in s or "@" in s) and not s.startswith("#"):
            contact = re.sub(r"\*+", "", s).strip(); skip.add(idx); continue

    story = []
    story.append(Paragraph(name or "Candidate", name_s))
    if contact:
        story.append(Paragraph(contact, contact_s))
    story.append(HRFlowable(width=W, thickness=1, color=BLACK, spaceAfter=6))

    for idx, raw in enumerate(lines):
        if idx in skip: continue
        s = raw.strip()

        hm = re.match(r"^#{2,3}\s+(?:\d+[\.\:]?\s*)?(.+)$", s)
        bold_sec = re.match(r"^\*\*([^*]+)\*\*\s*$", s)
        heading_txt = None
        if hm:
            heading_txt = hm.group(1).strip()
        elif bold_sec and any(kw in bold_sec.group(1).upper() for kw in SECTION_KW):
            heading_txt = bold_sec.group(1).strip()

        if heading_txt:
            story.append(Paragraph(heading_txt.upper(), sec_s))
            story.append(HRFlowable(width=W, thickness=0.5, color=GREY, spaceAfter=3))
            continue

        if bold_sec:
            inner  = bold_sec.group(1).strip()
            date_m = re.search(
                r"[\|—\-]\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec"
                r"|20\d\d|Present)[^\|]*)", inner, re.IGNORECASE)
            if date_m:
                right_txt = date_m.group(1).strip()
                left_txt  = inner[:date_m.start()].strip().rstrip("|—- ")
                story.append(Spacer(1, 4))
                story.append(Paragraph(_md_inline(left_txt), co_s))
                story.append(Paragraph(_md_inline(right_txt), date_s))
            else:
                story.append(Spacer(1, 3))
                story.append(Paragraph(_md_inline(s), co_s))
            continue

        if re.match(r"^\*[^*].+[^*]\*$", s):
            story.append(Paragraph(_md_inline(s[1:-1]), role_s))
            continue

        if s.startswith("**") and "**" in s[2:]:
            story.append(Paragraph(_md_inline(s), body_s))
            continue

        if s.startswith("- ") or s.startswith("* "):
            story.append(Paragraph("- " + _md_inline(s[2:].strip()), bullet_s))
            continue

        if re.match(r"^\d+\.\s", s):
            num = re.match(r"^(\d+)\.", s).group(1)
            story.append(Paragraph(f"{num}. " + _md_inline(
                re.sub(r"^\d+\.\s*", "", s).strip()), bullet_s))
            continue

        if s in ("---", "***", "___"):
            story.append(HRFlowable(width=W, thickness=0.3,
                                    color=colors.HexColor("#cbd5e1"), spaceAfter=2))
            continue

        if s:
            story.append(Paragraph(_md_inline(s), body_s))
        else:
            story.append(Spacer(1, 3))

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
fmt_col, run_col, _ = st.columns([3, 2, 3])
with fmt_col:
    resume_format = st.radio(
        "Resume format",
        options=["🎨 Two-Column Visual", "📄 Classic Single Column"],
        index=0,
        horizontal=True,
        help=(
            "Two-Column Visual: modern design with avatar — great for sharing with recruiters. "
            "Classic Single Column: clean and safe — guaranteed alignment on any resume length."
        )
    )
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

    use_two_col = resume_format.startswith("🎨")

    # ── Generate PDFs (cached; re-generate when role or format changes) ────────
    cache_key = f"{safe_role}_{use_two_col}"
    if st.session_state.get("pdf_cache_key") != cache_key:
        if use_two_col:
            st.session_state["visual_pdf"] = generate_resume_pdf(resume_section or result, target_role)
        st.session_state["ats_pdf"]    = generate_ats_pdf(resume_section or result, target_role)
        st.session_state["report_pdf"] = generate_report_pdf(result, target_role)
        st.session_state["pdf_cache_key"] = cache_key

    ats_pdf    = st.session_state["ats_pdf"]
    report_pdf = st.session_state["report_pdf"]

    # ── Success + download buttons ─────────────────────────────────────────────
    left_col, _ = st.columns([1, 1])
    with left_col:
        st.success("✅ Done! Your tailored resume package is ready.")
        st.markdown("#### 📥 Download")

        if use_two_col:
            st.markdown(
                '<p class="dl-label">🎨 Two-column visual resume — share with recruiters</p>',
                unsafe_allow_html=True
            )
            st.download_button(
                label="⬇️  Visual Resume PDF",
                data=st.session_state["visual_pdf"],
                file_name=f"resume_visual_{safe_role}.pdf" if safe_role else "resume_visual.pdf",
                mime="application/pdf",
                type="primary",
                use_container_width=True,
                key="dl_visual"
            )
            st.markdown("<br>", unsafe_allow_html=True)

        st.markdown(
            '<p class="dl-label">🤖 ATS resume — submit this to job portals</p>',
            unsafe_allow_html=True
        )
        st.download_button(
            label="⬇️  ATS-Friendly Resume PDF",
            data=ats_pdf,
            file_name=f"resume_ats_{safe_role}.pdf" if safe_role else "resume_ats.pdf",
            mime="application/pdf",
            type="primary" if not use_two_col else "secondary",
            use_container_width=True,
            key="dl_ats"
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
