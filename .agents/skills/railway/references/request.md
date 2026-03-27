# Request
Request information from the Railway GraphQL API.

All GraphQL operations use the API helper script, which handles authentication automatically:

```bash
scripts/railway-api.sh '<query>' '<variables-json>'
```

The script reads the API token from `~/.railway/config.json` and sends requests to `https://backboard.railway.com/graphql/v2`.

For the full API schema, see: https://docs.railway.com/api/llms-docs.md

### Example: Update Project
```bash
scripts/railway-api.sh \
  'mutation updateProject($id: String!, $input: ProjectUpdateInput!) {
    projectUpdate(id: $id, input: $input) { id name isPublic prDeploys botPrEnvironments }
  }' \
  '{"id":"<project-id>","input":{"name":"new-name","prDeploys":true}}'
```

### Example: Template Search
```bash
scripts/railway-api.sh \
  'query templates($query: String!) {
    templates(query: $query) { id name code }
  }' \
  '{"query": "postgres"}'
```
