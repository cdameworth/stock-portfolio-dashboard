# Railway Quick Reference Card

One-page reference for deploying Stock Portfolio Dashboard to Railway.

## 🚀 Quick Deploy

```bash
# Automated setup (recommended)
./.railway/setup-railway.sh

# Manual setup
railway login
railway init
railway add  # Select PostgreSQL
railway add  # Select Redis
railway up
```

## 📝 Essential Commands

```bash
# Deploy
railway up                    # Deploy application
railway up --detach           # Deploy in background

# Logs
railway logs                  # Stream logs
railway logs --filter ERROR   # Filter logs

# Variables
railway variables             # List all variables
railway variables set KEY=val # Set variable

# Database
railway run npm run migrate   # Run migrations
railway connect postgres      # Connect to PostgreSQL

# Management
railway status                # Service status
railway open                  # Open dashboard
railway domain                # Get public URL
```

## 🔧 Required Environment Variables

```bash
# Generate secrets
BRANCA_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -hex 64)
SESSION_SECRET=$(openssl rand -hex 64)

# Set in Railway
railway variables set NODE_ENV=production
railway variables set BRANCA_SECRET="$BRANCA_SECRET"
railway variables set JWT_SECRET="$JWT_SECRET"
railway variables set SESSION_SECRET="$SESSION_SECRET"
railway variables set STOCK_ANALYTICS_API_URL="your-api-url"
```

## 🏗️ Service Architecture

```
Application (Node.js) → Public
    ├── PostgreSQL 16 → Private
    └── Redis 7       → Private
```

## 📊 Resource Defaults

| Service | RAM | CPU | Cost/Month |
|---------|-----|-----|------------|
| App | 2GB | 1 vCPU | ~$10-15 |
| PostgreSQL | 1GB | - | ~$5 |
| Redis | 512MB | - | ~$2-3 |

## 🔍 Troubleshooting

```bash
# Build fails
docker build -t test -f application/Dockerfile .

# Health check fails
curl http://localhost:5000/health

# Check variables
railway variables

# View detailed logs
railway logs --json

# Restart service
railway up --detach
```

## 📚 Documentation

- Full guide: `claudedocs/RAILWAY_DEPLOYMENT.md`
- Files summary: `claudedocs/RAILWAY_FILES_SUMMARY.md`
- Railway docs: https://docs.railway.app

## 🆘 Quick Help

| Issue | Fix |
|-------|-----|
| Can't login | `railway login` |
| Build fails | Check Dockerfile |
| DB error | Verify `DATABASE_URL` |
| Missing vars | `railway variables` |
| Out of memory | Increase RAM in dashboard |

## 🔐 Security Checklist

- [ ] Secrets generated with `openssl`
- [ ] No `.env` files in Git
- [ ] 2FA enabled on Railway
- [ ] Variables set in Railway (not in code)
- [ ] HTTPS only (automatic)
- [ ] Databases on private network

## 💰 Cost Optimization

- Start with minimum resources
- Monitor usage weekly
- Use caching effectively
- Optimize database queries
- Enable sleep for dev environments

---

**Need more help?** See full deployment guide in `claudedocs/RAILWAY_DEPLOYMENT.md`
