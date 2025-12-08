# Railway Configuration Files Summary

This document provides an overview of all Railway-related configuration files created for the Stock Portfolio Dashboard project.

## File Structure

```
stock-portfolio-dashboard/
├── railway.json                          # Main Railway configuration
├── .env.railway                          # Railway environment variables template
├── .railway/                             # Railway-specific directory
│   ├── README.md                         # Railway directory documentation
│   ├── railway-services.yaml             # Service architecture documentation
│   └── setup-railway.sh                  # Automated setup script
└── claudedocs/
    ├── RAILWAY_DEPLOYMENT.md             # Complete deployment guide
    └── RAILWAY_FILES_SUMMARY.md          # This file
```

## Core Configuration Files

### 1. `railway.json` (Project Root)

**Purpose**: Main Railway configuration file that defines build and deployment settings.

**Key Settings**:
- **Builder**: Dockerfile (uses `application/Dockerfile`)
- **Health Check**: `/health` endpoint with 100s timeout
- **Restart Policy**: On failure, max 10 retries

**Usage**: Automatically detected by Railway during deployment.

**Location**: `/railway.json`

---

### 2. `.env.railway` (Project Root)

**Purpose**: Template for environment variables needed for Railway deployment.

**Contains**:
- Application configuration (NODE_ENV, PORT)
- Database references (${{Postgres.DATABASE_URL}})
- Redis references (${{Redis.REDIS_URL}})
- Authentication secrets (BRANCA_SECRET, JWT_SECRET, SESSION_SECRET)
- External API configuration (STOCK_ANALYTICS_API_URL)
- Observability settings (OpenTelemetry, SigNoz)
- Optional features (advertising, email)

**Usage**: Reference when setting variables in Railway dashboard or CLI.

**Location**: `/.env.railway`

**Important**: This is a template file. Never commit actual secrets to Git.

---

## Helper Files

### 3. `.railway/setup-railway.sh`

**Purpose**: Automated setup script for Railway deployment.

**What It Does**:
1. ✅ Checks Railway CLI installation
2. ✅ Creates or links Railway project
3. ✅ Adds PostgreSQL service
4. ✅ Adds Redis service
5. ✅ Generates secure secrets (BRANCA, JWT, SESSION)
6. ✅ Sets environment variables
7. ✅ Optionally deploys the application

**Usage**:
```bash
chmod +x .railway/setup-railway.sh
./.railway/setup-railway.sh
```

**Location**: `/.railway/setup-railway.sh`

---

### 4. `.railway/railway-services.yaml`

**Purpose**: Documentation of service architecture and configuration.

**Defines**:
- **Application Service**: Resource requirements, environment variables
- **PostgreSQL Service**: Version, memory allocation
- **Redis Service**: Version, memory allocation
- **Dependencies**: Service startup order
- **Deployment Strategy**: Rolling deployment, zero downtime

**Usage**: Reference when configuring services in Railway dashboard.

**Location**: `/.railway/railway-services.yaml`

**Note**: This is a documentation file, not used directly by Railway.

---

### 5. `.railway/README.md`

**Purpose**: Quick reference guide for Railway configuration files.

**Contains**:
- File descriptions
- Quick start instructions
- Manual setup steps
- Service architecture diagram

**Location**: `/.railway/README.md`

---

## Documentation Files

### 6. `claudedocs/RAILWAY_DEPLOYMENT.md`

**Purpose**: Comprehensive deployment guide for Railway.

**Sections**:
1. **Prerequisites**: Requirements and account setup
2. **Quick Start**: Automated and manual setup options
3. **Manual Setup**: Step-by-step deployment instructions
4. **Environment Variables**: Complete variable reference
5. **Database Migrations**: How to run migrations
6. **Architecture**: Service diagram and configuration
7. **Monitoring & Logging**: Using Railway and SigNoz
8. **Scaling**: Horizontal and vertical scaling
9. **Cost Estimation**: Pricing and optimization
10. **Troubleshooting**: Common issues and solutions
11. **CI/CD Integration**: GitHub Actions setup
12. **Security Best Practices**: Production hardening

**Location**: `/claudedocs/RAILWAY_DEPLOYMENT.md`

---

### 7. `claudedocs/RAILWAY_FILES_SUMMARY.md`

**Purpose**: This file - overview of all Railway configuration files.

**Location**: `/claudedocs/RAILWAY_FILES_SUMMARY.md`

---

## Deployment Workflows

### Quick Deploy (Automated)

```bash
# 1. Run setup script
./.railway/setup-railway.sh

# 2. Script handles everything automatically
#    - Project setup
#    - Service creation
#    - Variable configuration
#    - Deployment
```

### Manual Deploy

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize project
railway init

# 4. Add services
railway add  # Select PostgreSQL
railway add  # Select Redis

# 5. Set environment variables
# See .env.railway for complete list
railway variables set NODE_ENV=production
railway variables set BRANCA_SECRET="$(openssl rand -base64 32)"
# ... etc

# 6. Deploy
railway up
```

### CI/CD Deploy

```yaml
# .github/workflows/railway-deploy.yml
name: Deploy to Railway
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install -g @railway/cli
      - run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## Environment Variable Reference

### Automatically Set by Railway

| Variable | Source | Description |
|----------|--------|-------------|
| `PORT` | Railway | Port to bind to |
| `RAILWAY_ENVIRONMENT_NAME` | Railway | Environment name |
| `RAILWAY_PUBLIC_DOMAIN` | Railway | Public domain |
| `DATABASE_URL` | Postgres service | Full PostgreSQL connection string |
| `PGHOST` | Postgres service | Database host |
| `PGPORT` | Postgres service | Database port |
| `PGDATABASE` | Postgres service | Database name |
| `PGUSER` | Postgres service | Database user |
| `PGPASSWORD` | Postgres service | Database password |
| `REDIS_URL` | Redis service | Full Redis connection string |
| `REDIS_HOST` | Redis service | Redis host |
| `REDIS_PORT` | Redis service | Redis port |

### Must Be Set Manually

| Variable | Generate With | Required |
|----------|---------------|----------|
| `BRANCA_SECRET` | `openssl rand -base64 32` | ✅ Yes |
| `JWT_SECRET` | `openssl rand -hex 64` | ✅ Yes |
| `SESSION_SECRET` | `openssl rand -hex 64` | ✅ Yes |
| `STOCK_ANALYTICS_API_URL` | Your API endpoint | ✅ Yes |
| `SIGNOZ_ACCESS_TOKEN` | SigNoz dashboard | ⚠️ Optional |
| `GOOGLE_AD_PUBLISHER_ID` | AdSense | ⚠️ Optional |

## Service Architecture

```
┌───────────────────────────────────────────────────┐
│              Railway Project                       │
│                                                    │
│  ┌──────────────────────────────────────────┐    │
│  │  Application Service                      │    │
│  │  ┌────────────────────────────────────┐  │    │
│  │  │ Node.js/Express                    │  │    │
│  │  │ - Dockerfile build                 │  │    │
│  │  │ - Health check: /health            │  │    │
│  │  │ - Public domain: ✓                 │  │    │
│  │  │ - Resources: 2GB RAM, 1 vCPU       │  │    │
│  │  └────────────────────────────────────┘  │    │
│  └──────────────┬────────────────────────────┘    │
│                 │                                  │
│        ┌────────┴────────┐                        │
│        │                 │                         │
│  ┌─────▼──────┐   ┌─────▼──────┐                 │
│  │ PostgreSQL │   │   Redis    │                  │
│  │    16      │   │     7      │                  │
│  │            │   │            │                  │
│  │ Private ✓  │   │ Private ✓  │                  │
│  │ 1GB RAM    │   │ 512MB RAM  │                  │
│  │ Auto backup│   │ Persistent │                  │
│  └────────────┘   └────────────┘                  │
│                                                    │
└───────────────────────────────────────────────────┘
```

## Resource Requirements

### Minimum (Development/Testing)

- **Application**: 512MB RAM, 0.5 vCPU
- **PostgreSQL**: 256MB RAM
- **Redis**: 256MB RAM
- **Estimated Cost**: ~$5-10/month

### Recommended (Production)

- **Application**: 2GB RAM, 1 vCPU
- **PostgreSQL**: 1GB RAM
- **Redis**: 512MB RAM
- **Estimated Cost**: ~$15-25/month

### Scaled (High Traffic)

- **Application**: 4GB RAM, 2 vCPU (2-3 replicas)
- **PostgreSQL**: 2GB RAM
- **Redis**: 1GB RAM
- **Estimated Cost**: ~$50-75/month

## Security Checklist

- [ ] Never commit `.env` files with actual secrets
- [ ] Generate strong secrets using `openssl`
- [ ] Rotate secrets regularly (every 90 days)
- [ ] Use Railway's private networking for databases
- [ ] Enable HTTPS only (automatic on Railway)
- [ ] Review environment variables before deployment
- [ ] Enable 2FA on Railway account
- [ ] Set up monitoring and alerts
- [ ] Use Railway teams for access control
- [ ] Regularly review Railway audit logs

## Troubleshooting Quick Reference

| Issue | Check | Solution |
|-------|-------|----------|
| Build fails | Dockerfile valid? | Test locally: `docker build -t test -f application/Dockerfile .` |
| Health check fails | `/health` working? | Test locally: `curl http://localhost:5000/health` |
| DB connection fails | `DATABASE_URL` set? | Verify: `railway variables` |
| App crashes | Memory usage | Increase RAM in Railway dashboard |
| Slow performance | Redis working? | Check `REDIS_URL` connection |
| Missing env vars | Variables set? | Run: `railway variables` |

## Next Steps After Deployment

1. ✅ Verify deployment: `railway logs`
2. ✅ Check health: `curl https://your-app.railway.app/health`
3. ✅ Run migrations: `railway run npm run migrate`
4. ✅ Test API endpoints
5. ✅ Configure custom domain (optional)
6. ✅ Set up monitoring alerts
7. ✅ Configure CI/CD pipeline
8. ✅ Monitor costs and optimize resources

## Additional Resources

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Railway Templates**: https://railway.app/templates
- **Deployment Guide**: `claudedocs/RAILWAY_DEPLOYMENT.md`
- **Project README**: `README.md`
- **CLAUDE.md**: Project-specific Claude Code instructions

## Support

For issues or questions:
1. Check `claudedocs/RAILWAY_DEPLOYMENT.md` troubleshooting section
2. Review Railway documentation
3. Ask in Railway Discord
4. Create GitHub issue in this repository
5. Check Railway status: https://status.railway.app
