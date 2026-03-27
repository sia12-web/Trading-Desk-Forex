# Database Analysis
Perform database performance and structure analysis.

## Your Role
Identify root causes, correlate symptoms, and explain the "why" behind database problems.

## Context Resolution
Extract IDs from Railway URLs or use `railway status --json`.

### Single call for service and image config
```bash
scripts/railway-api.sh \
  'query getServiceAndConfig($serviceId: String!, $environmentId: String!) {
    service(id: $serviceId) { name }
    environment(id: $environmentId) {
      config(decryptVariables: false)
    }
  }' \
  '{"serviceId": "<SERVICE_ID>", "environmentId": "<ENV_ID>"}'
```

### Script selection
| Database Type | Script |
|---------------|--------|
| PostgreSQL | `scripts/analyze-postgres.py` |
| MySQL | `scripts/analyze-mysql.py` |
| Redis | `scripts/analyze-redis.py` |
| MongoDB | `scripts/analyze-mongo.py` |

(Scripts are available in the official Railway repository).

### Check collection status
Before interpreting any data, always verify the collection succeeded.
Check for infrastructure metrics (CPU, RAM, DISK) to identify performance bottlenecks.
Railway auto-scales vertically within the set limits.
