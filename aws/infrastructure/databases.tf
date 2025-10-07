# Database Infrastructure for Tax Preparation App

# RDS Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "tax-app-db-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = {
    Name = "tax-app-db-subnet-group"
  }
}

# RDS Parameter Group
resource "aws_db_parameter_group" "postgres" {
  family = "postgres15"
  name   = "tax-app-postgres-params"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = {
    Name = "tax-app-postgres-params"
  }
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "postgres" {
  identifier = "tax-app-postgres"

  # Engine
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.medium"

  # Storage
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true

  # Database
  db_name  = "tax_app"
  username = "tax_admin"
  password = random_password.db_password.result

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Backup
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  # Parameters
  parameter_group_name = aws_db_parameter_group.postgres.name

  # Options
  skip_final_snapshot = false
  final_snapshot_identifier = "tax-app-postgres-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  
  deletion_protection = true
  
  tags = {
    Name = "tax-app-postgres"
  }
}

# Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Store database password in Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name = "tax-app/database/password"
  
  tags = {
    Name = "tax-app-db-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = aws_db_instance.postgres.username
    password = random_password.db_password.result
    engine   = "postgres"
    host     = aws_db_instance.postgres.endpoint
    port     = aws_db_instance.postgres.port
    dbname   = aws_db_instance.postgres.db_name
  })
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "tax-app-cache-subnet"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "tax-app-cache-subnet"
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "tax-app-redis"
  description                = "Redis cluster for tax preparation app"

  # Engine
  engine               = "redis"
  engine_version       = "7.0"
  node_type           = "cache.t3.micro"
  port                = 6379

  # Cluster configuration
  num_cache_clusters = 2
  
  # Network
  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # Security
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = random_password.redis_auth.result

  # Backup
  snapshot_retention_limit = 5
  snapshot_window         = "03:00-05:00"

  # Maintenance
  maintenance_window = "sun:05:00-sun:07:00"

  tags = {
    Name = "tax-app-redis"
  }
}

# Random auth token for Redis
resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

# Store Redis auth token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth" {
  name = "tax-app/redis/auth"
  
  tags = {
    Name = "tax-app-redis-auth"
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth.result
    host       = aws_elasticache_replication_group.redis.primary_endpoint_address
    port       = aws_elasticache_replication_group.redis.port
  })
}

# DocumentDB (MongoDB-compatible) Subnet Group
resource "aws_docdb_subnet_group" "main" {
  name       = "tax-app-docdb-subnet"
  subnet_ids = aws_subnet.database[*].id

  tags = {
    Name = "tax-app-docdb-subnet"
  }
}

# DocumentDB Cluster Parameter Group
resource "aws_docdb_cluster_parameter_group" "main" {
  family = "docdb5.0"
  name   = "tax-app-docdb-params"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  tags = {
    Name = "tax-app-docdb-params"
  }
}

# DocumentDB Cluster
resource "aws_docdb_cluster" "main" {
  cluster_identifier      = "tax-app-docdb"
  engine                 = "docdb"
  engine_version         = "5.0.0"
  
  master_username        = "docdb_admin"
  master_password        = random_password.docdb_password.result
  
  backup_retention_period = 7
  preferred_backup_window = "07:00-09:00"
  
  skip_final_snapshot = false
  final_snapshot_identifier = "tax-app-docdb-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  
  db_subnet_group_name            = aws_docdb_subnet_group.main.name
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name
  vpc_security_group_ids          = [aws_security_group.docdb.id]
  
  storage_encrypted = true
  
  tags = {
    Name = "tax-app-docdb"
  }
}

# DocumentDB Instances
resource "aws_docdb_cluster_instance" "main" {
  count              = 2
  identifier         = "tax-app-docdb-${count.index}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = "db.t3.medium"

  tags = {
    Name = "tax-app-docdb-${count.index}"
  }
}

# Random password for DocumentDB
resource "random_password" "docdb_password" {
  length  = 32
  special = true
}

# DocumentDB Security Group
resource "aws_security_group" "docdb" {
  name_prefix = "tax-app-docdb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = {
    Name = "tax-app-docdb-sg"
  }
}

# Store DocumentDB credentials in Secrets Manager
resource "aws_secretsmanager_secret" "docdb_password" {
  name = "tax-app/documentdb/password"
  
  tags = {
    Name = "tax-app-docdb-password"
  }
}

resource "aws_secretsmanager_secret_version" "docdb_password" {
  secret_id     = aws_secretsmanager_secret.docdb_password.id
  secret_string = jsonencode({
    username = aws_docdb_cluster.main.master_username
    password = random_password.docdb_password.result
    host     = aws_docdb_cluster.main.endpoint
    port     = aws_docdb_cluster.main.port
  })
}

# RDS Monitoring Role
resource "aws_iam_role" "rds_monitoring" {
  name = "tax-app-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "tax-app-rds-monitoring-role"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Outputs
output "postgres_endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "docdb_endpoint" {
  value = aws_docdb_cluster.main.endpoint
}

output "db_secret_arn" {
  value = aws_secretsmanager_secret.db_password.arn
}

output "redis_secret_arn" {
  value = aws_secretsmanager_secret.redis_auth.arn
}

output "docdb_secret_arn" {
  value = aws_secretsmanager_secret.docdb_password.arn
}