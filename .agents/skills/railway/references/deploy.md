# Deploy
Ship code or manage releases.

### Standard deploy
```bash
railway up --detach -m "<release summary>"
```

`--detach` returns immediately instead of streaming build logs. Without it, the deploy blocks execution until the build finishes. Always include `-m` with a release summary for auditability.

### Watch the build
```bash
railway up --ci -m "<release summary>"
```

### Targeted deploy
```bash
railway up --service <service> --environment <environment> --detach -m "<summary>"
```

### Redeploy and restart
```bash
railway redeploy --service <service>
railway restart --service <service>
```

### Remove latest deployment
```bash
railway deployment remove --latest --service <service>
```
