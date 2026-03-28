# TradeDesk Forex — Project Instructions

## System Context (MANDATORY)

Before implementing any feature, **read `CONTEXT.md`** at the project root. It contains the complete system reference: every page, API route, AI pipeline, database table, cron job, and deployment config. Understanding the full system prevents duplicate work and architectural conflicts.

## Feature Workflow (MANDATORY)

When the user asks to **add a feature**, **build something new**, or **implement functionality**, you MUST use the `/feature` skill before writing any code. This enforces a spec-first loop:

1. Generate a structured spec (Goal, What to Build, File Paths, Function Signatures, Database Schema, Technology Choices, Test Scenarios, Out of Scope, MEMORY.md Update, Acceptance Criteria)
2. Get explicit user approval
3. Only then implement

This applies to any request that involves creating new files, new API routes, new pages, new database tables, or new components. It does NOT apply to bug fixes, small tweaks, refactors, or questions.

## Deploy Workflow

Use the `/deploy` skill for the local → production pipeline:
1. `npm run build` must pass locally
2. Commit with descriptive message
3. Push to `origin master`
4. Railway auto-deploys from GitHub

## Build Verification

Every implementation must end with `npm run build` passing. No exceptions.
