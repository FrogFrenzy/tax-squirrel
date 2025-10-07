# 🎯 Post-Deployment Configuration Guide

## Required Manual Steps After AWS Deployment

### 1. 🔑 Configure Real API Keys

#### Stripe Configuration
```bash
# Get your Stripe keys from https://dashboard.stripe.com/apikeys
aws secretsmanager update-secret \
  --secret-id tax-app/stripe/keys \
  --secret-string '{
    "stripe_secret_key": "sk_live_your_real_stripe_secret_key",
    "stripe_webhook_secret": "whsec_your_real_webhook_secret", 
    "stripe_publishable_key": "pk_live_your_real_publishable_key"
  }'
```

#### IRS API Configuration
```bash
# Contact IRS for production API access
# For testing, use IRS test environment
aws secretsmanager update-secret \
  --secret-id tax-app/irs/config \
  --secret-string '{
    "irs_api_url": "https://testbed.irs.gov/efile",
    "irs_api_key": "your_irs_test_api_key",
    "software_id": "TAX_SQUIRREL_2024",
    "software_version": "1.0.0",
    "efin": "your_efin_number"
  }'
```

### 2. 🗄️ Database Setup

#### Connect to RDS PostgreSQL
```bash
# Get RDS endpoint from Terraform output
cd aws/infrastructure
RDS_ENDPOINT=$(terraform output -raw postgres_endpoint)
DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id tax-app/database/password --query SecretString --output text | jq -r .password)

# Connect and run migrations
psql -h $RDS_ENDPOINT -U tax_admin -d tax_app << EOF
-- Auth Service Schema
\i ../../packages/auth-service/src/database/schema.sql

-- Tax Engine Schema  
\i ../../packages/tax-engine/src/database/schema.sql

-- Filing Service Schema
\i ../../packages/filing-service/src/database/schema.sql

-- Verify tables were created
\dt
EOF
```

#### Initialize DocumentDB
```bash
# DocumentDB collections are auto-created by the application
# No manual setup required
```

### 3. 📧 Email Configuration (SES)

#### Verify Domain in SES
```bash
# Check SES domain verification status
aws ses get-identity-verification-attributes --identities tax-squirrel.com

# If not verified, check DNS records
dig TXT _amazonses.tax-squirrel.com
```

#### Test Email Sending
```bash
# Send test email
aws ses send-email \
  --source noreply@tax-squirrel.com \
  --destination ToAddresses=test@example.com \
  --message Subject={Data="Test Email"},Body={Text={Data="Test message from Tax Squirrel"}}
```

### 4. 🌐 DNS Configuration

#### If Using External Domain Registrar
1. Get Route 53 nameservers:
```bash
aws route53 get-hosted-zone --id $(aws route53 list-hosted-zones --query "HostedZones[?Name=='tax-squirrel.com.'].Id" --output text | cut -d'/' -f3)
```

2. Update nameservers in your domain registrar (GoDaddy, Namecheap, etc.)

#### Verify DNS Propagation
```bash
# Check DNS propagation
dig tax-squirrel.com
dig api.tax-squirrel.com
dig www.tax-squirrel.com
```

### 5. 🧪 Application Testing

#### Health Check All Services
```bash
# Test all service endpoints
services=("auth" "tax" "documents" "filing" "payments")

for service in "${services[@]}"; do
  echo "Testing $service service..."
  curl -f https://api.tax-squirrel.com/$service/health || echo "❌ $service service failed"
done
```

#### Test Frontend
```bash
# Test main website
curl -f https://tax-squirrel.com || echo "❌ Frontend failed"

# Test with browser
echo "🌐 Open https://tax-squirrel.com in your browser"
```

#### Test User Registration Flow
```bash
# Test user registration API
curl -X POST https://api.tax-squirrel.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "profile": {
      "firstName": "Test",
      "lastName": "User",
      "dateOfBirth": "1990-01-01",
      "address": {
        "street1": "123 Test St",
        "city": "Test City", 
        "state": "CA",
        "zipCode": "12345",
        "country": "US"
      },
      "filingStatus": "single"
    }
  }'
```

### 6. 📊 Monitoring Setup

#### Create CloudWatch Dashboard
```bash
# Create comprehensive monitoring dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "TaxSquirrel-Production" \
  --dashboard-body file://monitoring-dashboard.json
```

#### Set Up Alerts
```bash
# High CPU alert
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

# High memory alert  
aws cloudwatch put-metric-alarm \
  --alarm-name "tax-app-high-memory" \
  --alarm-description "Tax App High Memory Usage" \
  --metric-name MemoryUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Database connection alert
aws cloudwatch put-metric-alarm \
  --alarm-name "tax-app-db-connections" \
  --alarm-description "Tax App High DB Connections" \
  --metric-name DatabaseConnections \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

### 7. 🔒 Security Hardening

#### Enable AWS Config
```bash
# Enable AWS Config for compliance monitoring
aws configservice put-configuration-recorder \
  --configuration-recorder name=tax-app-config,roleARN=arn:aws:iam::ACCOUNT:role/aws-config-role \
  --recording-group allSupported=true,includeGlobalResourceTypes=true

aws configservice put-delivery-channel \
  --delivery-channel name=tax-app-delivery,s3BucketName=tax-app-config-bucket
```

#### Enable GuardDuty
```bash
# Enable GuardDuty for threat detection
aws guardduty create-detector --enable
```

#### Enable Security Hub
```bash
# Enable Security Hub for security posture management
aws securityhub enable-security-hub
```

### 8. 💾 Backup Verification

#### Test RDS Backup
```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier tax-app-postgres \
  --db-snapshot-identifier tax-app-manual-snapshot-$(date +%Y%m%d)

# List snapshots
aws rds describe-db-snapshots --db-instance-identifier tax-app-postgres
```

#### Test S3 Backup
```bash
# Verify S3 versioning is enabled
aws s3api get-bucket-versioning --bucket $(aws s3 ls | grep tax-app-documents | awk '{print $3}')

# Test cross-region replication (if configured)
aws s3api get-bucket-replication --bucket $(aws s3 ls | grep tax-app-documents | awk '{print $3}')
```

### 9. 🚀 Performance Optimization

#### Enable CloudFront Compression
```bash
# Verify CloudFront compression is enabled
aws cloudfront get-distribution-config --id $(aws cloudfront list-distributions --query "DistributionList.Items[0].Id" --output text)
```

#### Optimize ECS Task Sizing
```bash
# Monitor ECS metrics and adjust task definitions as needed
aws ecs describe-services --cluster tax-app-cluster --services tax-app-auth-service
```

### 10. 📋 Final Checklist

- [ ] All API keys updated with production values
- [ ] Database migrations completed successfully
- [ ] SES domain verified and email sending tested
- [ ] DNS propagation completed (may take 24-48 hours)
- [ ] All service health checks passing
- [ ] Frontend accessible and functional
- [ ] User registration and login working
- [ ] CloudWatch monitoring and alerts configured
- [ ] Security services enabled (GuardDuty, Security Hub, Config)
- [ ] Backup procedures tested and verified
- [ ] Performance monitoring baseline established
- [ ] SSL certificates valid and auto-renewing
- [ ] Cost monitoring and billing alerts set up

### 🎉 Congratulations!

Your Tax Squirrel application is now fully deployed and configured on AWS! 

**Access URLs:**
- 🌐 **Website**: https://tax-squirrel.com
- 🔧 **API**: https://api.tax-squirrel.com
- 📊 **Monitoring**: AWS CloudWatch Console

**Next Steps:**
1. **Load Testing**: Use tools like Artillery or k6 to test under load
2. **Security Audit**: Run penetration testing and security scans
3. **User Acceptance Testing**: Test with real tax scenarios
4. **Documentation**: Create user guides and API documentation
5. **Marketing**: Launch your tax preparation service!

**Support:**
- Monitor CloudWatch logs for any issues
- Check service health endpoints regularly
- Review AWS billing dashboard for cost optimization
- Keep all dependencies and security patches up to date