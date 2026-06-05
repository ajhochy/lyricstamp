#!/usr/bin/env python3
"""Repo-local AI workflow script for ableset-lyrics-sync."""

import argparse
import subprocess
import sys
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(cmd, **kwargs):
    return subprocess.run(cmd, shell=True, cwd=REPO_ROOT, **kwargs)


def cmd_status(args):
    print(f"Repo: {REPO_ROOT}")
    print("Stack: Node.js / TypeScript / Vite / Electron (in progress)")
    print("Checks: npm run typecheck && npm run lint && npm test")
    result = run("git rev-parse --abbrev-ref HEAD", capture_output=True, text=True)
    print(f"Branch: {result.stdout.strip()}")


def cmd_checks(args):
    level = args.level
    print(f"[checks] level={level}")

    steps = [
        ("typecheck", "npm run typecheck"),
        ("lint",      "npm run lint"),
        ("test",      "npm test"),
    ]

    if level in ("pr", "smoke"):
        steps.append(("build", "npm run build"))

    failed = []
    for name, cmd in steps:
        print(f"\n--- {name} ---")
        r = run(cmd)
        if r.returncode != 0:
            failed.append(name)

    if failed:
        print(f"\n[checks] FAILED: {', '.join(failed)}")
        sys.exit(1)
    else:
        print(f"\n[checks] ALL PASSED")


def cmd_next_issue(args):
    print("Next issue: Issue 1 — Electron wrapper (electron-vite)")
    print("See docs/ai/current-plan.md for details.")


def cmd_start_issue(args):
    issue = args.issue
    slugs = {
        "1": "electron-wrapper",
    }
    slug = slugs.get(str(issue), f"issue-{issue}")
    branch = f"issue-{issue}-{slug}"

    print(f"[start-issue] Branch: {branch}")
    r = run("git rev-parse --abbrev-ref HEAD", capture_output=True, text=True)
    current = r.stdout.strip()
    print(f"[start-issue] Current branch: {current}")

    if args.execute:
        r = run(f"git checkout -b {branch}")
        if r.returncode != 0:
            print(f"[start-issue] Branch may already exist, checking out...")
            run(f"git checkout {branch}")
    else:
        print(f"[start-issue] Dry-run. Pass --execute to create branch.")


def cmd_open_pr(args):
    title = args.title or "Workflow PR"
    r = run("git rev-parse --abbrev-ref HEAD", capture_output=True, text=True)
    branch = r.stdout.strip()

    body = (
        "## Summary\n"
        "- Electron wrapper (electron-vite) for standalone macOS `.app`\n"
        "- Refactored server to export `start()`, added static file serving\n"
        "- electron-builder config for code-signed distribution\n\n"
        "## Test plan\n"
        "- [ ] `npm run typecheck` passes\n"
        "- [ ] `npm test` passes\n"
        "- [ ] `npm run electron:dev` opens app as Electron window\n"
        "- [ ] `npm run electron:dist` produces `.app`\n"
        "- [ ] Manual smoke: connect to Ableton, stamp, export\n\n"
        "🤖 Generated with [Claude Code](https://claude.ai/claude-code)"
    )

    print(f"[open-pr] Branch: {branch}")
    print(f"[open-pr] Title: {title}")

    if args.execute:
        cmd = f'gh pr create --title "{title}" --body "{body}" --draft --base main'
        run(cmd)
    else:
        print("[open-pr] Dry-run. Pass --execute to open PR.")
        print(f"\nPR title: {title}")
        print(f"PR body preview:\n{body}")


def cmd_run(args):
    if args.issue:
        issues = [i.strip() for i in args.issue.split(",")]
        print(f"[run] Issues: {issues}")
        for issue in issues:
            print(f"\n=== Issue {issue} ===")
            # Show issue content from current-plan.md
            with open(os.path.join(REPO_ROOT, "docs/ai/current-plan.md")) as f:
                print(f.read())
    else:
        cmd_status(args)


def cmd_smoke_prompt(args):
    print("=== Smoke Test Prompt ===")
    print()
    print("Launch command:")
    print("  npm run electron:dev")
    print()
    print("Smoke checklist (docs/testing/manual-smoke.md):")
    print("  1. App window opens (no blank/crashed frame)")
    print("  2. Connection badge flips to 'Connected' when Ableton is open with AbletonOSC")
    print("  3. Space bar toggles Ableton play/pause")
    print("  4. Arrow keys stamp + advance lyric lines; timestamp appears in Stamp Log")
    print("  5. Export .als downloads and opens in Ableton with correct MIDI clips")
    print("  6. Leadsheet tab: PDF renders, arrow keys navigate pages, export .zip works")
    print()
    print("Options:")
    print("  A. Manual smoke — run the launch command above and walk the checklist")
    print("  B. AI UI smoke  — dispatch a computer-control agent to walk the checklist")


def main():
    parser = argparse.ArgumentParser(description="AI workflow script for ableset-lyrics-sync")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status")

    p_checks = sub.add_parser("checks")
    p_checks.add_argument("--level", choices=["issue", "smoke", "pr"], default="issue")

    p_next = sub.add_parser("next-issue")
    p_next.add_argument("--milestone")

    p_start = sub.add_parser("start-issue")
    p_start.add_argument("--issue", required=True)
    p_start.add_argument("--execute", action="store_true")

    p_pr = sub.add_parser("open-pr")
    p_pr.add_argument("--title")
    p_pr.add_argument("--execute", action="store_true")

    p_run = sub.add_parser("run")
    p_run.add_argument("--issue")
    p_run.add_argument("--execute", action="store_true")
    p_run.add_argument("--after")
    p_run.add_argument("--check-level", default="issue")
    p_run.add_argument("--pr-title")

    sub.add_parser("smoke-prompt")

    args = parser.parse_args()

    dispatch = {
        "status":       cmd_status,
        "checks":       cmd_checks,
        "next-issue":   cmd_next_issue,
        "start-issue":  cmd_start_issue,
        "open-pr":      cmd_open_pr,
        "run":          cmd_run,
        "smoke-prompt": cmd_smoke_prompt,
    }

    if args.command in dispatch:
        dispatch[args.command](args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
