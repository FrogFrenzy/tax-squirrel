#!/bin/bash

# Quick Deploy Script for Tax Preparation App
# This script automates the deployment process as much as possible

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOMAIN_NAME="tax-squirrel.com"
AWS_REGION="us-east-1"
ENVIRONMENT="production"

echo -e "${BLUE}🚀 Tax Squirrel - Quick Deploy Script${NC}"
echo "=================================="
echo "Domain: $DOMAIN_NAME"
echo "Region: $AWS_REGION"
echo "Environment: $ENVIRONMENT"
echo ""

# Step 1: Check Prerequisites
echo -e "${YELLOW}Step 1: Checking Prerequisites...${NC}"

if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    echo "Install: curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o 'awscliv2.zip' && unzip awscliv2.zip && sudo ./aws/install"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}❌ Terraform not found. Please install it first.${NC}"
    echo "Install: wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip && unzip terraform_1.6.0_linux_amd64.zip && sudo mv terraform /usr/local/bin/"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install it first.${NC}"
    echo "Install: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh"
    exit 1
fi

if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured. Please run 'aws configure' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites met!${NC}"

# Step 2: Deploy Infrastructure
echo -e "${YELLOW}Step 2: Deploying Infrastructure with Terraform...${NC}"

cd aws/infrastructure

# Create terraform.tfvars
cat > terraform.tfvars << EOF
aws_region = "$AWS_REGION"
environment = "$ENVIRONMENT"
domain_name = "$DOMAIN_NAME"
EOF

# Initialize and deploy
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# Get outputs
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo -e "${GREEN}✅ Infrastructure deployed!${NC}"
echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "ECR Registry: $ECR_REGISTRY"

cd ../..

# Step 3: Create ECR Repositories and Build Images
echo -e "${YELLOW}Step 3: Building and Pushing Docker Images...${NC}"

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Create repositories
services=("auth-service" "tax-engine" "document-service" "filing-service" "payment-service" "web-app")

for service in "${services[@]}"; do
    echo "Creating ECR repository for $service..."
    aws ecr create-repository \
        --repository-name "tax-app/$service" \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true \
        2>/dev/null || echo "Repository already exists"
done

# Build and push images
for service in "${services[@]}"; do
    echo "Building and pushing $service..."
    docker build -f packages/$service/Dockerfile -t tax-app/$service .
    docker tag tax-app/$service:latest $ECR_REGISTRY/tax-app/$service:latest
    docker push $ECR_REGISTRY/tax-app/$service:latest
done

echo -e "${GREEN}✅ All images built and pushed!${NC}"

# Step 4: Deploy ECS Services
echo -e "${YELLOW}Step 4: Deploying ECS Services...${NC}"

# Get infrastructure outputs
cd aws/infrastructure
VPC_ID=$(terraform output -raw vpc_id)
PRIVATE_SUBNETS=$(terraform output -raw private_subnet_ids | tr -d '[]"' | tr ',' ' ')
ECS_SECURITY_GROUP=$(terraform output -raw security_group_ecs_id)
TASK_EXECUTION_ROLE=$(terraform output -raw ecs_task_execution_role_arn)
TASK_ROLE=$(terraform output -raw ecs_task_role_arn)

cd ../..

# Create and register task definitions for each service
declare -A service_ports=( 
    ["auth-service"]="3001"
    ["tax-engine"]="3002" 
    ["document-service"]="3003"
    ["filing-service"]="3004"
    ["payment-service"]="3005"
    ["web-app"]="3000"
)

for service in "${!service_ports[@]}"; do
    port=${service_ports[$service]}
    
    echo "Creating task definition for $service..."
    
    cat > ${service}-task-definition.json << EOF
{
  "family": "tax-app-$service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "$TASK_EXECUTION_ROLE",
  "taskRoleArn": "$TASK_ROLE",
  "containerDefinitions": [
    {
      "name": "tax-app-$service",
      "image": "$ECR_REGISTRY/tax-app/$service:latest",
      "portMappings": [
        {
          "containerPort": $port,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/tax-app",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "$service"
        }
      },
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "$port"
        }
      ]
    }
  ]
}
EOF

    # Register task definition
    aws ecs register-task-definition --cli-input-json file://${service}-task-definition.json
    
    # Create service
    echo "Creating ECS service for $service..."
    aws ecs create-service \
        --cluster tax-app-cluster \
        --service-name tax-app-$service \
        --task-definition tax-app-$service \
        --desired-count 1 \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNETS],securityGroups=[$ECS_SECURITY_GROUP],assignPublicIp=DISABLED}" \
        2>/dev/null || echo "Service already exists, updating..."
    
    # Clean up task definition file
    rm ${service}-task-definition.json
done

echo -e "${GREEN}✅ ECS services deployed!${NC}"

# Step 5: Deploy Frontend
echo -e "${YELLOW}Step 5: Deploying Frontend to S3...${NC}"

cd packages/web-app

# Set environment variables
export REACT_APP_AUTH_SERVICE_URL=https://api.$DOMAIN_NAME
export REACT_APP_TAX_ENGINE_URL=https://api.$DOMAIN_NAME
export REACT_APP_DOCUMENT_SERVICE_URL=https://api.$DOMAIN_NAME
export REACT_APP_FILING_SERVICE_URL=https://api.$DOMAIN_NAME
export REACT_APP_PAYMENT_SERVICE_URL=https://api.$DOMAIN_NAME

# Build application
npm install
npm run build

# Deploy to S3
cd ../../aws/infrastructure
WEBSITE_BUCKET=$(terraform output -raw website_bucket_name)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)

aws s3 sync ../../packages/web-app/build/ s3://$WEBSITE_BUCKET/ --delete

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"

cd ../..

echo -e "${GREEN}✅ Frontend deployed!${NC}"

# Step 6: Final Setup Instructions
echo -e "${YELLOW}Step 6: Final Setup Required${NC}"
echo ""
echo -e "${BLUE}🎉 Deployment Complete!${NC}"
echo ""
echo -e "${YELLOW}⚠️  Manual Steps Required:${NC}"
echo ""
echo "1. 📧 Verify SES Domain:"
echo "   - Go to AWS SES Console"
echo "   - Verify domain: $DOMAIN_NAME"
echo ""
echo "2. 🔑 Update API Keys in Secrets Manager:"
echo "   - Stripe: aws secretsmanager update-secret --secret-id tax-app/stripe/keys --secret-string '{\"stripe_secret_key\":\"sk_live_...\"}'"
echo "   - IRS: aws secretsmanager update-secret --secret-id tax-app/irs/config --secret-string '{\"irs_api_key\":\"real_key\"}'"
echo ""
echo "3. 🗄️  Run Database Migrations:"
echo "   - Connect to RDS and run schema files"
echo "   - See DEPLOYMENT_GUIDE.md for detailed instructions"
echo ""
echo "4. 🌐 Configure DNS (if using external registrar):"
echo "   - Update nameservers to Route 53 nameservers"
echo ""
echo "5. 🧪 Test Application:"
echo "   - Website: https://$DOMAIN_NAME"
echo "   - API: https://api.$DOMAIN_NAME/auth/health"
echo ""
echo -e "${GREEN}📖 See DEPLOYMENT_GUIDE.md for detailed instructions!${NC}"