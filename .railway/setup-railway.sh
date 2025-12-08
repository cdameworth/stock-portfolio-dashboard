#!/bin/bash
# Railway Setup Script for Stock Portfolio Dashboard
# This script helps you set up the Railway project with all required services

set -e

echo "🚂 Railway Setup for Stock Portfolio Dashboard"
echo "================================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed."
    echo "📦 Install it with: npm install -g @railway/cli"
    echo "🔗 Or visit: https://docs.railway.app/develop/cli"
    exit 1
fi

echo "✅ Railway CLI is installed"
echo ""

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 You need to log in to Railway"
    railway login
fi

echo "✅ Logged in to Railway"
echo ""

# Create or link project
echo "📋 Do you want to:"
echo "  1) Create a new Railway project"
echo "  2) Link to an existing Railway project"
read -p "Enter your choice (1 or 2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    read -p "Enter project name (default: stock-portfolio-dashboard): " project_name
    project_name=${project_name:-stock-portfolio-dashboard}

    echo "🏗️  Creating new Railway project: $project_name"
    railway init --name "$project_name"
else
    echo ""
    echo "🔗 Linking to existing project"
    railway link
fi

echo ""
echo "✅ Project configured"
echo ""

# Add PostgreSQL service
echo "📦 Adding PostgreSQL service..."
railway add --service postgres

echo ""
echo "✅ PostgreSQL service added"
echo ""

# Add Redis service
echo "📦 Adding Redis service..."
railway add --service redis

echo ""
echo "✅ Redis service added"
echo ""

# Set environment variables
echo "🔧 Setting up environment variables..."
echo ""

# Generate secrets if not provided
echo "Generating secure secrets..."
BRANCA_SECRET=$(openssl rand -base64 32 | tr -d '\n')
JWT_SECRET=$(openssl rand -hex 64 | tr -d '\n')
SESSION_SECRET=$(openssl rand -hex 64 | tr -d '\n')

# Set basic environment variables
railway variables set NODE_ENV=production
railway variables set BRANCA_SECRET="$BRANCA_SECRET"
railway variables set JWT_SECRET="$JWT_SECRET"
railway variables set SESSION_SECRET="$SESSION_SECRET"
railway variables set OTEL_SERVICE_NAME=stock-portfolio-dashboard
railway variables set OTEL_SERVICE_VERSION=1.0.0

echo ""
echo "✅ Basic environment variables set"
echo ""

# Prompt for optional variables
read -p "Do you have a Stock Analytics API URL? (y/n): " has_api
if [ "$has_api" == "y" ]; then
    read -p "Enter Stock Analytics API URL: " api_url
    railway variables set STOCK_ANALYTICS_API_URL="$api_url"
fi

read -p "Do you have a SigNoz access token? (y/n): " has_signoz
if [ "$has_signoz" == "y" ]; then
    read -p "Enter SigNoz access token: " signoz_token
    railway variables set SIGNOZ_ACCESS_TOKEN="$signoz_token"
    railway variables set OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.us.signoz.cloud:443/v1/traces
fi

read -p "Do you want to enable advertising? (y/n): " enable_ads
if [ "$enable_ads" == "y" ]; then
    read -p "Enter Google AdSense Publisher ID: " adsense_id
    railway variables set GOOGLE_AD_PUBLISHER_ID="$adsense_id"
    railway variables set ENABLE_ADS=true
fi

echo ""
echo "✅ Environment variables configured"
echo ""

# Deploy the application
echo "🚀 Ready to deploy!"
read -p "Do you want to deploy now? (y/n): " deploy_now

if [ "$deploy_now" == "y" ]; then
    echo ""
    echo "🚀 Deploying to Railway..."
    railway up
    echo ""
    echo "✅ Deployment initiated!"
    echo ""
    echo "🌐 Your application will be available at:"
    railway domain
else
    echo ""
    echo "ℹ️  To deploy later, run: railway up"
    echo "ℹ️  To view logs, run: railway logs"
    echo "ℹ️  To open dashboard, run: railway open"
fi

echo ""
echo "================================================"
echo "🎉 Railway setup complete!"
echo ""
echo "📝 Generated secrets (save these securely):"
echo "   BRANCA_SECRET: $BRANCA_SECRET"
echo "   JWT_SECRET: $JWT_SECRET"
echo "   SESSION_SECRET: $SESSION_SECRET"
echo ""
echo "🔗 Useful commands:"
echo "   railway logs              - View application logs"
echo "   railway open              - Open Railway dashboard"
echo "   railway variables         - View environment variables"
echo "   railway run npm run dev   - Run locally with Railway variables"
echo "   railway up                - Deploy to Railway"
echo ""
echo "📚 Next steps:"
echo "   1. Set remaining environment variables in Railway dashboard"
echo "   2. Run database migrations: railway run npm run migrate"
echo "   3. Monitor your deployment in the Railway dashboard"
echo ""
