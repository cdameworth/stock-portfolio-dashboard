# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Railway Deployment

This project is deployed on [Railway](https://railway.app). No AWS infrastructure is used.

### Deployment Commands
```bash
# Deploy to Railway (from application/ directory)
cd application && railway up

# View deployment logs
railway logs

# Open deployed app in browser
railway open

# Link to existing Railway project
railway link
```

## Development Commands

All application commands should be run from the `application/` directory.

### Development Servers
```bash
# Main Express server with hot reload
cd application && npm run dev

# React development server (runs on port 5173, proxies API to :5000)
cd application && npm run dev:react

# Production build
cd application && npm run build:react
```

### Testing
```bash
# All tests
cd application && npm test

# Watch mode
cd application && npm run test:watch

# Specific test suites
cd application && npm run test:services      # Service layer tests
cd application && npm run test:integration   # API integration tests
cd application && npm run test:e2e          # End-to-end tests

# CI mode with coverage
cd application && npm run test:ci
```

### Code Quality
```bash
cd application && npm run lint          # Check linting
cd application && npm run lint:fix      # Auto-fix linting issues
cd application && npm run format        # Format with Prettier
cd application && npm run validate      # Run all checks (lint + format + tests)
```

### Database Operations
```bash
# Production migrations
cd application && npm run migrate

# Local development migrations
cd application && npm run migrate:dev

# Service health check
cd application && npm run health
```

### Local Docker Build
```bash
# Build image locally
cd application && docker build -t stock-portfolio-dashboard .

# Run locally with Docker
docker run -p 3000:3000 --env-file .env stock-portfolio-dashboard
```

## Architecture Overview

### Tech Stack
- **Backend**: Node.js/Express.js (`application/server.js`)
- **Frontend**: Hybrid architecture with two rendering strategies:
  1. Traditional server-rendered pages (Express views)
  2. Modern React components (Material-UI v7) built with Vite
- **Database**: PostgreSQL (Railway Postgres plugin)
- **Cache**: Redis (Railway Redis plugin)
- **Deployment**: Railway with automatic builds from Dockerfile
- **Observability**: OpenTelemetry → SigNoz Cloud (tracing.js)

### Critical Initialization Pattern
**IMPORTANT**: `tracing.js` MUST be loaded before any other modules. This is enforced in:
- `server.js` (line 7): `require('./tracing')`
- `package.json` scripts: `node -r ./tracing.js server.js`

Never import any modules before OpenTelemetry initialization or traces will be incomplete.

### Service Layer Architecture
All services extend `BaseService` which provides common logging and error handling patterns:

- **StockService**: Interfaces with external Stock Analytics API, implements circuit breaker pattern
- **PortfolioService**: User portfolio and investment management
- **AuthService**: Branca token-based authentication and session management
- **DatabaseService**: PostgreSQL connection pooling and query abstraction
- **AIPerformanceService**: Performance monitoring and AI metrics collection
- **RecommendationSyncService**: Background sync of stock recommendations
- **MetricsService**: Prometheus metrics for observability

There are also "improved" versions of some services (`improved-stock-service.js`, `improved-auth-service.js`, `improved-database-service.js`) - check `server.js` to see which version is currently active.

### Frontend Architecture - Hybrid Approach

**Two separate build systems running side-by-side:**

1. **Traditional Server-Rendered Pages**
   - Express views with embedded data
   - Static assets in `public/`
   - PostCSS build: `npm run build:css`
   - Webpack build: `npm run build:js`

2. **Modern React Components** (Material-UI v7)
   - Source: `src/react/`
   - Build output: `public/react-dist/`
   - Vite config: `vite.config.react.js`
   - Context-based state management: `contexts/AppContext.jsx`
   - Path aliases configured: `@components`, `@pages`, `@utils`, `@hooks`, `@theme`
   - Lazy loading pattern: `components/LazyLoader.jsx` + `pages/LazyPages.jsx`
   - Error boundaries: `components/ErrorBoundary.jsx`

**Dev server ports:**
- Express backend: 5000
- Vite React dev server: 5173 (proxies `/api` and `/health` to :5000)

### Middleware Pipeline (server.js)
Applied in order:
1. **Browser telemetry**: Extracts correlation headers, processes telemetry
2. **Security**: Helmet.js with CSP headers
3. **Rate limiting**: Express rate limiter
4. **CORS**: Configured for cross-origin requests
5. **Compression**: Response compression
6. **Request logging**: Express-winston integration
7. **Performance monitoring**: Custom middleware in `middleware/performance-monitor.js`
8. **Authentication**: Custom auth middleware in `middleware/auth.js`

### Environment Configuration

Railway automatically injects environment variables for connected services. Configure these in the Railway dashboard:

**Database (auto-injected by Railway Postgres plugin):**
- `DATABASE_URL` - Full PostgreSQL connection string
- Or individual variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

**Redis (auto-injected by Railway Redis plugin):**
- `REDIS_URL` - Full Redis connection string

**External APIs:**
- `STOCK_ANALYTICS_API_URL` - Stock Analytics Engine endpoint

**Authentication:**
- `BRANCA_SECRET` - 32-character secret for Branca tokens
- `SESSION_SECRET` - Session encryption key

**Observability:**
- `OTEL_EXPORTER_OTLP_ENDPOINT` - SigNoz Cloud endpoint
- `SIGNOZ_ACCESS_TOKEN` - SigNoz authentication token
- `OTEL_SERVICE_NAME`, `OTEL_SERVICE_VERSION`

**Optional Features:**
- `GOOGLE_AD_PUBLISHER_ID` - AdSense integration
- `EMAIL_PROVIDER` - Email service (ses, gmail, sendgrid)

### Railway Deployment Architecture
- **Platform**: Railway with automatic Git deployments
- **Build**: Dockerfile-based builds (Node.js 20 Alpine)
- **Database**: Railway Postgres plugin
- **Cache**: Railway Redis plugin
- **Networking**: Railway-managed domains and SSL
- **Monitoring**: Winston logging, Prometheus metrics, OpenTelemetry tracing

### Key Patterns

**Error Handling:**
- All services inherit from `BaseService` with standardized error logging
- Circuit breaker pattern for external API calls (StockService)
- Error boundaries for React components

**Caching Strategy:**
- Redis: API responses and session data
- Application: In-memory cache (node-cache)
- Browser: Cache headers for static resources

**Authentication:**
- Branca token-based authentication (encrypted tokens)
- Session management via AuthService
- Middleware protection: `middleware/auth.js`

**Observability:**
- OpenTelemetry auto-instrumentation for Node.js
- Browser telemetry correlation: `middleware/browser-telemetry.js`
- Business metrics tracking: `business-metrics.js`

**Testing:**
- Jest for unit and integration tests
- Organized by type: `tests/services/`, `tests/integration/`, `tests/e2e/`
- React Testing Library for component tests

## Project Structure

```
application/
├── server.js                    # Main Express application
├── tracing.js                   # OpenTelemetry initialization (MUST load first)
├── business-metrics.js          # Business metrics definitions
├── Dockerfile                   # Railway build configuration
├── railway.json                 # Railway deployment settings
├── services/                    # Service layer
│   ├── base-service.js         # Base class for all services
│   ├── *-service.js            # Individual services
│   └── improved-*-service.js   # Enhanced versions of some services
├── middleware/                  # Express middleware
│   ├── auth.js                 # Authentication middleware
│   ├── security.js             # Security headers
│   ├── performance-monitor.js  # Performance tracking
│   └── browser-telemetry.js    # Browser trace correlation
├── src/react/                   # React application
│   ├── main.jsx                # React entry point
│   ├── App.jsx                 # Root component
│   ├── components/             # Reusable components
│   ├── pages/                  # Page components
│   ├── contexts/               # React contexts (state management)
│   ├── theme/                  # Material-UI theme configuration
│   └── utils/                  # Utility functions
├── public/                      # Static assets
│   ├── react-dist/             # Built React bundles (Vite output)
│   ├── css/                    # Stylesheets
│   └── js/                     # Client-side JavaScript
├── tests/                       # Test suites
│   ├── services/               # Service layer tests
│   ├── integration/            # API integration tests
│   └── e2e/                    # End-to-end tests
├── scripts/                     # Utility scripts
├── vite.config.react.js        # Vite configuration for React
├── jest.config.js              # Jest test configuration
└── .eslintrc.js                # ESLint rules
```

## Important Notes

### Material-UI Version
This project uses Material-UI v7 (latest). Be aware of API differences from v5:
- Different prop types and component APIs
- New theme structure
- Updated styling patterns

### React Version
Uses React 19 - ensure compatibility when adding new libraries.

### Dual Rendering Strategy
The codebase intentionally maintains both server-rendered pages and React components. This is not technical debt - it's a migration strategy. New features should use React components in `src/react/`.

### Service Selection
Check `server.js` to see whether standard or "improved" service versions are active before making changes.

### OpenTelemetry Tracing
All instrumentation happens automatically via `@opentelemetry/auto-instrumentations-node`. Manual span creation is available via `@opentelemetry/api` if needed.

### Railway-Specific Notes
- Railway automatically detects and uses the `Dockerfile` in the `application/` directory
- Environment variables should be configured in the Railway dashboard
- Database and Redis connections are automatically injected when plugins are attached
- Custom domains can be configured in Railway project settings
