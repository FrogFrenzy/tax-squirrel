# ECS Infrastructure for Tax Preparation App

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "tax-app-cluster"

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.ecs.name
      }
    }
  }

  tags = {
    Name = "tax-app-cluster"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/tax-app"
  retention_in_days = 7

  tags = {
    Name = "tax-app-ecs-logs"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "tax-app-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name = "tax-app-alb"
  }
}

# ALB Target Groups
resource "aws_lb_target_group" "web_app" {
  name     = "tax-app-web"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "tax-app-web-tg"
  }
}

resource "aws_lb_target_group" "auth_service" {
  name     = "tax-app-auth"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/auth/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "tax-app-auth-tg"
  }
}

resource "aws_lb_target_group" "tax_engine" {
  name     = "tax-app-tax-engine"
  port     = 3002
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/tax/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "tax-app-tax-engine-tg"
  }
}

resource "aws_lb_target_group" "document_service" {
  name     = "tax-app-documents"
  port     = 3003
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/documents/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "tax-app-documents-tg"
  }
}

resource "aws_lb_target_group" "filing_service" {
  name     = "tax-app-filing"
  port     = 3004
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/filing/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "tax-app-filing-tg"
  }
}

resource "aws_lb_target_group" "payment_service" {
  name     = "tax-app-payments"
  port     = 3005
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/payments/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "tax-app-payments-tg"
  }
}

# ALB Listeners
resource "aws_lb_listener" "web" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web_app.arn
  }
}

# HTTP to HTTPS redirect
resource "aws_lb_listener" "redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ALB Listener Rules for API routing
resource "aws_lb_listener_rule" "auth_api" {
  listener_arn = aws_lb_listener.web.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.auth_service.arn
  }

  condition {
    path_pattern {
      values = ["/auth/*", "/mfa/*"]
    }
  }
}

resource "aws_lb_listener_rule" "tax_api" {
  listener_arn = aws_lb_listener.web.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tax_engine.arn
  }

  condition {
    path_pattern {
      values = ["/tax/*"]
    }
  }
}

resource "aws_lb_listener_rule" "documents_api" {
  listener_arn = aws_lb_listener.web.arn
  priority     = 300

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.document_service.arn
  }

  condition {
    path_pattern {
      values = ["/documents/*"]
    }
  }
}

resource "aws_lb_listener_rule" "filing_api" {
  listener_arn = aws_lb_listener.web.arn
  priority     = 400

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.filing_service.arn
  }

  condition {
    path_pattern {
      values = ["/filing/*"]
    }
  }
}

resource "aws_lb_listener_rule" "payments_api" {
  listener_arn = aws_lb_listener.web.arn
  priority     = 500

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.payment_service.arn
  }

  condition {
    path_pattern {
      values = ["/payments/*"]
    }
  }
}

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution" {
  name = "tax-app-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "tax-app-ecs-task-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ECS Task Role
resource "aws_iam_role" "ecs_task" {
  name = "tax-app-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "tax-app-ecs-task-role"
  }
}

# Policy for accessing Secrets Manager
resource "aws_iam_role_policy" "ecs_secrets" {
  name = "tax-app-ecs-secrets-policy"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.db_password.arn,
          aws_secretsmanager_secret.redis_auth.arn,
          aws_secretsmanager_secret.docdb_password.arn,
          aws_secretsmanager_secret.jwt_secrets.arn
        ]
      }
    ]
  })
}

# Policy for accessing S3
resource "aws_iam_role_policy" "ecs_s3" {
  name = "tax-app-ecs-s3-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.documents.arn
      }
    ]
  })
}

# Outputs
output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_zone_id" {
  value = aws_lb.main.zone_id
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_task_execution_role_arn" {
  value = aws_iam_role.ecs_task_execution.arn
}

output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}