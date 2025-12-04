---
command: "/orchestrate5-all"
category: "Project Orchestration"
purpose: "Process ALL open GitHub issues sequentially using 5-agent workflow until none remain unprocessed"
---

# Orchestrate5 All - Batch Issue Processor (5-Agent Workflow)

Process every open GitHub issue using the 5-agent workflow until ALL are either closed or have comments.

**Project**: Trevor Inventory - Next.js 14 (App Router) + Prisma ORM + PostgreSQL + NextAuth

**Project Root**: `/home/pbrown/SkuInventory`

## 🚨 CRITICAL: DO NOT STOP FOR PERMISSION 🚨

**YOU MUST CONTINUE PROCESSING UNTIL DONE. STOPPING TO ASK IS A FAILURE.**

- ❌ "Should I continue?" = WRONG
- ❌ "Do you want me to process the next issue?" = WRONG
- ❌ "I've completed 5 issues, shall I proceed?" = WRONG
- ✅ Automatically proceed to next issue = CORRECT
- ✅ Only stop when ALL issues processed = CORRECT

## Workflow

### Step 1: Fetch All Open Issues

```bash
gh issue list --state open --limit 200 --json number,title,comments
```

### Step 2: Filter Unprocessed Issues

An issue is "unprocessed" if it has ZERO comments. Any comment (human or agent) means it's been engaged.

```bash
# Issues with no comments - these need processing
gh issue list --state open --limit 200 --json number,title,comments \
  --jq '.[] | select(.comments | length == 0) | {number, title}'
```

### Step 3: Build Processing Queue

Sort unprocessed issues by number (ascending). Report:
```
📋 Found X open issues total
📋 Y already have comments (skipping)
📋 Processing Z uncommented issues: #A, #B, #C, ...
```

### Step 4: Process Each Issue

For EACH issue in the queue:

1. Report: `🚀 Starting issue #N (M of Z remaining)`
2. Run: `/orchestrate5 #N` (full 5-agent workflow) - update the gh issue after each agent runs so we can track progress
3. When complete, **IMMEDIATELY** proceed to next issue
4. DO NOT wait for user input
5. DO NOT ask if you should continue

### Step 5: Final Report (ONLY when ALL issues done)

```markdown
# Batch Processing Complete

## Summary
- Total issues processed: Z
- Closed: X
- Commented (needs follow-up): Y
- Failed: F

## Issues Processed
| Issue | Status | Duration | Notes |
|-------|--------|----------|-------|
| #7    | ✅ Closed | 12m | Schema fix implemented |
| #8    | 💬 Commented | 8m | Needs design decision |
...

## Next Steps
[Any remaining work or issues that need manual attention]
```

## Exit Conditions (ONLY these are acceptable)

1. ✅ **All issues processed** - Queue empty (no uncommented open issues remain)
2. ⚠️ **Context limit warning** - Proactively warn at 80% usage, complete current issue, then stop
3. 🛑 **Critical unrecoverable error** - Document and continue to next issue if possible

## Anti-Patterns (NEVER DO THESE)

1. ❌ Stop after arbitrary number of issues
2. ❌ Ask "should I continue?"
3. ❌ Wait for user confirmation between issues
4. ❌ Summarize progress and pause
5. ❌ "I've made good progress, let me know if..."
6. ❌ Process issues that already have comments

## The Prime Directive

**Your job is not done until all open issues have at least one comment.**

```bash
# Success = this returns nothing
gh issue list --state open --limit 200 --json number,comments \
  --jq '.[] | select(.comments | length == 0) | .number'
```

Process. Continue. Repeat. Only stop when finished.
