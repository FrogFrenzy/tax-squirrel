# Tax Preparation Application

A comprehensive, secure, and integrated online tax preparation platform that helps users optimize deductions, file returns, handle audits, and manage all aspects of the annual tax return process.

## Features

- **Secure Authentication**: Multi-factor authentication with bank-level security
- **Tax Calculation Engine**: Real-time tax calculations with deduction optimization
- **Document Management**: OCR-powered document processing and organization
- **E-Filing**: Direct IRS and state tax system integration
- **Payment Processing**: Secure payment handling and refund management
- **Audit Support**: Comprehensive audit assistance and documentation
- **Multi-Platform**: Web and mobile applications with offline capabilities
- **Professional Integration**: Access to certified tax advisors

## Architecture

This application uses a microservices architecture with the following services:

- **Auth Service** (Port 3001): User authentication and management
- **Tax Engine** (Port 3002): Tax calculations and optimization
- **Document Service** (Port 3003): Document processing and storage
- **Filing Service** (Port 3004): IRS and state filing integration
- **Payment Service** (Port 3005): Payment processing and refunds
- **Web App** (Port 3000): React-based web interface

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- npm 9+

### Development Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd tax-preparation-app
   npm install
   npm run bootstrap
   ```

2. **Start development environment:**
   ```bash
   docker-compose up -d  # Start databases
   npm run dev           # Start all services
   ```

3. **Access the application:**
   - Web App: http://localhost:3000
   - Auth Service: http://localhost:3001
   - Tax Engine: http://localhost:3002
   - Document Service: http://localhost:3003
   - Filing Service: http://localhost:3004
   - Payment Service: http://localhost:3005

### Environment Variables

Create `.env` files in each service directory with the following variables:

**Auth Service (.env):**
```
DATABASE_URL=postgresql://tax_user:tax_password@localhost:5432/tax_app
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-key
MFA_ISSUER=TaxApp
```

**Tax Engine (.env):**
```
DATABASE_URL=postgresql://tax_user:tax_password@localhost:5432/tax_app
REDIS_URL=redis://localhost:6379
```

**Document Service (.env):**
```
MONGODB_URL=mongodb://tax_user:tax_password@localhost:27017/tax_documents
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=tax-documents-bucket
```

**Filing Service (.env):**
```
DATABASE_URL=postgresql://tax_user:tax_password@localhost:5432/tax_app
IRS_API_URL=https://irs-api-endpoint
IRS_API_KEY=your-irs-api-key
```

**Payment Service (.env):**
```
DATABASE_URL=postgresql://tax_user:tax_password@localhost:5432/tax_app
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
```

## Development Commands

```bash
# Install dependencies for all packages
npm run bootstrap

# Start all services in development mode
npm run dev

# Build all packages
npm run build

# Run tests across all packages
npm run test

# Lint code across all packages
npm run lint

# Clean all node_modules and build artifacts
npm run clean
```

## Package Structure

```
tax-preparation-app/
├── packages/
│   ├── shared/              # Shared types and utilities
│   ├── auth-service/        # Authentication service
│   ├── tax-engine/          # Tax calculation engine
│   ├── document-service/    # Document management
│   ├── filing-service/      # E-filing integration
│   ├── payment-service/     # Payment processing
│   ├── web-app/            # React web application
│   └── mobile-app/         # React Native mobile app
├── scripts/                # Database and deployment scripts
├── docker-compose.yml      # Local development environment
└── .github/workflows/      # CI/CD pipelines
```

## Security

- All data encrypted in transit (TLS 1.3) and at rest (AES-256)
- Multi-factor authentication required
- SOC 2 Type II compliance
- Regular security audits and penetration testing
- PCI DSS compliance for payment processing

## Compliance

- IRS security requirements for tax software
- GDPR and CCPA privacy compliance
- State tax authority requirements
- Financial data protection standards

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is proprietary software. All rights reserved.

## Support

For technical support or questions, please contact the development team.