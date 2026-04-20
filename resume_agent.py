# resume_agent.py — CLI Runner

import anthropic
import sys
import os

def load_system_prompt():
    """Load orchestrator + all skills into one system prompt."""
    base = open("agents/resume_tailor_agent.md").read()
    skills = [
        "jd_parser", "gap_analyzer", "bullet_rewriter",
        "summary_generator", "ats_scorer"
    ]
    for s in skills:
        base += f"\n\n---\n\n" + open(f"skills/{s}.md").read()
    return base

def tailor_resume(jd_text: str, resume_text: str) -> str:
    """Run the full Resume Tailor Agent pipeline."""
    client = anthropic.Anthropic()

    user_input = f"""## Job Description
{jd_text}

## My Current Resume
{resume_text}"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=6000,
        system=load_system_prompt(),
        messages=[{"role": "user", "content": user_input}]
    )
    return response.content[0].text

if __name__ == "__main__":
    jd = open(sys.argv[1]).read() if len(sys.argv) > 1 else input("Paste JD:\n")
    resume = open(sys.argv[2]).read() if len(sys.argv) > 2 else input("Paste Resume:\n")

    print("\n🔄 Running Resume Tailor Agent...\n")
    result = tailor_resume(jd, resume)
    print(result)

    os.makedirs("output", exist_ok=True)
    with open("output/tailored_report.md", "w") as f:
        f.write(result)
    print("\n✅ Saved to output/tailored_report.md")
