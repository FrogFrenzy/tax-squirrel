# Secrets Management for Tax Preparation App

# JWT Secrets
resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = true
}

resource "random_password" "encryption_key" {
  length  = 64
  special = true
}

# Store JWT secrets in Secrets Manager
resource "aws_secretsmanager_secret" "jwt_secrets" {
  name = "tax-app/jwt/secrets"
  
  tags = {
    Name = "tax-app-jwt-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secrets" {
  secret_id = aws_secretsmanager_secret.jwt_secrets.id
  secret_string = jsonencode({
    jwt_secret         = random_password.jwt_secret.result
    jwt_refresh_secret = random_password.jwt_refresh_secret.result
    encryption_key     = random_password.encryption_key.result
  })
}

# Stripe API Keys (placeholder - you'll need to add real values)
resource "aws_secretsmanager_secret" "stripe_keys" {
  name = "tax-app/stripe/keys"
  
  tags = {
    Name = "tax-app-stripe-keys"
  }
}

resource "aws_secretsmanager_secret_version" "stripe_keys" {
  secret_id = aws_secretsmanager_secret.stripe_keys.id
  secret_string = jsonencode({
    stripe_secret_key     = "sk_test_placeholder_replace_with_real_key"
    stripe_webhook_secret = "whsec_placeholder_replace_with_real_secret"
    stripe_publishable_key = "pk_test_placeholder_replace_with_real_key"
  })
}

# IRS API Configuration (placeholder)
resource "aws_secretsmanager_secret" "irs_config" {
  name = "tax-app/irs/config"
  
  tags = {
    Name = "tax-app-irs-config"
  }
}

resource "aws_secretsmanager_secret_version" "irs_config" {
  secret_id = aws_secretsmanager_secret.irs_config.id
  secret_string = jsonencode({
    irs_api_url        = "https://irs-api-test-endpoint.gov"
    irs_api_key        = "placeholder_irs_api_key"
    software_id        = "TAX_APP_2024"
    software_version   = "1.0.0"
    efin              = "123456"
  })
}

# AWS Configuration for services
resource "aws_secretsmanager_secret" "aws_config" {
  name = "tax-app/aws/config"
  
  tags = {
    Name = "tax-app-aws-config"
  }
}

resource "aws_secretsmanager_secret_version" "aws_config" {
  secret_id = aws_secretsmanager_secret.aws_config.id
  secret_string = jsonencode({
    aws_region           = var.aws_region
    s3_documents_bucket  = aws_s3_bucket.documents.id
    cloudfront_domain    = aws_cloudfront_distribution.website.domain_name
  })
}

# Email Configuration (SES)
resource "aws_secretsmanager_secret" "email_config" {
  name = "tax-app/email/config"
  
  tags = {
    Name = "tax-app-email-config"
  }
}

resource "aws_secretsmanager_secret_version" "email_config" {
  secret_id = aws_secretsmanager_secret.email_config.id
  secret_string = jsonencode({
    ses_region     = var.aws_region
    from_email     = "noreply@${var.domain_name}"
    support_email  = "support@${var.domain_name}"
  })
}

# Application Configuration
resource "aws_secretsmanager_secret" "app_config" {
  name = "tax-app/application/config"
  
  tags = {
    Name = "tax-app-application-config"
  }
}

resource "aws_secretsmanager_secret_version" "app_config" {
  secret_id = aws_secretsmanager_secret.app_config.id
  secret_string = jsonencode({
    environment           = var.environment
    domain_name          = var.domain_name
    api_domain           = "api.${var.domain_name}"
    cors_origins         = "https://${var.domain_name},https://www.${var.domain_name}"
    session_timeout      = "15"
    max_file_size        = "10485760"
    supported_file_types = "pdf,jpg,jpeg,png,gif,tiff"
  })
}

# KMS Key for additional encryption
resource "aws_kms_key" "secrets" {
  description             = "KMS key for Tax App secrets encryption"
  deletion_window_in_days = 7

  tags = {
    Name = "tax-app-secrets-key"
  }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/tax-app-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# SES Configuration for email sending
resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

resource "aws_route53_record" "ses_verification" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = aws_route53_zone.main.zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SES Identity Policy
resource "aws_ses_identity_policy" "main" {
  identity = aws_ses_domain_identity.main.arn
  name     = "tax-app-ses-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ecs_task.arn
        }
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = aws_ses_domain_identity.main.arn
      }
    ]
  })
}

# Outputs
output "jwt_secrets_arn" {
  value = aws_secretsmanager_secret.jwt_secrets.arn
}

output "stripe_secrets_arn" {
  value = aws_secretsmanager_secret.stripe_keys.arn
}

output "irs_config_arn" {
  value = aws_secretsmanager_secret.irs_config.arn
}

output "aws_config_arn" {
  value = aws_secretsmanager_secret.aws_config.arn
}

output "app_config_arn" {
  value = aws_secretsmanager_secret.app_config.arn
}

output "email_config_arn" {
  value = aws_secretsmanager_secret.email_config.arn
}

output "kms_key_id" {
  value = aws_kms_key.secrets.key_id
}