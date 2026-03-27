# Configure
Change environments, variables, and domains.

### Environments
```bash
railway environment list --json
railway environment create --name <new-env>
```

### Variables
```bash
railway variable list --service <service> --environment <env> --json
railway variable set KEY=value --service <service> --environment <env>
railway variable delete KEY --service <service> --environment <env>
```

### Domains
```bash
railway domain list --service <service> --json
railway domain add --service <service> <domain-name>
railway domain remove --service <service> <domain-name>
```

### Target Port
```bash
railway environment edit --service-config <service> proxy.port <port>
```
