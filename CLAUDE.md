# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AWS Configuration
- Use AWS profile `stock-portfolio-admin` for all CLI commands
- Default region: `us-east-1`
- ECR repository: `558824710822.dkr.ecr.us-east-1.amazonaws.com/stock-portfolio-dashboard`

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

### Container Operations
```bash
# Build ARM64 image for Fargate
docker buildx build --platform linux/arm64 -t stock-portfolio-dashboard:v3-arm64 .

# Tag and push to ECR
docker tag stock-portfolio-dashboard:v3-arm64 558824710822.dkr.ecr.us-east-1.amazonaws.com/stock-portfolio-dashboard:v3-arm64
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 558824710822.dkr.ecr.us-east-1.amazonaws.com
docker push 558824710822.dkr.ecr.us-east-1.amazonaws.com/stock-portfolio-dashboard:v3-arm64
```

### Infrastructure Operations
```bash
# From infrastructure/ directory
cd infrastructure
terraform init
terraform plan
terraform apply
terraform output    # View infrastructure outputs
```

## Architecture Overview

### Tech Stack
- **Backend**: Node.js/Express.js (`application/server.js`)
- **Frontend**: Hybrid architecture with two rendering strategies:
  1. Traditional server-rendered pages (Express views)
  2. Modern React components (Material-UI v7) built with Vite
- **Database**: PostgreSQL (RDS Aurora in production)
- **Cache**: Redis (ElastiCache in production)
- **Infrastructure**: AWS ECS Fargate ARM64 with Terraform
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
See `.env.example` for full list. Critical variables:

**Database:**
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

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

### Deployment Architecture
- **Production**: ECS Fargate ARM64 tasks with Application Load Balancer
- **Container platform**: ARM64 architecture for cost efficiency
- **Infrastructure**: Terraform-managed (`infrastructure/*.tf`)
- **Monitoring**: Winston logging, Prometheus metrics, OpenTelemetry tracing
- **Caching**: Multi-layer (Redis, application-level, browser, CDN via CloudFront)

### Key Patterns

**Error Handling:**
- All services inherit from `BaseService` with standardized error logging
- Circuit breaker pattern for external API calls (StockService)
- Error boundaries for React components

**Caching Strategy:**
- CDN (CloudFront): Static assets
- Redis: API responses and session data
- Application: In-memory cache (node-cache)
- Browser: Cache headers for static resources

**Authentication:**
- Branca token-based authentication (encrypted tokens)
- Session management via AuthService
- Middleware protection: `middleware/auth.js`

**Observability:**
- OpenTelemetry auto-instrumentation for Node.js
- AWS resource detection (ECS, EC2) for infrastructure context
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

infrastructure/
├── main.tf                      # Primary infrastructure definitions
├── provider.tf                  # AWS provider configuration
├── variables.tf                 # Input variables
├── outputs.tf                   # Output values
├── alb.tf                       # Application Load Balancer
├── redis.tf                     # ElastiCache Redis configuration
└── *.tf                         # Additional infrastructure components
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
