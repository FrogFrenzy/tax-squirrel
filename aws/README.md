# 🚀 Tax Preparation App - AWS Deployment

## Overview
This directory contains the complete AWS infrastructure and deployment configuration for the Tax Preparation Application using modern cloud-native architecture.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CloudFront    │────│  Application     │────│   ECS Fargate   │
│   (CDN/WAF)     │    │  Load Balancer   │    │   Services      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   S3 Bucket     │    │   Route 53       │    │   RDS/DocumentDB│
│ (Static Assets) │    │   (DNS)          │    │   Redis Cache   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🛠️ Infrastructure Components

### Compute & Networking
- **VPC**: Multi-AZ setup with public/private subnets
- **ECS Fargate**: Serverless container orchestration
- **Application Load Balancer**: Traffic distribution and SSL termination
- **NAT Gateways**: Secure outbound internet access for private subnets

### Storage & Databases
- **RDS PostgreSQL**: Primary relational database (Multi-AZ)
- **DocumentDB**: MongoDB-compatible document database
- **ElastiCache Redis**: In-memory caching and session storage
- **S3**: Document storage with lifecycle policies

### Security & Compliance
- **Secrets Manager**: Secure credential storage
- **KMS**: Encryption key management
- **IAM Roles**: Least-privilege access control
- **Security Groups**: Network-level security

### Monitoring & Observability
- **CloudWatch**: Logging, metrics, and alarms
- **X-Ray**: Distributed tracing (optional)
- **Route 53 Health Checks**: DNS-level monitoring

## 📋 Prerequisites

### Required Tools
```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Terraform
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip && sudo mv terraform /usr/local/bin/

# Docker
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
```

### AWS Configuration
```bash
# Configure AWS credentials
aws configure
# AWS Access Key ID: [Your Access Key]
# AWS Secret Access Key: [Your Secret Key]
# Default region name: us-east-1
# Default output format: json

# Verify configuration
aws sts get-caller-identity
```

### Domain Setup
1. **Purchase Domain**: Buy domain through Route 53 or external registrar
2. **DNS Configuration**: If using external registrar, you'll need to update nameservers after deployment

## 🚀 Deployment Process

### Option 1: Automated Deployment (Recommended)
```bash
# Make deployment script executable
chmod +x aws/deploy.sh

# Set environment variables
export AWS_REGION=us-east-1
export ENVIRONMENT=production
export DOMAIN_NAME=yourdomain.com

# Run deployment
./aws/deploy.sh
```

### Option 2: Manual Step-by-Step Deployment

#### Step 1: Infrastructure Deployment
```bash
cd aws/infrastructure

# Initialize Terraform
terraform init

# Plan deployment
terraform plan \
  -var="aws_region=us-east-1" \
  -var="environment=production" \
  -var="domain_name=yourdomain.com"

# Apply infrastructure
terraform apply
```

#### Step 2: Build and Push Container Images
```bash
# Get ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push each service
services=("auth-service" "tax-engine" "document-service" "filing-service" "payment-service" "web-app")

for service in "${services[@]}"; do
  docker build -f packages/$service/Dockerfile -t tax-app/$service .
  docker tag tax-app/$service:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/tax-app/$service:latest
  docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/tax-app/$service:latest
done
```

#### Step 3: Deploy ECS Services
```bash
# Create ECS task definitions and services
# (This would typically be done through Terraform or AWS CLI)
```

#### Step 4: Deploy Frontend
```bash
cd packages/web-app

# Build production bundle
npm install
npm run build

# Deploy to S3
aws s3 sync build/ s3://your-website-bucket/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

## 🔧 Configuration

### Environment Variables
Each service requires specific environment variables stored in AWS Secrets Manager:

#### Auth Service
```json
{
  "DATABASE_URL": "postgresql://user:pass@host:5432/tax_app",
  "REDIS_URL": "redis://host:6379",
  "JWT_SECRET": "your-jwt-secret",
  "JWT_REFRESH_SECRET": "your-refresh-secret",
  "ENCRYPTION_KEY": "your-encryption-key"
}
```

#### Document Service
```json
{
  "MONGODB_URL": "mongodb://user:pass@host:27017/tax_documents",
  "AWS_S3_BUCKET": "tax-app-documents-bucket",
  "JWT_SECRET": "your-jwt-secret"
}
```

### Update Secrets
```bash
# Update Stripe keys
aws secretsmanager update-secret \
  --secret-id tax-app/stripe/keys \
  --secret-string '{"stripe_secret_key":"sk_live_...","stripe_webhook_secret":"whsec_..."}'

# Update IRS configuration
aws secretsmanager update-secret \
  --secret-id tax-app/irs/config \
  --secret-string '{"irs_api_url":"https://prod-irs-api.gov","irs_api_key":"real_key"}'
```

## 🗄️ Database Setup

### PostgreSQL Schema
```bash
# Connect to RDS instance
psql -h your-rds-endpoint -U tax_admin -d tax_app

# Run schema files
\i /path/to/packages/auth-service/src/database/schema.sql
\i /path/to/packages/tax-engine/src/database/schema.sql
\i /path/to/packages/filing-service/src/database/schema.sql
```

### DocumentDB Setup
```bash
# Connect to DocumentDB
mongo --ssl --host your-docdb-endpoint:27017 --username docdb_admin --password

# Create collections (auto-created by application)
```

## 📊 Monitoring & Maintenance

### CloudWatch Dashboards
```bash
# Create custom dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "TaxApp-Production" \
  --dashboard-body file://aws/monitoring/dashboard.json
```

### Log Aggregation
```bash
# View service logs
aws logs describe-log-groups --log-group-name-prefix "/ecs/tax-app"
aws logs tail /ecs/tax-app/auth-service --follow
```

### Health Checks
```bash
# Test service endpoints
curl https://api.yourdomain.com/auth/health
curl https://api.yourdomain.com/tax/health
curl https://api.yourdomain.com/documents/health
curl https://api.yourdomain.com/filing/health
curl https://api.yourdomain.com/payments/health
```

## 🔒 Security Best Practices

### SSL/TLS Configuration
- **Certificate**: Managed by AWS Certificate Manager
- **Protocols**: TLS 1.2+ only
- **Ciphers**: Strong cipher suites only
- **HSTS**: Enabled with long max-age

### Network Security
- **WAF**: Configure AWS WAF rules for common attacks
- **Security Groups**: Restrictive inbound rules
- **NACLs**: Additional network-level protection
- **VPC Flow Logs**: Network traffic monitoring

### Data Protection
- **Encryption at Rest**: All databases and S3 buckets encrypted
- **Encryption in Transit**: TLS for all communications
- **Key Management**: AWS KMS for key rotation
- **Backup Encryption**: All backups encrypted

## 💰 Cost Optimization

### Resource Sizing
```bash
# Monitor and adjust ECS task sizes
aws ecs describe-services --cluster tax-app-cluster

# Review RDS instance sizes
aws rds describe-db-instances --db-instance-identifier tax-app-postgres
```

### S3 Lifecycle Policies
- **Standard**: 0-30 days
- **Standard-IA**: 30-90 days  
- **Glacier**: 90-365 days
- **Deep Archive**: 365+ days

### Reserved Instances
Consider Reserved Instances for:
- RDS databases (1-3 year terms)
- ElastiCache clusters
- NAT Gateways (if consistent usage)

## 🚨 Disaster Recovery

### Backup Strategy
- **RDS**: Automated backups (7 days retention)
- **DocumentDB**: Point-in-time recovery
- **S3**: Cross-region replication
- **Secrets**: Automatic replication

### Recovery Procedures
```bash
# RDS Point-in-time recovery
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier tax-app-postgres \
  --target-db-instance-identifier tax-app-postgres-restored \
  --restore-time 2024-01-01T12:00:00Z

# S3 Cross-region restore
aws s3 sync s3://tax-app-documents-backup/ s3://tax-app-documents/
```

## 📞 Troubleshooting

### Common Issues

#### ECS Service Won't Start
```bash
# Check task definition
aws ecs describe-task-definition --task-definition tax-app-auth-service

# Check service events
aws ecs describe-services --cluster tax-app-cluster --services tax-app-auth-service

# Check logs
aws logs tail /ecs/tax-app/auth-service --follow
```

#### Database Connection Issues
```bash
# Test connectivity
telnet your-rds-endpoint 5432

# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxxxxxxxx
```

#### SSL Certificate Issues
```bash
# Check certificate status
aws acm describe-certificate --certificate-arn arn:aws:acm:...

# Verify DNS validation
dig _amazonses.yourdomain.com TXT
```

## 📈 Scaling Considerations

### Auto Scaling
```bash
# Configure ECS auto scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/tax-app-cluster/tax-app-auth-service \
  --min-capacity 2 \
  --max-capacity 10
```

### Database Scaling
- **Read Replicas**: For read-heavy workloads
- **Connection Pooling**: Implement in application
- **Caching**: Leverage Redis for frequently accessed data

## 🔄 CI/CD Integration

### GitHub Actions
```yaml
# .github/workflows/deploy-aws.yml
name: Deploy to AWS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to AWS
        run: ./aws/deploy.sh
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## 📋 Post-Deployment Checklist

- [ ] Verify all services are healthy
- [ ] Test user registration and login
- [ ] Upload and process a test document
- [ ] Complete a test tax calculation
- [ ] Verify SSL certificate is working
- [ ] Check CloudWatch logs for errors
- [ ] Test backup and restore procedures
- [ ] Configure monitoring alerts
- [ ] Update DNS records (if using external registrar)
- [ ] Load test the application
- [ ] Security scan and penetration testing
- [ ] Document any custom configurations

## 🆘 Support

For deployment issues:
1. Check CloudWatch logs for error details
2. Verify all environment variables are set correctly
3. Ensure IAM permissions are properly configured
4. Test network connectivity between services
5. Review security group rules

---

**⚠️ Important**: This is a production-grade tax preparation application handling sensitive financial data. Ensure all security and compliance requirements are met before going live.