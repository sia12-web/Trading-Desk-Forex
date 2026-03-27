# Operate
Check health, logs, and metrics.

### Status
```bash
railway status --json
railway project list --json
```

### Logs
```bash
railway logs --service <service> --lines 200 --json              # runtime logs
railway logs --service <service> --build --lines 200 --json      # build logs
railway logs --latest --lines 200 --json                         # latest deployment
```

### Metrics
Resource usage metrics are available via GraphQL (using `scripts/railway-api.sh`).

### Failure triage
- **Build failures**: Check `railway logs --build`.
- **Runtime failures**: Check `railway logs`.
- **Recovery**: Use `railway restart` or `railway redeploy`.
