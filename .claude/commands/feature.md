# Feature Command - Create GitHub Issue

Automatically create comprehensive GitHub issue for new features with intelligent questions.

**Project**: Trevor Inventory - Next.js 14 (App Router) + Prisma ORM + PostgreSQL + NextAuth

## Feature Philosophy

**What is a Feature?**
- New functionality that adds value to the system
- User-facing capability that wasn't previously available
- May involve database changes, backend APIs, and frontend UI
- Should follow existing patterns in the codebase
- Most complex category requiring detailed planning

## Usage

```bash
# Interactive feature creation (with questions)
/feature

# Quick feature creation from description
/feature Add voice memo transcription with automatic task creation
```

## Interactive Feature Creation

When you call `/feature` without arguments, you'll be asked clarifying questions to create a comprehensive issue:

1. **What's the feature about?** - Brief summary
2. **Who benefits?** - User (Paul) or system automation
3. **What's the main action?** - What can users do?
4. **Why does it matter?** - Business value
5. **What data is involved?** - New tables, modifications, or just UI?
6. **Any dependencies?** - Other features that must complete first?

## Issue Creation Process

When you call `/feature`, this command will:

1. **Ask clarifying questions** (unless description provided)
2. **Create detailed GitHub issue** with:
   - **Title**: Feature name
   - **Label**: `enhancement` (automatically added)
   - **Body**: Comprehensive issue including user stories, requirements, and architecture notes
3. **Display confirmation** - Show the created issue URL

## GitHub Issue Format

Feature issues are the most comprehensive, including user stories and technical context:

```markdown
# <Feature name>

## Feature Description
<Purpose and value to users>

## User Stories

### Primary User Story
**As a** user
**I want to** <action>
**So that** <business value>

### Additional User Stories (if applicable)
**As a** <role>
**I want to** <action>
**So that** <business value>

## Requirements

### Functional Requirements
- [ ] <Specific capability needed>
- [ ] <Data to be captured/displayed>
- [ ] <Workflow or process>

### Non-Functional Requirements
- [ ] Performance: <Specific targets if applicable>
- [ ] Privacy: <Data handling requirements>
- [ ] Reliability: <Error handling, fallbacks>

## Technical Context

### Affected Areas
- **Database**: <New tables or migrations>
- **Backend**: <API routes, services>
- **Frontend**: <Pages, components, tables>
- **External APIs**: <External services if any>

### Related Features
<Any existing features this builds on or connects to>

### Data Involved
- **New Tables**: <List if applicable>
- **Modified Tables**: <List if applicable>
- **Relationships**: <How data connects>

### Dependencies
- **Prerequisites**: <Must complete first>
- **Blocks**: <What work this enables>

## Acceptance Criteria
- [ ] <Specific capability working>
- [ ] <User can perform action>
- [ ] <Data persists and displays correctly>
- [ ] <Proper authentication enforced>
- [ ] <All tests passing>

## Notes
- Estimated complexity: <Small/Medium/Large>
- May require phasing: <Yes/No>
- Design pattern to follow: <Similar feature reference>
```

## Efficient Issue Format

Include these to reduce implementation time by ~30%:
- **Exact file paths**: `src/services/inventory.ts`, `src/app/api/components/route.ts`
- **Line numbers**: Reference existing patterns with `line 72`
- **Example patterns**: `src/services/inventory.ts` for new services
- **Test scenarios**: Specific inputs and expected outputs

## Verification Checkpoint (Required)

Before submitting, verify these to prevent wasted planning time:
- **Last Verified Date**: When did you last confirm the referenced file paths/line numbers exist?
- **Pattern references still valid?**: Has the pattern file been refactored recently?
- **Similar feature exists?**: Is there a similar feature to use as a template?
- **Dependencies identified?**: Are all prerequisite features/tables already in place?

## Feature Complexity Guidelines

### Small Feature (4-8 hours)
- UI-only changes (new widget, display tweaks)
- Single table modifications (new column, validation)
- Simple calculations or filtering
- **Examples**: Add field to settings, new dashboard widget, simple API endpoint

### Medium Feature (8-16 hours)
- New skill implementation
- New API route with database integration
- Frontend + Backend + Database work
- **Examples**: New service, transaction flow, export integration

### Large Feature (16+ hours - should be phased)
- Complex workflows with multiple steps
- Multiple related resources
- Significant UI changes
- External API integrations
- **Examples**: Full inventory reconciliation, multi-location tracking, ERP integration

If you estimate more than 16 hours, the feature should be split into phases.

## Workflow

1. **Create Feature**: `/feature` or `/feature <description>`
2. **Answer Questions**: Clarify feature scope and details (if interactive)
3. **Issue Created**: GitHub issue appears with label `enhancement`
4. **Plan & Build**: Use `/orchestrate gh issue #N` to implement
5. **Complete**: Cleanup agent closes issue and commits

---

## Implementation

This command creates a GitHub issue with the `enhancement` label. The issue body is the most comprehensive, including user stories, requirements, technical context, and acceptance criteria.

When you provide a feature description, it will:
1. Extract your description as the issue title
2. Create a detailed issue body with user stories and technical context
3. Label it with `enhancement`
4. Return the issue URL

## Feature
$ARGV

When executed, this command will create an issue using:

```bash
gh issue create \
  --title "$ARGV" \
  --body "## Feature Description
$ARGV

## User Stories

### Primary User Story
**As a** user
**I want to** <action>
**So that** <business value>

### Additional User Stories (if applicable)
**As a** <role>
**I want to** <action>
**So that** <business value>

## Requirements

### Functional Requirements
- [ ] <Specific capability needed>
- [ ] <Data to be captured/displayed>
- [ ] <Workflow or process>

### Non-Functional Requirements
- [ ] Performance: <Specific targets if applicable>
- [ ] Privacy: <Data handling requirements>
- [ ] Reliability: <Error handling, fallbacks>

## Technical Context

### Affected Areas
- **Database**: <New tables or migrations>
- **Backend**: <API routes, services>
- **Frontend**: <Pages, components, tables>
- **External APIs**: <External services if any>

### Related Features
<Any existing features this builds on or connects to>

### Data Involved
- **New Tables**: <List if applicable>
- **Modified Tables**: <List if applicable>
- **Relationships**: <How data connects>

### Dependencies
- **Prerequisites**: <Must complete first>
- **Blocks**: <What work this enables>

## Acceptance Criteria
- [ ] <Specific capability working>
- [ ] <User can perform action>
- [ ] <Data persists and displays correctly>
- [ ] <Proper authentication enforced>
- [ ] <All tests passing>

## Verification Checkpoint
- [ ] **Last Verified**: <Date you confirmed pattern file paths/line numbers>
- [ ] **Pattern references verified**: Yes/No
- [ ] **Similar feature identified**: <Issue # or N/A>
- [ ] **Dependencies confirmed**: Yes/No

## Notes
- Estimated complexity: <Small/Medium/Large>
- May require phasing: <Yes/No>
- Design pattern to follow: <Similar feature reference>" \
  --label enhancement
```
