#!/bin/bash

# Git Setup Script for Tax Preparation App
# This script initializes git and pushes to the repository

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}📦 Git Setup for Tax Squirrel${NC}"
echo "=================================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo -e "${YELLOW}Initializing git repository...${NC}"
    git init
fi

# Add all files
echo -e "${YELLOW}Adding all files to git...${NC}"
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo -e "${YELLOW}No changes to commit${NC}"
else
    # Commit changes
    echo -e "${YELLOW}Committing changes...${NC}"
    git commit -m "Complete tax preparation application with AWS infrastructure

Features:
- 🔐 Secure authentication with MFA
- 🧮 Real-time tax calculations and optimization
- 📄 OCR document processing
- 📊 IRS e-filing integration
- 💳 Payment processing with Stripe
- 📱 Web and mobile applications
- ☁️ Complete AWS infrastructure
- 🛡️ SOC 2 compliant security

Services:
- Auth Service (JWT + MFA)
- Tax Engine (Calculations + Optimization)
- Document Service (OCR + Storage)
- Filing Service (IRS Integration)
- Payment Service (Stripe Integration)
- Web Application (React)

Infrastructure:
- ECS Fargate for microservices
- RDS PostgreSQL + DocumentDB + Redis
- S3 + CloudFront for storage and CDN
- Route 53 + ACM for DNS and SSL
- Secrets Manager + KMS for security
- CloudWatch for monitoring"
fi

# Check if remote exists
if git remote get-url origin &>/dev/null; then
    echo -e "${YELLOW}Remote origin already exists${NC}"
else
    echo -e "${YELLOW}Adding remote repository...${NC}"
    git remote add origin https://github.com/FrogFrenzy/tax-squirrel.git
fi

# Push to repository
echo -e "${YELLOW}Pushing to repository...${NC}"
git push -u origin main

echo -e "${GREEN}✅ Code successfully pushed to GitHub!${NC}"
echo ""
echo -e "${BLUE}🔗 Repository: https://github.com/FrogFrenzy/tax-squirrel${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run ./quick-deploy.sh to deploy to AWS"
echo "2. Follow DEPLOYMENT_GUIDE.md for detailed instructions"