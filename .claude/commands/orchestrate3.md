---
command: "/orchestrate3"
category: "Project Orchestration"
purpose: "Execute streamlined 3-agent workflow (Scout-and-Plan -> Build -> Test-and-Cleanup)"
---

# Orchestrate3 Command - 3-Agent Workflow

Execute the streamlined 3-agent workflow for implementing features, fixing bugs, or completing chores. This command orchestrates all agents sequentially without doing any work itself.

**Workflow**: Scout-and-Plan -> Build -> Test-and-Cleanup

**Project**: Trevor Inventory - Next.js 14 (App Router) + Prisma ORM + PostgreSQL + NextAuth

**Project Root**: `/home/pbrown/SkuInventory`

## ⚠️ CRITICAL: ORCHESTRATION ONLY ⚠️

**WHEN THE USER TYPES `/orchestrate3`, YOU ARE A CONDUCTOR, NOT A PERFORMER.**

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

**IF YOU CATCH YOURSELF USING Read, Write, Edit, Grep, Glob, or Bash tools directly during `/orchestrate3`, YOU ARE DOING IT WRONG. STOP IMMEDIATELY AND DELEGATE TO AN AGENT.**

Your ONLY job is to call agents via the Task tool and report their results. Nothing more.

## 🚨 CRITICAL: PRODUCTION DATABASE PROTECTION 🚨

**THIS WORKFLOW PROTECTS PRODUCTION DATA**

- ✅ **Pre-Workflow**: Backup production database to `.backups/`
- ✅ **Pre-Workflow**: Reseed test database from backup
- ✅ **Post-Workflow**: Verify production record counts unchanged
- ✅ **All agents**: Work on test environment ONLY
- ❌ **Production**: NEVER modified by any agent

### Database Targeting

| Container | Port | Database | Used By |
|-----------|------|----------|---------|
| inventory-db-prod | 4546 | inventory | Production (PROTECTED) |
| inventory-db-test | 2346 | inventory_test | Agents (DISPOSABLE) |

### Pre-Workflow: Database Backup (MANDATORY)

**Purpose**: Preserve production state and capture baseline record counts

**Your Role**:
1. Report to user: "💾 Creating production database backup..."

2. Execute backup script:
   ```bash
   cd /home/pbrown/SkuInventory
   BACKUP_OUTPUT=$(bash scripts/backup-production.sh "$ISSUE_NUMBER" 2>&1)
   echo "$BACKUP_OUTPUT"

   # Extract baseline counts for post-workflow verification
   BASELINE_COMPONENTS=$(echo "$BACKUP_OUTPUT" | grep "COMPONENT_COUNT=" | cut -d= -f2)
   BASELINE_SKUS=$(echo "$BACKUP_OUTPUT" | grep "SKU_COUNT=" | cut -d= -f2)
   BASELINE_TRANSACTIONS=$(echo "$BACKUP_OUTPUT" | grep "TRANSACTION_COUNT=" | cut -d= -f2)
   ```

3. Report to user:
   ```
   ✅ Production backup complete
      Components: [count]
      SKUs: [count]
      Transactions: [count]
   ```

**Safety Rule**: If backup fails, STOP and report error. Do NOT proceed with workflow.

### Pre-Workflow: Test Database Reseed (MANDATORY)

**Purpose**: Ensure test environment has current data from production

**Your Role**:
1. Report to user: "🔄 Reseeding test database..."

2. Execute reseed script:
   ```bash
   bash scripts/reseed-test-database.sh --force --issue "$ISSUE_NUMBER"
   ```

3. Report to user:
   ```
   ✅ Test database ready
      Database: inventory_test (port 2346)
      Access: http://172.16.20.50:2345
   ```

**Safety Rules**:
- If reseed fails with exit code 99 (catastrophic: no tables), STOP IMMEDIATELY
- The script will post a comment to the GitHub issue explaining the failure
- Do NOT proceed until the empty database is investigated

### Post-Workflow: Production Integrity Verification (MANDATORY)

**After Test-and-Cleanup agent completes, BEFORE final report**:

1. Report to user: "🔍 Verifying production database integrity..."

2. Execute verification:
   ```bash
   bash scripts/verify-production-integrity.sh "$BASELINE_COMPONENTS" "$BASELINE_SKUS" "$BASELINE_TRANSACTIONS"
   ```

3. **If verification PASSES**:
   ```
   ✅ Production database integrity verified
      No data was modified during orchestrate3 cycle
   ```

4. **If verification FAILS**:
   ```
   ❌ CRITICAL: Production database may have been modified!
      DO NOT commit or push until investigated.

   [Show specific discrepancies]
   ```

   **STOP workflow immediately** - do not proceed to final report or git operations.

## Usage

```
/orchestrate3 [input]
```

**Input can be:**
- Plain text description: `/orchestrate3 Add dark mode toggle to settings`
- Github issue: `/orchestrate3 gh issue #17`
- Bug description: `/orchestrate3 Fix null pointer in prioritizer`
- Multiple items: `/orchestrate3 Implement OAuth2 + Add user management`

## Workflow Process

### Input Parsing: Extract Issue Number

**Purpose**: Extract GitHub issue number for backup naming and tracking

**Your Role**:
1. Parse user input for issue number patterns:
   - GitHub URL: `https://github.com/user/trevor-inventory/issues/7` → Extract `7`
   - Issue reference: `/orchestrate3 #7` → Extract `7`
   - Issue command: `/orchestrate3 gh issue #7` → Extract `7`
   - Plain text: `/orchestrate3 Add dark mode` → No issue number (use timestamp)

2. Set ISSUE_NUMBER variable:
   ```bash
   # If issue number found:
   ISSUE_NUMBER=7

   # If no issue number:
   ISSUE_NUMBER=$(date +%s)  # Unix timestamp as fallback
   ```

3. Report to user:
   - If GitHub issue: "📋 Processing GitHub Issue #7 (3-agent workflow)"
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
  "workflow": "3-agent",
  "workflow_start": "$WORKFLOW_START"
}
EOF
   ```

2. Report to user: "⏱️ Timing metrics initialized for Issue #$ISSUE_NUMBER (3-agent workflow)"

### Phase 1: Scout-and-Plan Agent

**Purpose**: Investigation, analysis, and detailed implementation planning (combined)

**Your Role**:
1. Return to project root directory:
   ```bash
   cd /home/pbrown/SkuInventory
   ```

2. Capture start timestamp:
   ```bash
   SCOUT_PLAN_START=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
   echo "⏱️ Scout-and-Plan Agent starting at $SCOUT_PLAN_START"
   ```

3. Call Scout-and-Plan agent directly
4. Pass input exactly as provided by user
5. Report: "🔍📋 Scout-and-Plan Agent starting..."
6. Wait for Scout-and-Plan agent to complete
7. **Extract AGENT_RETURN**: Agent will end with `AGENT_RETURN: plan-[ISSUE_NUMBER]-[MMDDYY]` - save this filename

8. Capture end timestamp and save timing
9. Report: "✅ Scout-and-Plan Agent complete"
10. **If GitHub issue**: Post comment with brief summary and filename

**Scout-and-Plan Task**:
```
Task({
  subagent_type: "scout-and-plan",
  description: "Scout-and-Plan phase - investigation and planning",
  prompt: `**Input**: [pass user's input here]

**Instructions**:
Follow your Scout-and-Plan Agent instructions to investigate and create detailed implementation plan.

**Success**: Plan output file created with complete investigation summary and implementation roadmap`
})
```

### Phase 2: Build Agent

**Purpose**: Execute implementation

**Your Role**:
1. Use Scout-and-Plan's AGENT_RETURN filename (from Phase 1)
2. Capture start timestamp:
   ```bash
   BUILD_START=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
   echo "⏱️ Build Agent starting at $BUILD_START"
   ```
3. Call Build agent via Task tool
4. Report: "🔨 Build Agent starting..."
5. Wait for Build agent to complete
6. **Extract AGENT_RETURN**: Build will end with `AGENT_RETURN: build-[ISSUE_NUMBER]-[MMDDYY]` - save this filename
7. Capture end timestamp and save timing
8. Report: "✅ Build Agent complete"
9. **If GitHub issue**: Post comment with brief summary

**Build Task**:
```
Task({
  subagent_type: "build",
  description: "Build phase - implementation",
  prompt: `**Input**: Read the Scout-and-Plan agent's output file: .agents/outputs/[PLAN_FILENAME_FROM_AGENT_RETURN]

**Instructions**:
Follow your Build Agent instructions to execute implementation.
Execute subtasks in order, validate each subtask, fix all warnings.

**Success**: All code created, build output file complete, ready for testing`
})
```

### Phase 3: Test-and-Cleanup Agent

**Purpose**: Validate, fix issues, document completion, commit and push (combined)

**Your Role**:
1. Use Build's AGENT_RETURN filename (from Phase 2)
2. Use Scout-and-Plan's AGENT_RETURN filename (from Phase 1)
3. Capture start timestamp:
   ```bash
   TEST_CLEANUP_START=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
   echo "⏱️ Test-and-Cleanup Agent starting at $TEST_CLEANUP_START"
   ```
4. Call Test-and-Cleanup agent via Task tool
5. Report: "🧪🧹 Test-and-Cleanup Agent starting..."
6. Wait for Test-and-Cleanup agent to complete
7. **Extract AGENT_RETURN**: Agent will end with `AGENT_RETURN: cleanup-[ISSUE_NUMBER]-[MMDDYY]` - save this filename
8. Capture end timestamp and save final timing
9. Report: "✅ Test-and-Cleanup Agent complete"
10. **If GitHub issue**: Post comment with brief summary

**Test-and-Cleanup Task**:
```
Task({
  subagent_type: "test-and-cleanup",
  description: "Test-and-Cleanup phase - validation and finalization",
  prompt: `**Inputs**:
- Build agent's output file: .agents/outputs/[BUILD_FILENAME_FROM_AGENT_RETURN]
- Plan agent's output file: .agents/outputs/[PLAN_FILENAME_FROM_AGENT_RETURN]
- **Timing data file**: .agents/timing/issue-[ISSUE_NUMBER]-timing.json
[If GitHub issue: - GitHub issue number: #[number]]

**Instructions**:
Follow your Test-and-Cleanup Agent instructions to validate and finalize workflow.

Resolve blockers first, run automated validation, fix all warnings.
Detect future work needs, create specs for significant issues (>4 hours).
Create completion report in completion-docs/.
[If GitHub issue: Update issue with results and close if appropriate]
Git commit and push.

**Success**: All tests passing, zero warnings, workflow documented with timing metrics, future work specs created, git committed, cleanup output file complete`
})
```

### Phase 4: Final Report

**Your Role**:
1. Read cleanup output file
2. Read timing metrics from $TIMING_FILE (if available)
3. Report to user:

```markdown
# 3-Agent Workflow Complete

## Status
✅ Scout-and-Plan → ✅ Build → ✅ Test-and-Cleanup

## ⏱️ Performance Metrics
- **Total Duration**: [calculated from workflow_start to workflow_end]
- **Scout-and-Plan**: [duration]
- **Build**: [duration]
- **Test-and-Cleanup**: [duration]

## What Was Accomplished
[From cleanup output: summary]

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
2. Test at http://172.16.20.50:4545
3. Review future work issues (if any)
4. Decide on next task

**Workflow Complete - Awaiting Your Review**
```

## Special Cases

### GitHub Issue Input

If user provides a GitHub issue (e.g., `/orchestrate3 gh issue #17` or `/orchestrate3 #17`):

1. **Extract issue number**: Parse issue number from input
2. **Pass to Scout-and-Plan**: Agent reads issue via `gh issue view #[number]`
3. **Pass to Test-and-Cleanup**: Agent updates issue with results
4. **Test-and-Cleanup closes issue**: Only if work is 100% complete and verified
5. **Create related issues**: For significant future work detected (>4 hours)
6. **Report in final output**: Note issue status and links

### Phased Work

If Scout-and-Plan agent detects work is too large and recommends phasing:

1. **Report to user**: "⚠️ Scout-and-Plan Agent recommends phasing this work"
2. **Show phases**: Display phase breakdown from plan output
3. **Ask user**: "Proceed with Phase 1 only? (yes/no)"
4. **If yes**: Continue with Build/Test-and-Cleanup for Phase 1 only
5. **If no**: Stop and wait for user decision

### Blocker Scenarios

If any agent encounters a blocker:

1. **Report immediately**: "⚠️ [Agent] encountered blocker: [description]"
2. **Show blocker details**: From agent's output
3. **Continue if possible**: Other agents may still proceed
4. **Final report shows blockers**: Clearly documented in completion report

## GitHub Issue Progress Updates

When processing a GitHub issue (`/orchestrate3 gh issue #N`), post brief progress comments after each agent completes:

1. **🔍📋 Scout-and-Plan**: What was discovered and planned (3-4 sentences)
2. **🔨 Build**: What was implemented, files created/modified, build status
3. **🧪🧹 Test-and-Cleanup**: Test results, fixes made, completion report location, commit info

## Critical Rules

1. **🚨 ORCHESTRATION ONLY - NO DIRECT WORK 🚨**:
   - You are a CONDUCTOR, not a performer
   - Your ONLY allowed tools during `/orchestrate3` are: Task (to call agents) and Read (ONLY to read agent output files)
   - All investigation, implementation, testing, and documentation MUST be done by agents via the Task tool

2. **SEQUENTIAL EXECUTION**: Each agent must complete before next starts

3. **REPORT PROGRESS**: Update user on each agent's start/completion

4. **PASS CONTEXT**: Each agent gets exactly what it needs from previous agents

5. **DETECT FUTURE WORK**: Ensure Test-and-Cleanup creates issues for significant items

6. **VERIFY OUTPUTS**: Check each agent created its output file before proceeding

7. **FINAL REPORT**: Always provide comprehensive summary at end

## Success Criteria

- ✅ All 3 agents executed successfully
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
/orchestrate3 gh issue #7
/orchestrate3 #7

# Bug fix from description
/orchestrate3 Fix type mismatch in src/services/inventory.ts causing query errors

# Feature from plain text
/orchestrate3 Add CSV export functionality for component inventory

# Multiple related items
/orchestrate3 Fix component quantities + Add bulk update + Update audit logging
```

## Comparison: 3-Agent vs 5-Agent Workflow

| Aspect | 3-Agent (orchestrate3) | 5-Agent (orchestrate5) |
|--------|------------------------|------------------------|
| Agents | Scout-and-Plan, Build, Test-and-Cleanup | Scout, Plan, Build, Test, Cleanup |
| Handoffs | 2 | 4 |
| Output files | 2 (plan, cleanup) | 4 (scout, plan, build, test, cleanup) |
| Best for | Simpler projects, faster iteration | Complex projects needing detailed audit trail |
