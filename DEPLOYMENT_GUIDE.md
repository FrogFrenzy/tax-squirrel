# 🚀 Complete AWS Deployment Guide for Tax Preparation App

## Step-by-Step Deployment Instructions

### Prerequisites Setup

#### 1. Install Required Tools
```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Terraform
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip && sudo mv terraform /usr/local/bin/

# Docker
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh

# Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 2. Create AWS Account
1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Follow the registration process
4. Add a payment method
5. Choose the Basic Support plan (free)

#### 3. Configure AWS CLI
```bash
# Configure AWS credentials
aws configure
# AWS Access Key ID: [Get from AWS Console > IAM > Users > Security Credentials]
# AWS Secret Access Key: [Get from AWS Console > IAM > Users > Security Credentials]
# Default region name: us-east-1
# Default output format: json

# Verify configuration
aws sts get-caller-identity
```

### Step 1: Push Code to Git Repository

```bash
# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit: Complete tax preparation application"

# Add remote repository
git remote add origin https://github.com/FrogFrenzy/tax-squirrel.git

# Push to repository
git push -u origin main
```

### Step 2: Deploy Infrastructure with Terraform

```bash
# Navigate to infrastructure directory
cd aws/infrastructure

# Initialize Terraform
terraform init

# Create terraform.tfvars file with your configuration
cat > terraform.tfvars << EOF
aws_region = "us-east-1"
environment = "production"
domain_name = "tax-squirrel.com"  # Replace with your actual domain
EOF

# Plan deployment
terraform plan

# Apply infrastructure (this will take 15-20 minutes)
terraform apply -auto-approve

# Save important outputs
terraform output > ../deployment-outputs.txt
```

### Step 3: Purchase and Configure Domain

#### Option A: Purchase through Route 53 (Recommended)
```bash
# Check domain availability
aws route53domains check-domain-availability --domain-name tax-squirrel.com

# Purchase domain (if available)
aws route53domains register-domain \
  --domain-name tax-squirrel.com \
  --duration-in-years 1 \
  --admin-contact file://domain-contact.json \
  --registrant-contact file://domain-contact.json \
  --tech-contact file://domain-contact.json
```

#### Option B: Use External Registrar
1. Purchase domain from GoDaddy, Namecheap, etc.
2. After Terraform deployment, get nameservers from Route 53
3. Update nameservers in your domain registrar

### Step 4: Build and Push Docker Images

```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com"

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY

# Create ECR repositories
services=("auth-service" "tax-engine" "document-service" "filing-service" "payment-service" "web-app")

for service in "${services[@]}"; do
  aws ecr create-repository --repository-name "tax-app/$service" --region us-east-1 || echo "Repository exists"
done

# Build and push images
cd ../../  # Back to project root

for service in "${services[@]}"; do
  echo "Building $service..."
  docker build -f packages/$service/Dockerfile -t tax-app/$service .
  docker tag tax-app/$service:latest $ECR_REGISTRY/tax-app/$service:latest
  docker push $ECR_REGISTRY/tax-app/$service:latest
done
```

### Step 5: Deploy ECS Services

Create ECS task definitions and services:

```bash
# Create task definition for auth service
cat > auth-task-definition.json << EOF
{
  "family": "tax-app-auth-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::$AWS_ACCOUNT_ID:role/tax-app-ecs-task-execution-role",
  "taskRoleArn": "arn:aws:iam::$AWS_ACCOUNT_ID:role/tax-app-ecs-task-role",
  "containerDefinitions": [
    {
      "name": "tax-app-auth-service",
      "image": "$ECR_REGISTRY/tax-app/auth-service:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/tax-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "auth-service"
        }
      },
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:$AWS_ACCOUNT_ID:secret:tax-app/database/password"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:$AWS_ACCOUNT_ID:secret:tax-app/jwt/secrets"
        }
      ]
    }
  ]
}
EOF

# Register task definition
aws ecs register-task-definition --cli-input-json file://auth-task-definition.json

# Create ECS service
aws ecs create-service \
  --cluster tax-app-cluster \
  --service-name tax-app-auth-service \
  --task-definition tax-app-auth-service \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(terraform output -raw private_subnet_ids | tr -d '[]" ' | tr ',' ' ')],securityGroups=[$(terraform output -raw security_group_ecs_id)],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$(aws elbv2 describe-target-groups --names tax-app-auth --query 'TargetGroups[0].TargetGroupArn' --output text),containerName=tax-app-auth-service,containerPort=3001"
```

Repeat similar process for other services (tax-engine, document-service, filing-service, payment-service).

### Step 6: Deploy Frontend to S3

```bash
# Build React application
cd packages/web-app

# Set environment variables for production
export REACT_APP_AUTH_SERVICE_URL=https://api.tax-squirrel.com
export REACT_APP_TAX_ENGINE_URL=https://api.tax-squirrel.com
export REACT_APP_DOCUMENT_SERVICE_URL=https://api.tax-squirrel.com
export REACT_APP_FILING_SERVICE_URL=https://api.tax-squirrel.com
export REACT_APP_PAYMENT_SERVICE_URL=https://api.tax-squirrel.com

# Install dependencies and build
npm install
npm run build

# Get S3 bucket name from Terraform output
cd ../../aws/infrastructure
WEBSITE_BUCKET=$(terraform output -raw website_bucket_name)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)

# Deploy to S3
aws s3 sync ../../packages/web-app/build/ s3://$WEBSITE_BUCKET/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"
```

### Step 7: Configure Real API Keys

Update the placeholder secrets with real values:

```bash
# Update Stripe keys (get from https://dashboard.stripe.com/apikeys)
aws secretsmanager update-secret \
  --secret-id tax-app/stripe/keys \
  --secret-string '{
    "stripe_secret_key": "sk_live_your_real_stripe_secret_key",
    "stripe_webhook_secret": "whsec_your_real_webhook_secret",
    "stripe_publishable_key": "pk_live_your_real_publishable_key"
  }'

# Update IRS configuration (contact IRS for real API access)
aws secretsmanager update-secret \
  --secret-id tax-app/irs/config \
  --secret-string '{
    "irs_api_url": "https://prod-irs-api.gov",
    "irs_api_key": "your_real_irs_api_key",
    "software_id": "TAX_SQUIRREL_2024",
    "software_version": "1.0.0",
    "efin": "your_efin_number"
  }'
```

### Step 8: Run Database Migrations

```bash
# Get RDS endpoint
RDS_ENDPOINT=$(cd aws/infrastructure && terraform output -raw postgres_endpoint)

# Connect to database and run migrations
psql -h $RDS_ENDPOINT -U tax_admin -d tax_app << EOF
\i ../../packages/auth-service/src/database/schema.sql
\i ../../packages/tax-engine/src/database/schema.sql
\i ../../packages/filing-service/src/database/schema.sql
EOF
```

### Step 9: Test Deployment

```bash
# Test service health endpoints
curl https://api.tax-squirrel.com/auth/health
curl https://api.tax-squirrel.com/tax/health
curl https://api.tax-squirrel.com/documents/health
curl https://api.tax-squirrel.com/filing/health
curl https://api.tax-squirrel.com/payments/health

# Test main website
curl https://tax-squirrel.com
```

### Step 10: Set Up Monitoring

```bash
# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "TaxSquirrel-Production" \
  --dashboard-body '{
    "widgets": [
      {
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/ECS", "CPUUtilization", "ServiceName", "tax-app-auth-service"],
            ["AWS/ECS", "MemoryUtilization", "ServiceName", "tax-app-auth-service"]
          ],
          "period": 300,
          "stat": "Average",
          "region": "us-east-1",
          "title": "ECS Service Metrics"
        }
      }
    ]
  }'

# Set up CloudWatch alarms
aws cloudwatch put-metric-alarm \
  --alarm-name "tax-app-high-cpu" \
  --alarm-description "Tax App High CPU Usage" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

## 🎯 Expected Results

After successful deployment:

- **Website**: https://tax-squirrel.com
- **API**: https://api.tax-squirrel.com
- **Admin Dashboard**: AWS Console for monitoring
- **Estimated Monthly Cost**: $680-1,565 (depending on usage)

## 🚨 Important Security Notes

1. **Change all default passwords** in Secrets Manager
2. **Enable MFA** on your AWS root account
3. **Set up billing alerts** to monitor costs
4. **Review security groups** and ensure minimal access
5. **Enable CloudTrail** for audit logging
6. **Set up backup verification** procedures

## 📞 Troubleshooting

If you encounter issues:

1. **Check CloudWatch logs** for error details
2. **Verify security group rules** allow traffic
3. **Ensure IAM roles** have correct permissions
4. **Test database connectivity** from ECS tasks
5. **Validate SSL certificates** are properly configured

## 💡 Next Steps After Deployment

1. **Load testing** with tools like Artillery or k6
2. **Security scanning** with AWS Inspector
3. **Backup testing** and disaster recovery procedures
4. **Performance optimization** based on CloudWatch metrics
5. **User acceptance testing** with real tax scenarios

---

This guide provides everything needed to deploy your tax preparation application to AWS. Each step is detailed and includes the exact commands to run.