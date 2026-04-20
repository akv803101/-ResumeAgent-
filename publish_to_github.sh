#!/bin/bash
# ============================================================
# publish_to_github.sh
# Run this script ONCE from inside the "Resume Tailor Agent" folder
# to create the GitHub repo and push everything.
#
# Requirements:
#   - Git installed
#   - GitHub CLI (gh) installed  →  https://cli.github.com
#   - Logged in: run  gh auth login  first
# ============================================================

set -e  # Exit on any error

REPO_NAME="resume-tailor-agent"
GITHUB_USER="akv803101"
DESCRIPTION="AI-powered resume tailoring agent — paste a LinkedIn JD + resume, get an ATS-optimized tailored resume as PDF. Built with Claude Sonnet + Streamlit."

echo ""
echo "🚀 Resume Tailor Agent — GitHub Publisher"
echo "==========================================="
echo ""

# 1. Initialize git if not already done
if [ ! -d ".git" ]; then
  echo "📁 Initializing git repository..."
  git init -b main
  git config user.name "Aakash"
  git config user.email "akv29005@gmail.com"
else
  echo "✅ Git repo already initialized"
fi

# 2. Create .gitignore if missing
if [ ! -f ".gitignore" ]; then
  cat > .gitignore << 'EOF'
__pycache__/
*.py[cod]
.env
.venv/
venv/
output/
*.pdf
.DS_Store
.streamlit/secrets.toml
EOF
  echo "✅ Created .gitignore"
fi

# 3. Stage everything
echo "📦 Staging files..."
git add -A
git status --short

# 4. Commit
echo ""
echo "💾 Creating initial commit..."
git commit -m "$(cat <<'EOF'
Initial commit: Resume Tailor Agent

5-skill AI pipeline that tailors resumes to LinkedIn job descriptions:
- jd_parser: extracts ATS keywords and role structure
- gap_analyzer: match matrix (MATCH/GAP/PARTIAL/TRANSFERABLE)
- bullet_rewriter: STAR-K formula rewrites with JD keywords
- summary_generator: 3 scored professional summary variants
- ats_scorer: before/after ATS compatibility scorecard

Streamlit app with PDF export via ReportLab.
Cost: ~$0.03/run on Claude Sonnet.
EOF
)"

# 5. Create GitHub repo (public)
echo ""
echo "🌐 Creating GitHub repository: $GITHUB_USER/$REPO_NAME..."
gh repo create "$REPO_NAME" \
  --public \
  --description "$DESCRIPTION" \
  --source=. \
  --remote=origin \
  --push

echo ""
echo "✅ Done! Your repo is live at:"
echo "   https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "Next steps:"
echo "  1. Add a star ⭐ to your own repo to boost visibility"
echo "  2. Go to Settings → Topics and add: ai, resume, streamlit, claude, ats, python"
echo "  3. Share the link in your LinkedIn Featured section"
echo ""
