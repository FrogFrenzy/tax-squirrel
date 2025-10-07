#!/bin/bash

# Tax Preparation App Deployment Script
# Usage: ./scripts/deploy.sh [platform]
# Platforms: railway, render, vercel, docker

set -e

PLATFORM=${1:-railway}
PROJECT_NAME="tax-preparation-app"

echo "🚀 Deploying Tax Preparation App to $PLATFORM..."

# Check if required tools are installed
check_dependencies() {
    case $PLATFORM in
        railway)
            if ! command -v railway &> /dev/null; then
                echo "❌ Railway CLI not found. Install with: npm install -g @railway/cli"
                exit 1
            fi
            ;;
        vercel)
            if ! command -v vercel &> /dev/null; then
                echo "❌ Vercel CLI not found. Install with: npm install -g vercel"
                exit 1
            fi
            ;;
        docker)
            if ! command -v docker &> /dev/null; then
                echo "❌ Docker not found. Please install Docker"
                exit 1
            fi
            ;;
    esac
}

# Build all packages
build_packages() {
    echo "📦 Building packages..."
    npm install
    npm run bootstrap
    npm run build
}

# Deploy to Railway
deploy_railway() {
    echo "🚂 Deploying to Railway..."
    
    # Deploy each service
    services=("auth-service" "tax-engine" "document-service" "filing-service" "payment-service" "web-app")
    
    for service in "${services[@]}"; do
        echo "Deploying $service..."
        cd "packages/$service"
        railway up --service "$PROJECT_NAME-$service"
        cd ../..
    done
}

# Deploy to Render
deploy_render() {
    echo "🎨 Deploying to Render..."
    echo "Please connect your GitHub repository to Render and use the included render.yaml file"
    echo "Render will automatically deploy all services based on the configuration"
}

# Deploy to Vercel (Frontend only)
deploy_vercel() {
    echo "▲ Deploying frontend to Vercel..."
    cd packages/web-app
    vercel --prod
    cd ../..
    echo "⚠️  Note: Backend services need to be deployed separately (use Railway or Render)"
}

# Deploy with Docker
deploy_docker() {
    echo "🐳 Deploying with Docker..."
    docker-compose build
    docker-compose up -d
    
    echo "Services running on:"
    echo "- Web App: http://localhost:3000"
    echo "- Auth Service: http://localhost:3001"
    echo "- Tax Engine: http://localhost:3002"
    echo "- Document Service: http://localhost:3003"
    echo "- Filing Service: http://localhost:3004"
    echo "- Payment Service: http://localhost:3005"
}

# Main deployment flow
main() {
    echo "🏗️  Tax Preparation App Deployment"
    echo "Platform: $PLATFORM"
    echo "=================================="
    
    check_dependencies
    build_packages
    
    case $PLATFORM in
        railway)
            deploy_railway
            ;;
        render)
            deploy_render
            ;;
        vercel)
            deploy_vercel
            ;;
        docker)
            deploy_docker
            ;;
        *)
            echo "❌ Unknown platform: $PLATFORM"
            echo "Available platforms: railway, render, vercel, docker"
            exit 1
            ;;
    esac
    
    echo "✅ Deployment completed!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Set up environment variables"
    echo "2. Configure databases"
    echo "3. Test all service endpoints"
    echo "4. Set up monitoring and alerts"
    echo ""
    echo "📖 See DEPLOYMENT.md for detailed instructions"
}

main