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
    HRFlowable, KeepTogether, KeepInFrame, PageBreak, Flowable
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



# ── TAILORED RESUME PDF — two-column professional layout ─────────────────────
# Known section names (whitelist prevents cert titles like "USAII CAIC" being
# misidentified as section headers)
_KNOWN_SECTIONS = {
    "PROFESSIONAL SUMMARY","SUMMARY","EXPERIENCE","WORK EXPERIENCE",
    "EDUCATION","SKILLS","TECHNICAL SKILLS","CERTIFICATIONS",
    "KEY ACHIEVEMENTS","ACHIEVEMENTS","PROJECTS","LANGUAGES",
    "AWARDS","ADDITIONAL","INTERESTS","OBJECTIVE","PROFILE",
}

def generate_resume_pdf(resume_section: str, target_role: str = "") -> bytes:
    """
    Two-column professional resume PDF.
    Left col: Summary + Experience  |  Right col: Certs + Achievements + Skills (as tags)
    Full-width header with name, title, contact, and avatar circle.
    """
    from reportlab.graphics.shapes import Drawing, Ellipse, String as GStr

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=0.50*inch, leftMargin=0.50*inch,
        topMargin=0.50*inch,   bottomMargin=0.45*inch,
    )
    W = letter[0] - 1.0*inch        # 540 pt  (7.5 inch)

    # ── Palette ───────────────────────────────────────────────────────────────
    DARK   = colors.HexColor("#1a1a2e")
    BLUE   = colors.HexColor("#0088cc")
    MGREY  = colors.HexColor("#cccccc")
    DGREY  = colors.HexColor("#666666")
    LGREY  = colors.HexColor("#efefef")
    BLACK  = colors.HexColor("#333333")
    WHITE  = colors.white
    AV_COL = colors.HexColor("#00a8e8")

    # ── Styles ────────────────────────────────────────────────────────────────
    def ps(n, font="Helvetica", size=10, leading=14, color=BLACK,
           align=TA_LEFT, **kw):
        return ParagraphStyle(n, fontName=font, fontSize=size, leading=leading,
                              textColor=color, alignment=align, **kw)

    NAME_S = ps("RN",  "Helvetica-Bold", 24, 28, DARK,  TA_LEFT)
    ROLE_S = ps("RRL", "Helvetica-Bold", 11, 15, BLUE,  TA_LEFT, spaceAfter=2)
    CONT_S = ps("RCT", "Helvetica",       8,  12, DGREY, TA_LEFT)
    SEC_S  = ps("RSH", "Helvetica-Bold",  9,  12, DARK,  TA_LEFT,
                spaceBefore=6, spaceAfter=1)
    JOB_S  = ps("RJT", "Helvetica-Bold",  9,  13, DARK,  TA_LEFT, spaceAfter=0)
    CO_S   = ps("RCO", "Helvetica-Bold",  8.5,12, BLUE,  TA_LEFT, spaceAfter=0)
    DATE_S = ps("RDT", "Helvetica",        8,  11, DGREY, TA_LEFT, spaceAfter=1)
    DESC_S = ps("RDS", "Helvetica-Oblique",7.5,11, DGREY, TA_LEFT, spaceAfter=1)
    BUL_S  = ps("RBL", "Helvetica",        8.5,13, BLACK,
                leftIndent=10, firstLineIndent=-8, spaceAfter=1)
    CERT_H = ps("RCH", "Helvetica-Bold",   8.5,12, DARK,  TA_LEFT, spaceAfter=1)
    CERT_D = ps("RCD", "Helvetica",         7.5,11, DGREY, TA_LEFT, spaceAfter=4)
    BODY_S = ps("RBD", "Helvetica",         8.5,13, BLACK, TA_LEFT, spaceAfter=2)
    TAG_S  = ps("RTG", "Helvetica",         7.5,11, BLACK, TA_CENTER)
    NOTE_S = ps("RFT", "Helvetica",         6.5,10, DGREY, TA_CENTER)

    # ── Column geometry ───────────────────────────────────────────────────────
    LW     = W * 0.60          # 324 pt  (left column)
    RW     = W * 0.38          # 205 pt  (right column)
    GAP_PT = int(W * 0.02)     # ~11 pt  (gap = right-padding of left cell)
    L_INN  = LW - GAP_PT       # available width for left HRFlowable
    R_INN  = RW                # available width for right HRFlowable

    # ── Helpers ───────────────────────────────────────────────────────────────
    def sec_head(title, inner_w):
        return [
            Paragraph(title.upper(), SEC_S),
            HRFlowable(width=inner_w, thickness=1, color=MGREY, spaceAfter=4),
        ]

    def skill_tags(items, col_w):
        """Render a list of skill strings as grey pill tags in a Table."""
        if not items:
            return []
        NCOLS = 3
        tag_w = (col_w - 3 * (NCOLS - 1)) / NCOLS
        rows  = []
        for j in range(0, len(items), NCOLS):
            chunk = items[j:j+NCOLS]
            while len(chunk) < NCOLS:
                chunk.append("")
            rows.append([Paragraph(c, TAG_S) for c in chunk])
        t = Table(rows, colWidths=[tag_w] * NCOLS)
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), LGREY),
            ("GRID",          (0,0), (-1,-1), 2,   WHITE),
            ("LEFTPADDING",   (0,0), (-1,-1), 4),
            ("RIGHTPADDING",  (0,0), (-1,-1), 4),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("ALIGN",         (0,0), (-1,-1), "CENTER"),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))
        return [t, Spacer(1, 4)]

    # ── Parse resume section ──────────────────────────────────────────────────
    text  = re.sub(r"^###\s+\d*\.?\s*TAILORED RESUME[^\n]*\n?", "",
                   resume_section, flags=re.IGNORECASE).strip()
    lines = text.split("\n")

    # Extract name
    name = ""; name_idx = -1; contact_line = ""
    for idx, raw in enumerate(lines[:8]):
        s = raw.strip()
        if not s:
            continue
        m = re.match(r"^\*\*([^*|]+)\*\*\s*$", s)
        if m and m.group(1).strip().upper() not in _KNOWN_SECTIONS:
            name = m.group(1).strip(); name_idx = idx; break
        if (re.match(r"^[A-Z][a-z]+ [A-Z]", s) and len(s) < 50
                and "|" not in s and "@" not in s and not s.startswith("#")):
            name = s; name_idx = idx; break

    # Extract contact line (has | or @, close to name)
    for idx in range(max(0, name_idx), min(name_idx + 5, len(lines))):
        s = lines[idx].strip()
        if ("|" in s or "@" in s) and not s.startswith("#") and not s.startswith("**"):
            contact_line = re.sub(r"\*+", "", s).strip()
            break

    # Initials for avatar
    words    = (name or "Candidate").split()
    initials = (words[0][0] + words[-1][0]).upper() if len(words) >= 2 else (name + "XX")[:2].upper()

    # ── Avatar circle ─────────────────────────────────────────────────────────
    AV = 58
    av = Drawing(AV, AV)
    av.add(Ellipse(AV/2, AV/2, AV/2-1, AV/2-1, fillColor=AV_COL, strokeColor=None))
    av.add(GStr(AV/2, AV/2-6, initials, textAnchor='middle',
                fontSize=18, fillColor=WHITE, fontName='Helvetica-Bold'))

    # ── Header Table (full width) ─────────────────────────────────────────────
    hdr = Table(
        [[[Paragraph(name or "Candidate", NAME_S),
           Paragraph(target_role or "", ROLE_S),
           Paragraph(contact_line, CONT_S)],
          av]],
        colWidths=[W * 0.80, W * 0.20]
    )
    hdr.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN",         (1,0), (1,0),   "RIGHT"),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))

    # ── Section parsing ───────────────────────────────────────────────────────
    LEFT_ORDER  = ["PROFESSIONAL SUMMARY", "SUMMARY", "EXPERIENCE",
                   "WORK EXPERIENCE", "PROJECTS", "OBJECTIVE"]
    RIGHT_ORDER = ["CERTIFICATIONS", "KEY ACHIEVEMENTS", "ACHIEVEMENTS",
                   "AWARDS", "SKILLS", "TECHNICAL SKILLS", "EDUCATION",
                   "LANGUAGES", "ADDITIONAL"]

    sections   = {}   # sec_name → [flowables]
    skills_raw = {}   # sec_name → [skill strings]
    current    = None
    # Only skip preamble lines if we actually found the name; otherwise parse from top
    SKIP_TO    = (name_idx + 3) if name_idx >= 0 else 0

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        s    = line.strip()

        # Determine if this line is a section header
        # 1. Any markdown heading (# / ## / ###)
        is_heading   = bool(re.match(r"^#+\s+", s))
        raw_sec_name = re.sub(r"^#+\s*|\*+", "", s).strip().upper()

        # 2. Bold header in any case: **Professional Summary** or **PROFESSIONAL SUMMARY**
        #    Only recognised if the normalised name is in the known-sections whitelist.
        is_bold_caps = bool(
            re.match(r"^\*\*[A-Za-z][A-Za-z &/\-]+\*\*\s*$", s)
            and len(raw_sec_name) >= 4
            and raw_sec_name in _KNOWN_SECTIONS
        )

        # 3. Plain ALL-CAPS header with no formatting (e.g. "EXPERIENCE")
        is_plain_caps = bool(
            s and s == s.upper() and s.replace(" ", "").isalpha()
            and len(s) >= 4 and s in _KNOWN_SECTIONS
        )

        is_section_header = is_heading or is_bold_caps or is_plain_caps

        # Skip header lines (name/contact) but never skip a section header
        if i < SKIP_TO and not is_section_header:
            i += 1; continue

        if is_section_header:
            current = raw_sec_name
            if current not in sections:
                sections[current] = []
            i += 1; continue

        if current is None:
            i += 1; continue

        fl          = sections[current]
        is_cert_sec = current in {"CERTIFICATIONS", "KEY ACHIEVEMENTS", "ACHIEVEMENTS"}

        # Bold line — either experience entry (with date) or cert title (no date)
        if re.match(r"^\*\*[^*]+\*\*", s):
            full   = re.sub(r"\*+", "", s)
            date_m = re.search(
                r"[\|—\-]\s*((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct"
                r"|Nov|Dec|20\d\d|Present)[^|]*)$", full, re.I)
            if date_m:
                dt    = date_m.group(1).strip()
                left  = full[:date_m.start()].strip().rstrip("|—- ")
                parts = re.split(r"\s*[\|—,]\s*", left, 1)
                fl.append(Spacer(1, 6))
                if len(parts) == 2:
                    fl.append(Paragraph(_md_inline(parts[0]), JOB_S))
                    fl.append(Paragraph(_md_inline(parts[1]), CO_S))
                else:
                    fl.append(Paragraph(_md_inline(left), JOB_S))
                fl.append(Paragraph(f"\U0001f4c5 {dt}", DATE_S))
            else:
                fl.append(Spacer(1, 3))
                fl.append(Paragraph(_md_inline(re.sub(r"\*+", "", s).strip()), CERT_H))

        # Italic description / company tagline
        elif s.startswith("*") and s.endswith("*") and not s.startswith("**"):
            fl.append(Paragraph(_md_inline(s[1:-1]), DESC_S))

        # Bullet points
        elif s.startswith("- ") or s.startswith("• "):
            txt = s[2:].strip()
            if current in {"SKILLS", "TECHNICAL SKILLS"}:
                _, vals = (txt.split(":", 1) if ":" in txt else ("", txt))
                skills_raw.setdefault(current, []).extend(
                    [v.strip() for v in vals.split(",") if v.strip()])
            else:
                fl.append(Paragraph("\u2022 " + _md_inline(txt), BUL_S))

        # "Category: skill1, skill2" (skills without bullet)
        elif ":" in s and current in {"SKILLS", "TECHNICAL SKILLS"}:
            _, vals = s.split(":", 1)
            skills_raw.setdefault(current, []).extend(
                [v.strip() for v in vals.split(",") if v.strip()])

        # Horizontal rule
        elif s in ("---", "***", "___"):
            fl.append(HRFlowable(width="100%", thickness=0.3,
                                 color=MGREY, spaceAfter=2))

        # Body / description text
        elif s:
            fl.append(Paragraph(_md_inline(s),
                                CERT_D if is_cert_sec else BODY_S))
        else:
            fl.append(Spacer(1, 2))
        i += 1

    # ── Assemble left and right columns ───────────────────────────────────────
    left_fl  = []
    right_fl = []
    placed   = set()

    for sn in LEFT_ORDER:
        if sn in sections:
            left_fl += sec_head(sn, L_INN)
            left_fl += sections[sn]
            placed.add(sn)

    for sn in RIGHT_ORDER:
        if sn in sections:
            right_fl += sec_head(sn, R_INN)
            right_fl += (skill_tags(skills_raw[sn], R_INN)
                         if sn in skills_raw else sections[sn])
            placed.add(sn)

    # Anything not categorised → left column
    for sn, fl in sections.items():
        if sn not in placed and fl:
            left_fl += sec_head(sn, L_INN)
            left_fl += fl

    # ── Fallback: if body is still empty, render all content as plain flow ────
    if not left_fl and not right_fl:
        # Re-parse lines as flat content — handles any AI format that didn't
        # trigger section detection at all.
        for raw in lines[SKIP_TO:]:
            s = raw.strip()
            if not s:
                left_fl.append(Spacer(1, 3))
            elif s.startswith("- ") or s.startswith("• "):
                left_fl.append(Paragraph("\u2022 " + _md_inline(s[2:]), BUL_S))
            elif re.match(r"^\*\*[^*]+\*\*", s) or re.match(r"^#+\s+", s):
                title = re.sub(r"^#+\s*|\*+", "", s).strip()
                left_fl += [
                    Spacer(1, 6),
                    Paragraph(title.upper(), SEC_S),
                    HRFlowable(width=L_INN, thickness=1, color=MGREY, spaceAfter=4),
                ]
            elif s:
                left_fl.append(Paragraph(_md_inline(s), BODY_S))

    # ── Two-column body Table ─────────────────────────────────────────────────
    body = Table([[left_fl, right_fl]], colWidths=[LW, RW])
    body.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (0,-1),  GAP_PT),
        ("RIGHTPADDING",  (1,0), (1,-1),  0),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ("LINEAFTER",     (0,0), (0,-1),  0.5, MGREY),
    ]))

    story = [
        hdr,
        HRFlowable(width=W, thickness=1, color=MGREY, spaceAfter=8),
        body,
        Spacer(1, 8),
        HRFlowable(width=W, thickness=0.5, color=MGREY, spaceAfter=3),
        Paragraph(
            "ATS-Optimised by Resume Tailor Agent  \u2022  "
            "github.com/akv803101/resume-tailor-agent",
            NOTE_S
        ),
    ]
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
                st.session_state["result"]     = result
                st.session_state["jd_snippet"] = jd[:80]
                # Clear cached PDFs so they regenerate for new result
                st.session_state.pop("resume_pdf", None)
                st.session_state.pop("report_pdf", None)
                st.session_state.pop("pdf_role",   None)
            except Exception as e:
                st.error(f"❌ Error: {e}")

# ── Results ───────────────────────────────────────────────────────────────────
if "result" in st.session_state:
    result     = st.session_state["result"]
    jd_snippet = st.session_state.get("jd_snippet", "")

    # Extract metadata
    role_match  = re.search(r"Target Role:\s*(.+)", result)
    target_role = role_match.group(1).strip() if role_match else jd_snippet
    safe_role   = re.sub(r"[^\w\s-]", "", target_role)[:40].strip().replace(" ", "_")

    resume_section = _extract_section(result, "TAILORED RESUME")

    # Generate PDFs (cached so re-renders don't re-generate)
    if "resume_pdf" not in st.session_state or st.session_state.get("pdf_role") != safe_role:
        st.session_state["resume_pdf"] = generate_resume_pdf(
            resume_section if resume_section else result,
            target_role
        )
        st.session_state["report_pdf"] = generate_report_pdf(result, target_role)
        st.session_state["pdf_role"]   = safe_role

    resume_pdf = st.session_state["resume_pdf"]
    report_pdf = st.session_state["report_pdf"]

    # ── Success + two stacked download buttons in left column ─────────────────
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
