# 🚀 Tax Preparation App - Deployment Guide

## Overview
This guide covers deploying the comprehensive tax preparation application across different platforms.

## 🏗️ Architecture
- **Frontend**: React web app (packages/web-app)
- **Backend Services**: 5 microservices (auth, tax-engine, documents, filing, payments)
- **Databases**: PostgreSQL + MongoDB + Redis
- **Storage**: AWS S3 or local file storage

## 📋 Prerequisites

### 1. Environment Variables
Create `.env` files for each service:

**Auth Service (.env)**:
```bash
DATABASE_URL=postgresql://user:password@host:5432/tax_app
REDIS_URL=redis://host:6379
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
ENCRYPTION_KEY=your-encryption-key
MFA_ISSUER=TaxApp
PORT=3001
NODE_ENV=production
```

**Tax Engine (.env)**:
```bash
DATABASE_URL=postgresql://user:password@host:5432/tax_app
REDIS_URL=redis://host:6379
JWT_SECRET=your-super-secret-jwt-key
PORT=3002
NODE_ENV=production
```

**Document Service (.env)**:
```bash
MONGODB_URL=mongodb://user:password@host:27017/tax_documents
JWT_SECRET=your-super-secret-jwt-key
STORAGE_PROVIDER=aws
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=tax-documents-bucket
PORT=3003
NODE_ENV=production
```

**Filing Service (.env)**:
```bash
DATABASE_URL=postgresql://user:password@host:5432/tax_app
JWT_SECRET=your-super-secret-jwt-key
IRS_API_URL=https://irs-api-endpoint
IRS_API_KEY=your-irs-api-key
PORT=3004
NODE_ENV=production
```

**Payment Service (.env)**:
```bash
DATABASE_URL=postgresql://user:password@host:5432/tax_app
JWT_SECRET=your-super-secret-jwt-key
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
PORT=3005
NODE_ENV=production
```

**Web App (.env)**:
```bash
REACT_APP_AUTH_SERVICE_URL=https://your-auth-service-url
REACT_APP_TAX_ENGINE_URL=https://your-tax-engine-url
REACT_APP_DOCUMENT_SERVICE_URL=https://your-document-service-url
REACT_APP_FILING_SERVICE_URL=https://your-filing-service-url
REACT_APP_PAYMENT_SERVICE_URL=https://your-payment-service-url
```

## 🚀 Deployment Options

### Option 1: Railway (Recommended for Full-Stack)

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Deploy Services**:
   ```bash
   # Deploy each service separately
   cd packages/auth-service && railway up
   cd packages/tax-engine && railway up
   cd packages/document-service && railway up
   cd packages/filing-service && railway up
   cd packages/payment-service && railway up
   cd packages/web-app && railway up
   ```

3. **Add Databases**:
   - PostgreSQL for auth, tax-engine, filing, payment services
   - MongoDB for document service
   - Redis for caching

### Option 2: Render (Alternative Full-Stack)

1. **Connect Repository**: Link your GitHub repo to Render
2. **Use render.yaml**: The included `render.yaml` will auto-configure services
3. **Set Environment Variables**: Add secrets in Render dashboard

### Option 3: Vercel (Frontend Only)

1. **Deploy Frontend**:
   ```bash
   cd packages/web-app
   vercel --prod
   ```

2. **Deploy Backend Separately**: Use Railway/Render for backend services

### Option 4: AWS/Azure (Production)

1. **Use Docker Compose**: 
   ```bash
   docker-compose up -d
   ```

2. **Container Orchestration**: Deploy with ECS, EKS, or Azure Container Instances

## 🗄️ Database Setup

### PostgreSQL Schema
```bash
# Run schema initialization
psql -h host -U user -d tax_app -f packages/auth-service/src/database/schema.sql
psql -h host -U user -d tax_app -f packages/tax-engine/src/database/schema.sql
psql -h host -U user -d tax_app -f packages/filing-service/src/database/schema.sql
```

### MongoDB Collections
The document service will auto-create collections on first run.

## 🔐 Security Checklist

- [ ] Generate strong JWT secrets (32+ characters)
- [ ] Set up SSL/TLS certificates
- [ ] Configure CORS for production domains
- [ ] Set up rate limiting
- [ ] Enable database encryption
- [ ] Configure backup strategies
- [ ] Set up monitoring and alerting

## 📊 Monitoring

### Health Check Endpoints
- Auth Service: `GET /auth/health`
- Tax Engine: `GET /tax/health`
- Document Service: `GET /documents/health`
- Filing Service: `GET /filing/health`
- Payment Service: `GET /payments/health`

### Recommended Monitoring Tools
- **Uptime**: UptimeRobot, Pingdom
- **Performance**: New Relic, DataDog
- **Logs**: LogRocket, Sentry
- **Analytics**: Google Analytics, Mixpanel

## 🚦 CI/CD Pipeline

The included `.github/workflows/ci.yml` provides:
- Automated testing
- Security scanning
- Build verification
- Deployment automation

## 📞 Support

For deployment issues:
1. Check service health endpoints
2. Review application logs
3. Verify environment variables
4. Test database connections
5. Confirm API integrations

## 🎯 Production Considerations

### Performance
- Enable Redis caching
- Configure CDN for static assets
- Implement database indexing
- Set up load balancing

### Security
- Regular security audits
- Dependency updates
- SSL certificate renewal
- Access log monitoring

### Compliance
- SOC 2 Type II certification
- GDPR/CCPA compliance
- IRS security requirements
- PCI DSS for payments

### Scaling
- Horizontal service scaling
- Database read replicas
- File storage optimization
- API rate limiting

---

**Note**: This is a comprehensive tax preparation application with sensitive financial data. Ensure all security and compliance requirements are met before production deployment.