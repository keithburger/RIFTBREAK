#!/usr/bin/env bash
# Optional Claude Code PostToolUse hook (see docs/TESTING.md for how to enable it).
# Cheap and targeted: an edit under src/content/ triggers registry validation (~1 s).
# It never runs the test suite or a full type check — use `npm run verify` for that.
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input?.file_path||"")}catch{console.log("")}})')
case "$file" in
  */src/content/*.ts)
    cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
    out=$(npx --no-install tsx scripts/validate-content.ts 2>&1) || { echo "Content validation failed after editing $file:" >&2; echo "$out" | tail -15 >&2; exit 2; }
    ;;
esac
exit 0
