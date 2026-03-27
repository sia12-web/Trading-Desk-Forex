# Setup
Create, link, and organize Railway projects, services, databases, and workspaces.

### List and discover
```bash
railway project list --json        # projects in current workspace
railway list --json                # all projects across workspaces with service metadata
railway whoami --json              # current user, workspace memberships
```

### Link to an existing project
```bash
railway link --project <project-id-or-name>
railway status --json              # confirm linked context
```

### Link to a specific service
```bash
railway service link <name>       # link directly by name
```

### Create a new project
```bash
railway init --name <project-name>
```

### Create a service
```bash
railway add --service <service-name>          # empty service
railway add --database postgres               # managed database
```

### Connect a database to a service
```bash
railway variable set DATABASE_URL='${{Postgres.DATABASE_URL}}' --service <app-service>
```

### Deploy from a template
```bash
railway deploy --template <template-code>
```
