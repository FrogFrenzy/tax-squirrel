#!/bin/bash

# Tax Preparation App - AWS Deployment Script
# This script deploys the entire application to AWS using Terraform and Docker

set -e

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
ENVIRONMENT=${ENVIRONMENT:-production}
DOMAIN_NAME=${DOMAIN_NAME:-taxapp.com}
ECR_REGISTRY=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Please install AWS CLI."
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform not found. Please install Terraform."
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Please install Node.js."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    
    log_success "All prerequisites met!"
}

# Create ECR repositories
create_ecr_repositories() {
    log_info "Creating ECR repositories..."
    
    local services=("auth-service" "tax-engine" "document-service" "filing-service" "payment-service" "web-app")
    
    for service in "${services[@]}"; do
        log_info "Creating ECR repository for $service..."
        
        aws ecr create-repository \
            --repository-name "tax-app/$service" \
            --region $AWS_REGION \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256 \
            2>/dev/null || log_warning "Repository tax-app/$service already exists"
    done
    
    # Get ECR registry URL
    ECR_REGISTRY=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com
    log_success "ECR repositories created. Registry: $ECR_REGISTRY"
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    # Login to ECR
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
    
    local services=("auth-service" "tax-engine" "document-service" "filing-service" "payment-service")
    
    # Build backend services
    for service in "${services[@]}"; do
        log_info "Building $service..."
        
        docker build \
            -f packages/$service/Dockerfile \
            -t tax-app/$service:latest \
            -t $ECR_REGISTRY/tax-app/$service:latest \
            .
        
        log_info "Pushing $service to ECR..."
        docker push $ECR_REGISTRY/tax-app/$service:latest
    done
    
    # Build web app
    log_info "Building web application..."
    cd packages/web-app
    
    # Set environment variables for build
    export REACT_APP_AUTH_SERVICE_URL=https://api.$DOMAIN_NAME
    export REACT_APP_TAX_ENGINE_URL=https://api.$DOMAIN_NAME
    export REACT_APP_DOCUMENT_SERVICE_URL=https://api.$DOMAIN_NAME
    export REACT_APP_FILING_SERVICE_URL=https://api.$DOMAIN_NAME
    export REACT_APP_PAYMENT_SERVICE_URL=https://api.$DOMAIN_NAME
    
    npm install
    npm run build
    
    # Build Docker image for web app
    docker build \
        -t tax-app/web-app:latest \
        -t $ECR_REGISTRY/tax-app/web-app:latest \
        .
    
    docker push $ECR_REGISTRY/tax-app/web-app:latest
    
    cd ../..
    log_success "All images built and pushed!"
}

# Deploy infrastructure with Terraform
deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."
    
    cd aws/infrastructure
    
    # Initialize Terraform
    terraform init
    
    # Plan deployment
    terraform plan \
        -var="aws_region=$AWS_REGION" \
        -var="environment=$ENVIRONMENT" \
        -var="domain_name=$DOMAIN_NAME" \
        -out=tfplan
    
    # Apply deployment
    log_info "Applying Terraform configuration..."
    terraform apply tfplan
    
    # Get outputs
    VPC_ID=$(terraform output -raw vpc_id)
    ALB_DNS=$(terraform output -raw alb_dns_name)
    ECS_CLUSTER=$(terraform output -raw ecs_cluster_name)
    
    log_success "Infrastructure deployed successfully!"
    log_info "VPC ID: $VPC_ID"
    log_info "Load Balancer DNS: $ALB_DNS"
    log_info "ECS Cluster: $ECS_CLUSTER"
    
    cd ../..
}

# Deploy ECS services
deploy_ecs_services() {
    log_info "Deploying ECS services..."
    
    local services=("auth-service" "tax-engine" "document-service" "filing-service" "payment-service" "web-app")
    
    for service in "${services[@]}"; do
        log_info "Deploying $service to ECS..."
        
        # Create task definition
        aws ecs register-task-definition \
            --cli-input-json file://aws/ecs-tasks/$service-task-definition.json \
            --region $AWS_REGION
        
        # Create or update service
        aws ecs create-service \
            --cluster tax-app-cluster \
            --service-name tax-app-$service \
            --task-definition tax-app-$service \
            --desired-count 2 \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
            --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:$AWS_REGION:xxx:targetgroup/tax-app-$service/xxx,containerName=tax-app-$service,containerPort=300$((${#service} % 10))" \
            --region $AWS_REGION \
            2>/dev/null || \
        aws ecs update-service \
            --cluster tax-app-cluster \
            --service tax-app-$service \
            --task-definition tax-app-$service \
            --desired-count 2 \
            --region $AWS_REGION
    done
    
    log_success "ECS services deployed!"
}

# Deploy static website to S3
deploy_website() {
    log_info "Deploying website to S3..."
    
    # Get S3 bucket name from Terraform output
    cd aws/infrastructure
    WEBSITE_BUCKET=$(terraform output -raw website_bucket_name)
    CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)
    cd ../..
    
    # Sync website files
    aws s3 sync packages/web-app/build/ s3://$WEBSITE_BUCKET/ --delete
    
    # Invalidate CloudFront cache
    aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*"
    
    log_success "Website deployed to S3 and CloudFront cache invalidated!"
}

# Setup monitoring and alerts
setup_monitoring() {
    log_info "Setting up monitoring and alerts..."
    
    # Create CloudWatch alarms
    aws cloudwatch put-metric-alarm \
        --alarm-name "tax-app-high-cpu" \
        --alarm-description "Tax App High CPU Usage" \
        --metric-name CPUUtilization \
        --namespace AWS/ECS \
        --statistic Average \
        --period 300 \
        --threshold 80 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions "arn:aws:sns:$AWS_REGION:$(aws sts get-caller-identity --query Account --output text):tax-app-alerts"
    
    log_success "Monitoring and alerts configured!"
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # This would typically be done through ECS tasks or Lambda functions
    # For now, we'll create a placeholder
    log_warning "Database migrations should be run manually after deployment"
    log_info "Connect to the RDS instance and run the schema files:"
    log_info "- packages/auth-service/src/database/schema.sql"
    log_info "- packages/tax-engine/src/database/schema.sql"
    log_info "- packages/filing-service/src/database/schema.sql"
}

# Main deployment function
main() {
    log_info "🚀 Starting Tax Preparation App deployment to AWS"
    log_info "Region: $AWS_REGION"
    log_info "Environment: $ENVIRONMENT"
    log_info "Domain: $DOMAIN_NAME"
    echo "=================================="
    
    check_prerequisites
    create_ecr_repositories
    build_and_push_images
    deploy_infrastructure
    deploy_ecs_services
    deploy_website
    setup_monitoring
    run_migrations
    
    log_success "🎉 Deployment completed successfully!"
    echo ""
    log_info "📋 Next steps:"
    log_info "1. Update DNS records to point to AWS (if using external DNS)"
    log_info "2. Update Secrets Manager with real API keys (Stripe, IRS, etc.)"
    log_info "3. Run database migrations manually"
    log_info "4. Test all service endpoints"
    log_info "5. Set up monitoring dashboards"
    echo ""
    log_info "🌐 Your application will be available at:"
    log_info "- Website: https://$DOMAIN_NAME"
    log_info "- API: https://api.$DOMAIN_NAME"
    echo ""
    log_info "📖 See aws/README.md for detailed post-deployment instructions"
}

# Run main function
main "$@"