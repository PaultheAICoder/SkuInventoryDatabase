---
command: "/orchestrate"
category: "Project Orchestration"
purpose: "Execute complete 5-agent workflow (Scout → Plan → Build → Test → Cleanup)"
---

# Orchestrate Command - 5-Agent Workflow

Execute the complete 5-agent workflow for implementing features, fixing bugs, or completing chores. This command orchestrates all agents sequentially without doing any work itself.

**Project**: Trevor Inventory - Next.js 14 (App Router) + Prisma ORM + PostgreSQL + NextAuth

**Project Root**: `/Users/paulbrown/Desktop/coding-projects/trevor-inventory`

## ⚠️ CRITICAL: ORCHESTRATION ONLY ⚠️

**WHEN THE USER TYPES `/orchestrate`, YOU ARE A CONDUCTOR, NOT A PERFORMER.**

**YOU MUST:**
- ✅ Call agents directly via Task tool
- ✅ Report agent progress to user
- ✅ Read agent outputs
- ✅ Summarize results
- ✅ Coordinate workflow

**YOU MUST NEVER:**
- ❌ Read code files yourself
- ❌ Write or edit any code
- ❌ Run tests directly
- ❌ Create or modify files
- ❌ Execute bash commands (except for timing/backup)
- ❌ Investigate bugs yourself
- ❌ Do ANY implementation work

**IF YOU CATCH YOURSELF USING Read, Write, Edit, Grep, Glob, or Bash tools directly during `/orchestrate`, YOU ARE DOING IT WRONG. STOP IMMEDIATELY AND DELEGATE TO AN AGENT.**

Your ONLY job is to call agents via the Task tool and report their results. Nothing more.

## Usage

```
/orchestrate [input]
```

**Input can be:**
- Plain text description: `/orchestrate Add dark mode toggle to settings`
- Github issue: `/orchestrate gh issue #17`
- Bug description: `/orchestrate Fix null pointer in prioritizer`
- Multiple items: `/orchestrate Implement OAuth2 + Add user management`

## Workflow Process

### Input Parsing: Extract Issue Number

**Purpose**: Extract GitHub issue number for backup naming and tracking

**Your Role**:
1. Parse user input for issue number patterns:
   - GitHub URL: `https://github.com/user/trevor-inventory/issues/7` → Extract `7`
   - Issue reference: `/orchestrate #7` → Extract `7`
   - Issue command: `/orchestrate gh issue #7` → Extract `7`
   - Plain text: `/orchestrate Add dark mode` → No issue number (use timestamp)

2. Set ISSUE_NUMBER variable:
   ```bash
   # If issue number found:
   ISSUE_NUMBER=7

   # If no issue number:
   ISSUE_NUMBER=$(date +%s)  # Unix timestamp as fallback
   ```

3. Report to user:
   - If GitHub issue: "📋 Processing GitHub Issue #7"
   - If no issue: "📋 Processing ad-hoc task (backup ID: 1729531200)"

### Pre-Workflow: Initialize Timing Metrics

**Purpose**: Track actual execution time for each agent to identify bottlenecks

**Your Role**:
1. Create timing file for this workflow:
   ```bash
   TIMING_FILE=".agents/timing/issue-${ISSUE_NUMBER}-timing.json"
   mkdir -p .agents/timing
   WORKFLOW_START=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

   cat > $TIMING_FILE << EOF
{
  "issue": "$ISSUE_NUMBER",
  "workflow_start": "$WORKFLOW_START"
}
EOF
   ```

2. Report to user: "⏱️ Timing metrics initialized for Issue #$ISSUE_NUMBER"

### Phase 1: Scout Agent

**Purpose**: Investigation and analysis

**Your Role**:
1. Return to project root directory:
   ```bash
   cd /Users/paulbrown/Desktop/coding-projects/trevor-inventory
   ```

2. Capture start timestamp:
   ```bash
   SCOUT_START=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
   echo "⏱️ Scout Agent starting at $SCOUT_START"
   ```

3. Call Scout agent directly
4. Pass input exactly as provided by user
5. Report: "🔍 Scout Agent starting..."
6. Wait for Scout agent to complete
7. **Extract AGENT_RETURN**: Scout will end with `AGENT_RETURN: scout-[ISSUE_NUMBER]-[MMDDYY]` - save this filename

8. Capture end timestamp and save timing
9. Report: "✅ Scout Agent complete"
10. **If GitHub issue**: Post comment with brief summary and filename

**Scout Task**:
```
Task({
  subagent_type: "scout",
  description: "Scout phase - investigation",
  prompt: `**Input**: [pass user's input here]

**Instructions**:
Follow your Scout Agent instructions to investigate and analyze this request.

**Success**: Scout output file created with complete investigation`
})
```

### Phase 2: Plan Agent

**Purpose**: Create detailed implementation plan

**Your Role**:
1. Use Scout's AGENT_RETURN filename (from Phase 1)
2. Call Plan agent via Task tool
3. Report: "📋 Plan Agent starting..."
4. Wait for Plan agent to complete
5. **Extract AGENT_RETURN**: Plan will end with `AGENT_RETURN: plan-[ISSUE_NUMBER]-[MMDDYY]` - save this filename
6. Capture timing
7. Report: "✅ Plan Agent complete"
8. **If GitHub issue**: Post comment with brief summary

**Plan Task**:
```
Task({
  subagent_type: "plan",
  description: "Plan phase - implementation plan",
  prompt: `**Input**: Read the Scout agent's output file: .agents/outputs/[SCOUT_FILENAME_FROM_AGENT_RETURN]

**Instructions**:
Follow your Plan Agent instructions to create detailed implementation plan.

**Success**: Plan output file created with complete implementation roadmap`
})
```

### Phase 3: Build Agent

**Purpose**: Execute implementation

**Your Role**:
1. Use Plan's AGENT_RETURN filename (from Phase 2)
2. Call Build agent via Task tool
3. Report: "🔨 Build Agent starting..."
4. Wait for Build agent to complete
5. **Extract AGENT_RETURN**: Build will end with `AGENT_RETURN: build-[ISSUE_NUMBER]-[MMDDYY]` - save this filename
6. Capture timing
7. Report: "✅ Build Agent complete"
8. **If GitHub issue**: Post comment with brief summary

**Build Task**:
```
Task({
  subagent_type: "build",
  description: "Build phase - implementation",
  prompt: `**Input**: Read the Plan agent's output file: .agents/outputs/[PLAN_FILENAME_FROM_AGENT_RETURN]

**Instructions**:
Follow your Build Agent instructions to execute implementation.
Execute subtasks in order, validate each subtask, fix all warnings.

**Success**: All code created, build output file complete, ready for testing`
})
```

### Phase 4: Test Agent

**Purpose**: Validate and fix issues

**Your Role**:
1. Use Build's AGENT_RETURN filename (from Phase 3)
2. Call Test agent via Task tool
3. Report: "🧪 Test Agent starting..."
4. Wait for Test agent to complete
5. **Extract AGENT_RETURN**: Test will end with `AGENT_RETURN: test-[ISSUE_NUMBER]-[MMDDYY]` - save this filename
6. Capture timing
7. Report: "✅ Test Agent complete"
8. **If GitHub issue**: Post comment with brief summary

**Test Task**:
```
Task({
  subagent_type: "test",
  description: "Test phase - validation",
  prompt: `**Inputs**:
- Build agent's output file: .agents/outputs/[BUILD_FILENAME_FROM_AGENT_RETURN]
- Plan agent's output file: .agents/outputs/[PLAN_FILENAME_FROM_AGENT_RETURN]

**Instructions**:
Follow your Test Agent instructions to validate and fix issues.
Resolve blockers first, create unit tests, run automated validation.

**Success**: All tests passing, test output file complete, ready for cleanup`
})
```

### Phase 5: Cleanup Agent

**Purpose**: Document completion, detect future work, finalize

**Your Role**:
1. Use all AGENT_RETURN filenames (from Phases 1-4)
2. Call Cleanup agent via Task tool
3. Report: "🧹 Cleanup Agent starting..."
4. Wait for Cleanup agent to complete
5. **Extract AGENT_RETURN**: Cleanup will end with `AGENT_RETURN: cleanup-[ISSUE_NUMBER]-[MMDDYY]` - save this filename
6. Capture final timing
7. Report: "✅ Cleanup Agent complete"
8. **If GitHub issue**: Post comment with brief summary

**Cleanup Task**:
```
Task({
  subagent_type: "cleanup",
  description: "Cleanup phase - finalization",
  prompt: `**Inputs**:
- Scout agent's output file: .agents/outputs/[SCOUT_FILENAME_FROM_AGENT_RETURN]
- Plan agent's output file: .agents/outputs/[PLAN_FILENAME_FROM_AGENT_RETURN]
- Build agent's output file: .agents/outputs/[BUILD_FILENAME_FROM_AGENT_RETURN]
- Test agent's output file: .agents/outputs/[TEST_FILENAME_FROM_AGENT_RETURN]
- **Timing data file**: .agents/timing/issue-[ISSUE_NUMBER]-timing.json
[If GitHub issue: - GitHub issue number: #[number]]

**Instructions**:
Follow your Cleanup Agent instructions to finalize workflow.

IMPORTANT - Include Timing Metrics:
Read the timing JSON file and include performance metrics in your completion report.

Detect future work needs, create specs for significant issues (>4 hours).
Create completion report in completion-docs/.
[If GitHub issue: Update issue with results and close if appropriate]
Git commit and push.

**Success**: Workflow documented with timing metrics, future work specs created, git committed, cleanup output file complete`
})
```

### Phase 6: Final Report

**Your Role**:
1. Read cleanup-output.md
2. Read timing metrics from $TIMING_FILE (if available)
3. Report to user:

```markdown
# 5-Agent Workflow Complete

## Status
✅ Scout → ✅ Plan → ✅ Build → ✅ Test → ✅ Cleanup

## ⏱️ Performance Metrics
- **Total Duration**: [calculated from workflow_start to workflow_end]
- **Scout**: [duration]
- **Plan**: [duration]
- **Build**: [duration]
- **Test**: [duration]
- **Cleanup**: [duration]

## What Was Accomplished
[From cleanup-output.md: summary]

## Files Changed
- Created: [count]
- Modified: [count]

## Testing
- Jest: [X/X tests passed]
- TypeScript Build: [✅/❌]

## Documentation
- Completion Report: `completion-docs/[YYYY-MM-DD]-[name].md`
- Timing Data: `.agents/timing/issue-[ISSUE_NUMBER]-timing.json`

## Future Work Detected
[If any issues created, list them]

## Git Status
- Commit: [hash]
- Pushed: ✅

## Next Steps
1. Review completion report
2. Test at http://localhost:3000
3. Review future work issues (if any)
4. Decide on next task

**Workflow Complete - Awaiting Your Review**
```

## Special Cases

### GitHub Issue Input

If user provides a GitHub issue (e.g., `/orchestrate gh issue #17` or `/orchestrate #17`):

1. **Extract issue number**: Parse issue number from input
2. **Pass to Scout**: Scout reads issue via `gh issue view #[number]`
3. **Pass to Cleanup**: Cleanup updates issue with results
4. **Cleanup closes issue**: Only if work is 100% complete and verified
5. **Create related issues**: For significant future work detected (>4 hours)
6. **Report in final output**: Note issue status and links

### Phased Work

If Plan agent detects work is too large and recommends phasing:

1. **Report to user**: "⚠️ Plan Agent recommends phasing this work"
2. **Show phases**: Display phase breakdown from plan-output.md
3. **Ask user**: "Proceed with Phase 1 only? (yes/no)"
4. **If yes**: Continue with Build/Test/Cleanup for Phase 1 only
5. **If no**: Stop and wait for user decision

### Blocker Scenarios

If any agent encounters a blocker:

1. **Report immediately**: "⚠️ [Agent] encountered blocker: [description]"
2. **Show blocker details**: From agent's output
3. **Continue if possible**: Other agents may still proceed
4. **Final report shows blockers**: Clearly documented in completion report

## GitHub Issue Progress Updates

When processing a GitHub issue (`/orchestrate gh issue #N`), post brief progress comments after each agent completes:

1. **🔍 Scout**: What was discovered about the issue (2-3 sentences)
2. **📋 Plan**: Number of tasks, estimated effort, key changes
3. **🔨 Build**: What was implemented, files created/modified, build status
4. **🧪 Test**: Test results, any fixes made
5. **🧹 Cleanup**: Completion report location, future work detected, commit info

## Critical Rules

1. **🚨 ORCHESTRATION ONLY - NO DIRECT WORK 🚨**:
   - You are a CONDUCTOR, not a performer
   - Your ONLY allowed tools during `/orchestrate` are: Task (to call agents) and Read (ONLY to read agent output files)
   - All investigation, implementation, testing, and documentation MUST be done by agents via the Task tool

2. **SEQUENTIAL EXECUTION**: Each agent must complete before next starts

3. **REPORT PROGRESS**: Update user on each agent's start/completion

4. **PASS CONTEXT**: Each agent gets exactly what it needs from previous agents

5. **DETECT FUTURE WORK**: Ensure Cleanup creates issues for significant items

6. **VERIFY OUTPUTS**: Check each agent created its output file before proceeding

7. **FINAL REPORT**: Always provide comprehensive summary at end

## Success Criteria

- ✅ All 5 agents executed successfully
- ✅ All output files created (.agents/outputs/)
- ✅ Completion report in completion-docs/
- ✅ Future work issues created (if found)
- ✅ GitHub issue updated with results (if provided)
- ✅ GitHub issue closed if appropriate (if provided and work complete)
- ✅ Git committed and pushed
- ✅ User receives clear final report
- ✅ Workflow stopped, awaiting user review

## Example Usage

```bash
# Bug fix from GitHub issue
/orchestrate gh issue #7
/orchestrate #7

# Bug fix from description
/orchestrate Fix type mismatch in src/services/inventory.ts causing query errors

# Feature from plain text
/orchestrate Add CSV export functionality for component inventory

# Multiple related items
/orchestrate Fix component quantities + Add bulk update + Update audit logging
```
