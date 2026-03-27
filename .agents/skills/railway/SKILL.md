---
name: use-railway
description: >
  Operate Railway infrastructure: create projects, provision services and
  databases, manage object storage buckets, deploy code, configure environments
  and variables, manage domains, troubleshoot failures, check status and metrics,
  and query Railway docs. Use this skill whenever the user mentions Railway,
  deployments, services, environments, buckets, object storage, build failures,
  or infrastructure operations, even if they don't say "Railway" explicitly.
allowed-tools: Bash(railway:*), Bash(which:*), Bash(command:*), Bash(npm:*), Bash(npx:*), Bash(curl:*), Bash(python3:*)
---

# Use Railway

## Railway resource model
Railway organizes infrastructure in a hierarchy:

- **Workspace** is the billing and team scope. A user belongs to one or more workspaces.
- **Project** is a collection of services under one workspace. It maps to one deployable unit of work.
- **Environment** is an isolated configuration plane inside a project (for example, `production`, `staging`). Each environment has its own variables, config, and deployment history.
- **Service** is a single deployable unit inside a project. It can be an app from a repo, a Docker image, or a managed database.
- **Bucket** is an S3-compatible object storage resource inside a project. Buckets are created at the project level and deployed to environments. Each bucket has credentials (endpoint, access key, secret key) for S3-compatible access.
- **Deployment** is a point-in-time release of a service in an environment. It has build logs, runtime logs, and a status lifecycle.

Most CLI commands operate on the linked project/environment/service context. Use `railway status --json` to see the context, and `--project`, `--environment`, `--service` flags to override.

## Parsing Railway URLs
Users often paste Railway dashboard URLs. Extract IDs before doing anything else:

```
https://railway.com/project/<PROJECT_ID>/service/<SERVICE_ID>?environmentId=<ENV_ID>
https://railway.com/project/<PROJECT_ID>/service/<SERVICE_ID>
```

The URL always contains `projectId` and `serviceId`. It may contain `environmentId` as a query parameter. If the environment ID is missing and the user specifies an environment by name (e.g., "production"), resolve it:

```bash
scripts/railway-api.sh \
  'query getProject($id: String!) {
    project(id: $id) {
      environments { edges { node { id name } } }
    }
  }' \
  '{"id": "<PROJECT_ID>"}'
```

Match the environment name (case-insensitive) to get the `environmentId`.

**Prefer passing explicit IDs** to CLI commands (`--project`, `--environment`, `--service`) and scripts (`--project-id`, `--environment-id`, `--service-id`) instead of running `railway link`. This avoids modifying global state and is faster.

## Preflight
Before any mutation, verify context:

```bash
command -v railway                # CLI installed
railway whoami --json             # authenticated
railway --version                 # check CLI version
```

**Context resolution — URL IDs always win:**
- If the user provides a Railway URL, extract IDs from it. Do NOT run `railway status --json` — it returns the locally linked project, which is usually unrelated.
- If no URL is given, fall back to `railway status --json` for the linked project/environment/service.

If the CLI is missing, guide the user to install it.

```bash
bash <(curl -fsSL cli.new) # Shell script (macOS, Linux, Windows via WSL)
brew install railway # Homebrew (macOS)
npm i -g @railway/cli # npm (macOS, Linux, Windows). Requires Node.js version 16 or higher.
```

If not authenticated, run `railway login`. If not linked and no URL was provided, run `railway link --project <id-or-name>`.

If a command is not recognized (for example, `railway environment edit`), the CLI may be outdated. Upgrade with:

```bash
railway upgrade
```

## Common quick operations
These are frequent enough to handle without loading a reference:

```bash
railway status --json                                    # current context
railway whoami --json                                    # auth and workspace info
railway project list --json                              # list projects
railway service status --all --json                      # all services in current context
railway variable list --service <svc> --json             # list variables
railway variable set KEY=value --service <svc>           # set a variable
railway logs --service <svc> --lines 200 --json          # recent logs
railway up --detach -m "<summary>"                       # deploy current directory
railway bucket list --json                               # list buckets in current environment
railway bucket info --bucket <name> --json               # bucket storage and object count
railway bucket credentials --bucket <name> --json        # S3-compatible credentials
```

## Routing
For anything beyond quick operations, load the reference that matches the user's intent. Load only what you need, one reference is usually enough, two at most.

| Intent | Reference | Use for |
|---|---|---|
| Analyze a database | [analyze-db.md](references/analyze-db.md) | Database introspection and performance analysis |
| Create or connect resources | [setup.md](references/setup.md) | Projects, services, databases, buckets, templates, workspaces |
| Ship code or manage releases | [deploy.md](references/deploy.md) | Deploy, redeploy, restart, build config, monorepo, Dockerfile |
| Change configuration | [configure.md](references/configure.md) | Environments, variables, config patches, domains, networking |
| Check health or debug failures | [operate.md](references/operate.md) | Status, logs, metrics, build/runtime triage, recovery |
| Request from API, docs, or community | [request.md](references/request.md) | Railway GraphQL API queries/mutations, metrics queries |

## Execution rules
1. Prefer Railway CLI. Fall back to `scripts/railway-api.sh` for operations the CLI doesn't expose.
2. Use `--json` output where available for reliable parsing.
3. Resolve context before mutation. Know which project, environment, and service you're acting on.
4. For destructive actions (delete service, remove deployment, drop database), confirm intent and state impact before executing.
5. After mutations, verify the result with a read-back command.
