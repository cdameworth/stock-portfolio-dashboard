# Stock Portfolio Dashboard - Professional Investment Management

A sophisticated web application featuring professional black-tie design that provides an interactive dashboard for stock portfolio management and AI-powered investment recommendations, hosted on AWS ECS Fargate ARM64 with comprehensive observability.

## 🏗️ Architecture Overview

This application demonstrates a containerized microservices architecture for web applications with full observability integration for the Overwatch infrastructure monitoring platform.

### Core Components

- **ECS Fargate ARM64**: Cost-efficient containerized web application with auto-scaling
- **Application Load Balancer**: High-availability traffic distribution with WAF protection
- **RDS Aurora**: PostgreSQL cluster for user data and portfolios
- **ElastiCache Redis**: Session storage and API response caching
- **CloudFront**: CDN for static assets with global distribution
- **S3**: Static asset storage and application logs
- **DynamoDB**: User portfolios, preferences, and session data
- **Lambda**: Background job processing and data refresh
- **SNS/SQS**: Asynchronous notifications and message processing
- **CloudWatch**: Comprehensive application and infrastructure monitoring

## 🌐 Application Features

### Real-time Dashboard
- **Live Stock Recommendations**: Consumes Stock Analytics Engine API
- **Market Overview**: Interactive charts and trend analysis
- **Portfolio Management**: Create and track investment portfolios
- **Trending Stocks**: Identify high-activity investment opportunities
- **System Status**: Real-time health monitoring of all services

### User Experience
- **Professional Design**: Sophisticated black-tie theme for financial professionals
- **Responsive Design**: Optimized for desktop and mobile devices
- **Real-time Updates**: Server-Sent Events for live data streaming
- **AdSense Integration**: Compliant advertising for freemium model
- **Performance Optimized**: CDN delivery and aggressive caching

### API Integration
- **Stock Analytics Engine**: Primary data source for recommendations
- **Circuit Breaker Pattern**: Graceful degradation when upstream services fail
- **Caching Strategy**: Multi-layer caching (Redis, browser, CDN)
- **Rate Limiting**: Protection against abuse and ensuring fair usage

## 🔧 Configuration

### Environment Variables

```bash
# Application Configuration
NODE_ENV=production
PORT=3000
SESSION_SECRET=your-secure-session-secret

# Stock Analytics API Integration
STOCK_ANALYTICS_API_URL=https://api.stock-analytics.example.com/production

# Database Configuration
DATABASE_URL=postgresql://user:password@host:5432/dashboard
DB_HOST=aurora-cluster-endpoint
DB_PORT=5432
DB_NAME=dashboard
DB_USER=dashboardadmin
DB_PASSWORD=secure-password

# Caching Configuration  
REDIS_ENDPOINT=dashboard-redis-cluster-endpoint

# AWS Configuration
AWS_REGION=us-east-1
```

### Docker Configuration

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Deployment Options

#### Option 1: AWS ECS Fargate (Terraform)

```bash
# Deploy infrastructure (run from infrastructure directory)
cd infrastructure
terraform init
terraform apply -var="stock_analytics_api_url=https://your-api-url"

# Get load balancer DNS
terraform output load_balancer_dns
```

#### Option 2: Railway (Recommended for Quick Deploy)

Railway provides a simpler deployment experience with automatic PostgreSQL and Redis provisioning.

```bash
# Quick start with automated setup
./.railway/setup-railway.sh

# Or manual Railway deployment
railway login
railway init
railway add  # Select PostgreSQL
railway add  # Select Redis
railway up
```

**📚 See complete Railway deployment guide:** `claudedocs/RAILWAY_DEPLOYMENT.md`

**Quick Reference:** `.railway/QUICK_REFERENCE.md`

## 🚀 API Endpoints

### Application Routes
```http
GET /                    # Main dashboard
GET /dashboard          # Dashboard page
GET /portfolio          # Portfolio management
GET /recommendations    # Recommendations view
GET /health            # Health check
GET /metrics           # Prometheus metrics
```

### API Routes
```http
GET /api/recommendations                    # Get all recommendations
GET /api/recommendations/:symbol           # Get recommendation by symbol
GET /api/portfolios                       # User portfolios
POST /api/portfolios                      # Create portfolio
GET /api/portfolios/:id/analysis         # Portfolio analysis
GET /api/stream/recommendations          # SSE real-time updates
```

## 🏃‍♂️ Local Development

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Access to Stock Analytics Engine API

### Setup
```bash
# Clone repository
git clone <repository-url>
cd stock-portfolio-dashboard

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your configuration

# Start local development
npm run dev

# Or using Docker
docker-compose up --build
```

### Development Commands
```bash
# Start development server
npm run dev

# Run tests
npm test
npm run test:watch

# Build for production
npm run build

# Lint code
npm run lint
```

## 🐳 Container Deployment

### Build and Push
```bash
# Build container image
docker build -t stock-portfolio-dashboard:latest .

# Tag for ECR
docker tag stock-portfolio-dashboard:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/stock-portfolio-dashboard:latest

# Push to ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/stock-portfolio-dashboard:latest
```

### ECS Service Configuration
- **CPU**: 1024 (1 vCPU)
- **Memory**: 2048 MB
- **Task Count**: 2 (minimum for high availability)
- **Auto Scaling**: Target tracking based on CPU (70%) and memory (80%)
- **Health Check**: `/health` endpoint with 30-second intervals

## 📊 Monitoring & Observability

### Application Metrics
- **HTTP Request Rate**: Requests per second by endpoint
- **Response Time**: P50, P95, P99 latencies for all endpoints
- **Error Rate**: 4XX and 5XX error percentages
- **Cache Hit Rate**: Redis and browser cache effectiveness
- **User Sessions**: Active sessions and session duration

### Infrastructure Metrics
- **ECS Service**: CPU, memory utilization, task count
- **ALB**: Request count, target response time, healthy targets
- **RDS**: Database connections, query performance, storage usage
- **ElastiCache**: Memory usage, cache hit ratio, connection count
- **Lambda**: Duration, error rate, concurrent executions

### Custom Business Metrics
- **Portfolio Creation Rate**: New portfolios created per hour
- **Recommendation Views**: Most viewed stock recommendations
- **API Integration Health**: Stock Analytics Engine response times
- **User Engagement**: Page views, session length, feature usage

### Alerts & Notifications
```yaml
# Critical Alerts
- ALB 5XX Error Rate > 1%
- ECS Service CPU > 80% for 5 minutes
- Database Connection Count > 80% of max
- Redis Memory Usage > 90%

# Warning Alerts  
- API Response Time > 2 seconds
- Cache Hit Rate < 70%
- Failed Background Jobs > 5 per hour
```

## 🔍 Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```bash
   # Check ECS task metrics
   aws ecs describe-services --cluster stock-dashboard-cluster --services stock-dashboard-service
   
   # Scale up memory if needed
   aws ecs update-service --cluster stock-dashboard-cluster --service stock-dashboard-service --task-definition stock-dashboard-task:2
   ```

2. **Database Connection Issues**
   ```bash
   # Check RDS metrics
   aws rds describe-db-clusters --db-cluster-identifier stock-dashboard-aurora-cluster
   
   # Monitor connection count
   aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name DatabaseConnections
   ```

3. **Cache Performance**
   ```bash
   # Check Redis cluster status
   aws elasticache describe-replication-groups --replication-group-id stock-dashboard-redis
   
   # Monitor cache hit ratio
   aws cloudwatch get-metric-statistics --namespace AWS/ElastiCache --metric-name CacheHitRate
   ```

### Debug Commands
```bash
# View application logs
aws logs tail /ecs/stock-dashboard --follow

# Check ECS service events
aws ecs describe-services --cluster stock-dashboard-cluster --services stock-dashboard-service

# Monitor real-time metrics
aws cloudwatch get-dashboard --dashboard-name StockPortfolioDashboard
```

## 🎯 Performance Optimization

### Caching Strategy
```javascript
// Multi-layer caching approach
1. CDN (CloudFront): Static assets, 24-hour TTL
2. Redis: API responses, 5-minute TTL  
3. Application: In-memory cache for config, 1-hour TTL
4. Browser: Static resources with cache headers
```

### Database Optimization
```sql
-- Optimized queries with proper indexing
CREATE INDEX idx_user_portfolios_user_id ON user_portfolios(user_id);
CREATE INDEX idx_user_portfolios_created_at ON user_portfolios(user_id, created_at);
CREATE INDEX idx_dashboard_sessions_expires_at ON dashboard_sessions(expires_at);
```

### Load Testing
```bash
# Install artillery for load testing
npm install -g artillery

# Run load test
artillery run load-test-config.yml

# Monitor performance during test
watch -n 1 'aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name ResponseTime'
```

## 💰 Cost Analysis

### Estimated Monthly Costs (Production)
- **ECS Fargate**: ~$90 (2x 1vCPU, 2GB RAM tasks)
- **ALB**: ~$25 (Load balancer + data processing)
- **RDS Aurora**: ~$200 (2x db.r6g.large instances)
- **ElastiCache**: ~$180 (2x cache.r7g.large nodes)
- **CloudFront**: ~$15 (100GB data transfer)
- **S3**: ~$10 (static assets and logs)
- **Lambda**: ~$5 (background jobs)
- **Other services**: ~$25 (DynamoDB, SNS, CloudWatch)
- **Total**: ~$550/month

### Cost Optimization
- Use Fargate Spot for non-critical workloads
- Implement intelligent caching to reduce database load
- Optimize container resource allocation based on metrics
- Use S3 lifecycle policies for log archival

## 🎯 Integration with Overwatch

This application provides comprehensive observability data for the Overwatch platform:

### Application Dependency Mapping
- **Frontend → Stock Analytics API**: RESTful API consumption with circuit breaker
- **Web App → Database**: PostgreSQL connection pooling and query optimization
- **Web App → Cache**: Redis session and data caching
- **Background Jobs → External APIs**: Asynchronous data processing
- **CDN → Static Assets**: Global content distribution

### Telemetry Generation
- **Request Tracing**: Distributed tracing across all services
- **Performance Metrics**: Response times, throughput, error rates
- **Business Metrics**: User engagement, feature usage, conversion rates
- **Infrastructure Metrics**: Container health, auto-scaling events
- **Security Events**: WAF blocks, authentication failures

### Operational Intelligence
- **Health Dashboards**: Real-time system status visualization
- **Alert Integration**: SNS topics for critical operational events
- **Capacity Planning**: Historical usage patterns and growth trends
- **Incident Response**: Automated diagnostics and remediation workflows

The Stock Portfolio Dashboard serves as a realistic web application example, demonstrating modern containerized architecture patterns with comprehensive observability for the Overwatch monitoring platform.