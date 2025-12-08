# Railway Configuration Files

This directory contains Railway-specific configuration files and helper scripts for deploying the Stock Portfolio Dashboard.

## Files

### `railway-services.yaml`
Documents the required services and their configuration for Railway deployment:
- Main application service
- PostgreSQL database
- Redis cache
- Resource requirements
- Environment variable mappings

### `setup-railway.sh`
Automated setup script that:
- Verifies Railway CLI installation
- Creates or links to Railway project
- Adds PostgreSQL and Redis services
- Generates secure secrets
- Configures environment variables
- Optionally deploys the application

**Usage:**
```bash
chmod +x .railway/setup-railway.sh
./.railway/setup-railway.sh
```

## Quick Start

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Run the setup script:
   ```bash
   ./.railway/setup-railway.sh
   ```

3. Follow the prompts to configure your deployment

## Manual Configuration

If you prefer manual setup, follow these steps:

1. **Initialize Railway project:**
   ```bash
   railway login
   railway init
   ```

2. **Add services:**
   ```bash
   railway add  # Select PostgreSQL
   railway add  # Select Redis
   ```

3. **Set environment variables:**
   ```bash
   # See ../.env.railway for complete list
   railway variables set NODE_ENV=production
   railway variables set BRANCA_SECRET="$(openssl rand -base64 32)"
   # ... etc
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

## Service Architecture

```
┌─────────────────────────────────────────┐
│        Railway Project                   │
│                                          │
│  ┌──────────────────┐                   │
│  │  Application     │                   │
│  │  (Node.js)       │                   │
│  │  Public ✓        │                   │
│  └────────┬─────────┘                   │
│           │                              │
│     ┌─────┴─────┐                       │
│     │           │                        │
│  ┌──▼────┐  ┌──▼────┐                  │
│  │ Postgres │ Redis │                   │
│  │ Private  │Private│                   │
│  └─────────┘ └──────┘                   │
└─────────────────────────────────────────┘
```

## Environment Variables

All required environment variables are documented in:
- `../.env.railway` - Railway-specific template
- `../.env.example` - General template
- `../claudedocs/RAILWAY_DEPLOYMENT.md` - Detailed guide

## Resources

- [Railway Documentation](https://docs.railway.app)
- [Deployment Guide](../claudedocs/RAILWAY_DEPLOYMENT.md)
- [Main Project README](../README.md)
