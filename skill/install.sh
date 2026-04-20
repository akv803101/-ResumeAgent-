#!/bin/bash
# install.sh — Installs the Resume Tailor Agent as a Cowork skill
# Run this once from the "Resume Tailor Agent" folder

SKILL_DIR="$HOME/.claude/skills/resume-tailor-agent"

echo "Installing Resume Tailor Agent skill..."
mkdir -p "$SKILL_DIR"
cp skill/SKILL.md "$SKILL_DIR/SKILL.md"
echo "✅ Skill installed to: $SKILL_DIR"
echo "Restart Cowork to activate the skill."
