# Stock Portfolio Dashboard - Web application that consumes stock recommendations
# This application presents stock suggestions via ECS Fargate with comprehensive observability

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Application = "stock-portfolio-dashboard"
      Environment = var.environment
      Team        = "frontend-platform"
      CostCenter  = "web-applications"
      Owner       = "frontend-team@company.com"
    }
  }
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "stock_analytics_api_url" {
  description = "URL of the Stock Analytics API"
  type        = string
  # This would be set to the output from the first application
  default     = "https://api.stock-analytics.example.com/production"
}

variable "container_image" {
  description = "Container image for the dashboard application"
  type        = string
  default     = "stock-portfolio-dashboard:latest"
}

# VPC and Networking
resource "aws_vpc" "dashboard_vpc" {
  cidr_block           = "10.1.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "stock-dashboard-vpc"
  }
}

resource "aws_subnet" "private_subnet_1" {
  vpc_id            = aws_vpc.dashboard_vpc.id
  cidr_block        = "10.1.1.0/24"
  availability_zone = "${var.aws_region}a"
  
  tags = {
    Name = "stock-dashboard-private-1"
  }
}

resource "aws_subnet" "private_subnet_2" {
  vpc_id            = aws_vpc.dashboard_vpc.id
  cidr_block        = "10.1.2.0/24"
  availability_zone = "${var.aws_region}b"
  
  tags = {
    Name = "stock-dashboard-private-2"
  }
}

resource "aws_subnet" "public_subnet_1" {
  vpc_id                  = aws_vpc.dashboard_vpc.id
  cidr_block              = "10.1.101.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
  
  tags = {
    Name = "stock-dashboard-public-1"
  }
}

resource "aws_subnet" "public_subnet_2" {
  vpc_id                  = aws_vpc.dashboard_vpc.id
  cidr_block              = "10.1.102.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true
  
  tags = {
    Name = "stock-dashboard-public-2"
  }
}

resource "aws_internet_gateway" "dashboard_igw" {
  vpc_id = aws_vpc.dashboard_vpc.id
  
  tags = {
    Name = "stock-dashboard-igw"
  }
}

resource "aws_nat_gateway" "dashboard_nat_1" {
  allocation_id = aws_eip.nat_eip_1.id
  subnet_id     = aws_subnet.public_subnet_1.id
  
  tags = {
    Name = "stock-dashboard-nat-1"
  }
}

resource "aws_nat_gateway" "dashboard_nat_2" {
  allocation_id = aws_eip.nat_eip_2.id
  subnet_id     = aws_subnet.public_subnet_2.id
  
  tags = {
    Name = "stock-dashboard-nat-2"
  }
}

resource "aws_eip" "nat_eip_1" {
  domain = "vpc"
  
  tags = {
    Name = "stock-dashboard-nat-eip-1"
  }
}

resource "aws_eip" "nat_eip_2" {
  domain = "vpc"
  
  tags = {
    Name = "stock-dashboard-nat-eip-2"
  }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.dashboard_vpc.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.dashboard_igw.id
  }
  
  tags = {
    Name = "stock-dashboard-public-rt"
  }
}

resource "aws_route_table" "private_rt_1" {
  vpc_id = aws_vpc.dashboard_vpc.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.dashboard_nat_1.id
  }
  
  tags = {
    Name = "stock-dashboard-private-rt-1"
  }
}

resource "aws_route_table" "private_rt_2" {
  vpc_id = aws_vpc.dashboard_vpc.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.dashboard_nat_2.id
  }
  
  tags = {
    Name = "stock-dashboard-private-rt-2"
  }
}

resource "aws_route_table_association" "public_rta_1" {
  subnet_id      = aws_subnet.public_subnet_1.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "public_rta_2" {
  subnet_id      = aws_subnet.public_subnet_2.id
  route_table_id = aws_route_table.public_rt.id
}

resource "aws_route_table_association" "private_rta_1" {
  subnet_id      = aws_subnet.private_subnet_1.id
  route_table_id = aws_route_table.private_rt_1.id
}

resource "aws_route_table_association" "private_rta_2" {
  subnet_id      = aws_subnet.private_subnet_2.id
  route_table_id = aws_route_table.private_rt_2.id
}

# Security Groups
resource "aws_security_group" "alb_sg" {
  name        = "stock-dashboard-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = aws_vpc.dashboard_vpc.id
  
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "stock-dashboard-alb-sg"
  }
}

resource "aws_security_group" "ecs_sg" {
  name        = "stock-dashboard-ecs-sg"
  description = "Security group for ECS tasks"
  vpc_id      = aws_vpc.dashboard_vpc.id
  
  ingress {
    description     = "HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "stock-dashboard-ecs-sg"
  }
}

resource "aws_security_group" "rds_sg" {
  name        = "stock-dashboard-rds-sg"
  description = "Security group for RDS database"
  vpc_id      = aws_vpc.dashboard_vpc.id
  
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_sg.id]
  }
  
  tags = {
    Name = "stock-dashboard-rds-sg"
  }
}

resource "aws_security_group" "redis_sg" {
  name        = "stock-dashboard-redis-sg"
  description = "Security group for Redis cluster"
  vpc_id      = aws_vpc.dashboard_vpc.id
  
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_sg.id]
  }
  
  tags = {
    Name = "stock-dashboard-redis-sg"
  }
}

# S3 Buckets
resource "aws_s3_bucket" "dashboard_assets" {
  bucket = "stock-dashboard-assets-${random_id.bucket_suffix.hex}"
  
  tags = {
    Name = "dashboard-assets"
  }
}

resource "aws_s3_bucket" "user_data" {
  bucket = "stock-dashboard-user-data-${random_id.bucket_suffix.hex}"
  
  tags = {
    Name = "user-data"
  }
}

resource "aws_s3_bucket" "application_logs" {
  bucket = "stock-dashboard-logs-${random_id.bucket_suffix.hex}"
  
  tags = {
    Name = "application-logs"
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_versioning" "dashboard_assets_versioning" {
  bucket = aws_s3_bucket.dashboard_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dashboard_assets_encryption" {
  bucket = aws_s3_bucket.dashboard_assets.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudFront Distribution
resource "aws_cloudfront_origin_access_control" "dashboard_oac" {
  name                              = "stock-dashboard-oac"
  description                       = "OAC for stock dashboard assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "dashboard_assets_distribution" {
  origin {
    domain_name              = aws_s3_bucket.dashboard_assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard_oac.id
    origin_id                = "S3-${aws_s3_bucket.dashboard_assets.bucket}"
  }
  
  enabled = true
  
  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.dashboard_assets.bucket}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    
    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  viewer_certificate {
    cloudfront_default_certificate = true
  }
  
  tags = {
    Name = "stock-dashboard-assets-distribution"
  }
}

# DynamoDB Tables
resource "aws_dynamodb_table" "user_portfolios" {
  name           = "user-portfolios"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "user_id"
  range_key      = "portfolio_id"
  
  attribute {
    name = "user_id"
    type = "S"
  }
  
  attribute {
    name = "portfolio_id"
    type = "S"
  }
  
  attribute {
    name = "created_at"
    type = "S"
  }
  
  global_secondary_index {
    name     = "created-at-index"
    hash_key = "user_id"
    range_key = "created_at"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Name = "user-portfolios"
  }
}

resource "aws_dynamodb_table" "user_preferences" {
  name           = "user-preferences"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "user_id"
  
  attribute {
    name = "user_id"
    type = "S"
  }
  
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  
  tags = {
    Name = "user-preferences"
  }
}

resource "aws_dynamodb_table" "dashboard_sessions" {
  name           = "dashboard-sessions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "session_id"
  
  attribute {
    name = "session_id"
    type = "S"
  }
  
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  
  tags = {
    Name = "dashboard-sessions"
  }
}

# RDS Database
resource "aws_db_subnet_group" "dashboard_db_subnet_group" {
  name       = "stock-dashboard-db-subnet-group"
  subnet_ids = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id]
  
  tags = {
    Name = "stock-dashboard-db-subnet-group"
  }
}

resource "aws_rds_cluster" "dashboard_aurora" {
  cluster_identifier     = "stock-dashboard-aurora-cluster"
  engine                = "aurora-postgresql"
  engine_version        = "15.4"
  database_name         = "dashboard"
  master_username       = "dashboardadmin"
  manage_master_user_password = true
  
  db_subnet_group_name   = aws_db_subnet_group.dashboard_db_subnet_group.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  
  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"
  preferred_maintenance_window = "sun:04:00-sun:05:00"
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  tags = {
    Name = "stock-dashboard-aurora"
  }
}

resource "aws_rds_cluster_instance" "dashboard_aurora_instance" {
  count              = 2
  identifier         = "stock-dashboard-aurora-${count.index}"
  cluster_identifier = aws_rds_cluster.dashboard_aurora.id
  instance_class     = "db.r6g.large"
  engine             = aws_rds_cluster.dashboard_aurora.engine
  engine_version     = aws_rds_cluster.dashboard_aurora.engine_version
  
  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn         = aws_iam_role.rds_monitoring_role.arn
  
  tags = {
    Name = "stock-dashboard-aurora-${count.index}"
  }
}

# ElastiCache Redis
resource "aws_elasticache_subnet_group" "dashboard_redis_subnet_group" {
  name       = "stock-dashboard-redis-subnet-group"
  subnet_ids = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id]
  
  tags = {
    Name = "stock-dashboard-redis-subnet-group"
  }
}

resource "aws_elasticache_replication_group" "dashboard_redis" {
  replication_group_id       = "stock-dashboard-redis"
  description                = "Redis cluster for dashboard caching and sessions"
  
  node_type                  = "cache.r7g.large"
  port                       = 6379
  parameter_group_name       = "default.redis7"
  
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled          = true
  
  subnet_group_name = aws_elasticache_subnet_group.dashboard_redis_subnet_group.name
  security_group_ids = [aws_security_group.redis_sg.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  tags = {
    Name = "stock-dashboard-redis"
  }
}

# Application Load Balancer
resource "aws_lb" "dashboard_alb" {
  name               = "stock-dashboard-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets           = [aws_subnet.public_subnet_1.id, aws_subnet.public_subnet_2.id]
  
  enable_deletion_protection = false
  
  access_logs {
    bucket  = aws_s3_bucket.application_logs.bucket
    prefix  = "alb-logs"
    enabled = true
  }
  
  tags = {
    Name = "stock-dashboard-alb"
  }
}

resource "aws_lb_target_group" "dashboard_tg" {
  name        = "stock-dashboard-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.dashboard_vpc.id
  target_type = "ip"
  
  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }
  
  tags = {
    Name = "stock-dashboard-tg"
  }
}

resource "aws_lb_listener" "dashboard_listener" {
  load_balancer_arn = aws_lb.dashboard_alb.arn
  port              = "80"
  protocol          = "HTTP"
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard_tg.arn
  }
  
  tags = {
    Name = "dashboard-listener"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "dashboard_cluster" {
  name = "stock-dashboard-cluster"
  
  configuration {
    execute_command_configuration {
      kms_key_id = aws_kms_key.ecs_kms_key.arn
      logging    = "OVERRIDE"
      
      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs_exec_logs.name
      }
    }
  }
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  
  tags = {
    Name = "stock-dashboard-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "dashboard_capacity_providers" {
  cluster_name = aws_ecs_cluster.dashboard_cluster.name
  
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  
  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "dashboard_task" {
  family                   = "stock-dashboard-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn
  
  container_definitions = jsonencode([
    {
      name  = "stock-dashboard"
      image = var.container_image
      
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      
      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "STOCK_ANALYTICS_API_URL"
          value = var.stock_analytics_api_url
        },
        {
          name  = "REDIS_ENDPOINT"
          value = aws_elasticache_replication_group.dashboard_redis.primary_endpoint_address
        },
        {
          name  = "DATABASE_URL"
          value = "postgresql://${aws_rds_cluster.dashboard_aurora.master_username}@${aws_rds_cluster.dashboard_aurora.endpoint}:5432/${aws_rds_cluster.dashboard_aurora.database_name}"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        }
      ]
      
      secrets = [
        {
          name      = "DATABASE_PASSWORD"
          valueFrom = aws_rds_cluster.dashboard_aurora.master_user_secret[0].secret_arn
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      
      essential = true
    }
  ])
  
  tags = {
    Name = "stock-dashboard-task"
  }
}

# ECS Service
resource "aws_ecs_service" "dashboard_service" {
  name            = "stock-dashboard-service"
  cluster         = aws_ecs_cluster.dashboard_cluster.id
  task_definition = aws_ecs_task_definition.dashboard_task.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  
  platform_version = "LATEST"
  
  network_configuration {
    subnets          = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = false
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.dashboard_tg.arn
    container_name   = "stock-dashboard"
    container_port   = 3000
  }
  
  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
    
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }
  
  enable_execute_command = true
  
  service_registries {
    registry_arn = aws_service_discovery_service.dashboard_service_discovery.arn
  }
  
  depends_on = [aws_lb_listener.dashboard_listener]
  
  tags = {
    Name = "stock-dashboard-service"
  }
}

# Auto Scaling
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.dashboard_cluster.name}/${aws_ecs_service.dashboard_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_cpu_policy" {
  name               = "stock-dashboard-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    
    target_value = 70.0
  }
}

resource "aws_appautoscaling_policy" "ecs_memory_policy" {
  name               = "stock-dashboard-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace
  
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    
    target_value = 80.0
  }
}

# Service Discovery
resource "aws_service_discovery_private_dns_namespace" "dashboard_namespace" {
  name = "stock-dashboard.local"
  vpc  = aws_vpc.dashboard_vpc.id
  
  tags = {
    Name = "stock-dashboard-namespace"
  }
}

resource "aws_service_discovery_service" "dashboard_service_discovery" {
  name = "dashboard"
  
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.dashboard_namespace.id
    
    dns_records {
      ttl  = 10
      type = "A"
    }
    
    routing_policy = "MULTIVALUE"
  }
  
  health_check_grace_period_seconds = 30
  
  tags = {
    Name = "dashboard-service-discovery"
  }
}

# Lambda Functions for Background Jobs
resource "aws_lambda_function" "portfolio_analytics" {
  filename         = "portfolio_analytics.zip"
  function_name    = "portfolio-analytics"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "index.handler"
  runtime         = "python3.11"
  timeout         = 300
  memory_size     = 1024
  
  vpc_config {
    subnet_ids         = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id]
    security_group_ids = [aws_security_group.ecs_sg.id]
  }
  
  environment {
    variables = {
      DYNAMODB_PORTFOLIOS_TABLE = aws_dynamodb_table.user_portfolios.name
      DYNAMODB_PREFERENCES_TABLE = aws_dynamodb_table.user_preferences.name
      REDIS_ENDPOINT = aws_elasticache_replication_group.dashboard_redis.primary_endpoint_address
      STOCK_ANALYTICS_API_URL = var.stock_analytics_api_url
    }
  }
  
  tracing_config {
    mode = "Active"
  }
  
  tags = {
    Name = "portfolio-analytics"
  }
}

resource "aws_lambda_function" "data_refresh" {
  filename         = "data_refresh.zip"
  function_name    = "data-refresh"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "index.handler"
  runtime         = "python3.11"
  timeout         = 900
  memory_size     = 512
  
  vpc_config {
    subnet_ids         = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id]
    security_group_ids = [aws_security_group.ecs_sg.id]
  }
  
  environment {
    variables = {
      REDIS_ENDPOINT = aws_elasticache_replication_group.dashboard_redis.primary_endpoint_address
      STOCK_ANALYTICS_API_URL = var.stock_analytics_api_url
      SNS_TOPIC_ARN = aws_sns_topic.dashboard_notifications.arn
    }
  }
  
  tracing_config {
    mode = "Active"
  }
  
  tags = {
    Name = "data-refresh"
  }
}

# SQS Queues
resource "aws_sqs_queue" "portfolio_updates" {
  name                      = "portfolio-updates"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600
  receive_wait_time_seconds = 20
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.portfolio_updates_dlq.arn
    maxReceiveCount     = 3
  })
  
  tags = {
    Name = "portfolio-updates"
  }
}

resource "aws_sqs_queue" "portfolio_updates_dlq" {
  name = "portfolio-updates-dlq"
  
  tags = {
    Name = "portfolio-updates-dlq"
  }
}

resource "aws_sqs_queue" "user_notifications" {
  name                      = "user-notifications"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600
  receive_wait_time_seconds = 20
  
  tags = {
    Name = "user-notifications"
  }
}

# SNS Topics
resource "aws_sns_topic" "dashboard_notifications" {
  name = "dashboard-notifications"
  
  tags = {
    Name = "dashboard-notifications"
  }
}

resource "aws_sns_topic" "system_alerts" {
  name = "dashboard-system-alerts"
  
  tags = {
    Name = "dashboard-system-alerts"
  }
}

# EventBridge Rules
resource "aws_cloudwatch_event_rule" "data_refresh_schedule" {
  name                = "dashboard-data-refresh-schedule"
  description         = "Trigger data refresh every 5 minutes"
  schedule_expression = "rate(5 minutes)"
  
  tags = {
    Name = "dashboard-data-refresh-schedule"
  }
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.data_refresh_schedule.name
  target_id = "DataRefreshTarget"
  arn       = aws_lambda_function.data_refresh.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.data_refresh.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.data_refresh_schedule.arn
}

# KMS Key for ECS
resource "aws_kms_key" "ecs_kms_key" {
  description             = "KMS key for ECS encryption"
  deletion_window_in_days = 7
  
  tags = {
    Name = "ecs-kms-key"
  }
}

resource "aws_kms_alias" "ecs_kms_alias" {
  name          = "alias/ecs-encryption-key"
  target_key_id = aws_kms_key.ecs_kms_key.key_id
}

# CloudWatch Resources
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/stock-dashboard"
  retention_in_days = 14
  
  tags = {
    Name = "ecs-logs"
  }
}

resource "aws_cloudwatch_log_group" "ecs_exec_logs" {
  name              = "/aws/ecs/exec/stock-dashboard"
  retention_in_days = 7
  
  tags = {
    Name = "ecs-exec-logs"
  }
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  for_each = toset([
    "/aws/lambda/portfolio-analytics",
    "/aws/lambda/data-refresh"
  ])
  
  name              = each.value
  retention_in_days = 14
  
  tags = {
    Name = each.value
  }
}

resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/redis/dashboard-slow-log"
  retention_in_days = 7
  
  tags = {
    Name = "dashboard-redis-slow-log"
  }
}

# CloudWatch Dashboards
resource "aws_cloudwatch_dashboard" "dashboard_monitoring" {
  dashboard_name = "StockPortfolioDashboard"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", "stock-dashboard-service", "ClusterName", "stock-dashboard-cluster"],
            [".", "MemoryUtilization", ".", ".", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "ECS Service Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.dashboard_alb.arn_suffix],
            [".", "ResponseTime", ".", "."],
            [".", "HTTPCode_Target_2XX_Count", ".", "."],
            [".", "HTTPCode_Target_4XX_Count", ".", "."],
            [".", "HTTPCode_Target_5XX_Count", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Application Load Balancer Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", "stock-dashboard-redis-001"],
            [".", "DatabaseMemoryUsagePercentage", ".", "."],
            [".", "CurrConnections", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Redis Cluster Metrics"
          period  = 300
        }
      }
    ]
  })
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "dashboard-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS CPU utilization"
  
  dimensions = {
    ServiceName = aws_ecs_service.dashboard_service.name
    ClusterName = aws_ecs_cluster.dashboard_cluster.name
  }
  
  alarm_actions = [aws_sns_topic.system_alerts.arn]
  
  tags = {
    Name = "ecs-cpu-high-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  alarm_name          = "dashboard-alb-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "2"
  alarm_description   = "This metric monitors ALB response time"
  
  dimensions = {
    LoadBalancer = aws_lb.dashboard_alb.arn_suffix
  }
  
  alarm_actions = [aws_sns_topic.system_alerts.arn]
  
  tags = {
    Name = "alb-response-time-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  alarm_name          = "dashboard-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors Redis CPU utilization"
  
  dimensions = {
    CacheClusterId = "stock-dashboard-redis-001"
  }
  
  alarm_actions = [aws_sns_topic.system_alerts.arn]
  
  tags = {
    Name = "redis-cpu-high-alarm"
  }
}

# IAM Roles and Policies
resource "aws_iam_role" "ecs_execution_role" {
  name = "stock-dashboard-ecs-execution-role"
  
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
    Name = "ecs-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task_role" {
  name = "stock-dashboard-ecs-task-role"
  
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
    Name = "ecs-task-role"
  }
}

resource "aws_iam_role_policy" "ecs_task_policy" {
  name = "stock-dashboard-ecs-task-policy"
  role = aws_iam_role.ecs_task_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.dashboard_assets.arn}/*",
          "${aws_s3_bucket.user_data.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.user_portfolios.arn,
          aws_dynamodb_table.user_preferences.arn,
          aws_dynamodb_table.dashboard_sessions.arn,
          "${aws_dynamodb_table.user_portfolios.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage"
        ]
        Resource = [
          aws_sqs_queue.portfolio_updates.arn,
          aws_sqs_queue.user_notifications.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          aws_sns_topic.dashboard_notifications.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_rds_cluster.dashboard_aurora.master_user_secret[0].secret_arn
      }
    ]
  })
}

resource "aws_iam_role" "lambda_execution_role" {
  name = "stock-dashboard-lambda-execution-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
  
  tags = {
    Name = "lambda-execution-role"
  }
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "stock-dashboard-lambda-policy"
  role = aws_iam_role.lambda_execution_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AttachNetworkInterface",
          "ec2:DetachNetworkInterface"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.user_portfolios.arn,
          aws_dynamodb_table.user_preferences.arn,
          "${aws_dynamodb_table.user_portfolios.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          aws_sns_topic.dashboard_notifications.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "rds_monitoring_role" {
  name = "stock-dashboard-rds-monitoring-role"
  
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
    Name = "rds-monitoring-role"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring_role_policy" {
  role       = aws_iam_role.rds_monitoring_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# S3 Bucket Policy for ALB Logs
resource "aws_s3_bucket_policy" "alb_logs_policy" {
  bucket = aws_s3_bucket.application_logs.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::127311923021:root"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.application_logs.arn}/alb-logs/*"
      }
    ]
  })
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "dashboard_waf" {
  name  = "stock-dashboard-waf"
  scope = "REGIONAL"
  
  default_action {
    allow {}
  }
  
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    
    override_action {
      none {}
    }
    
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }
  
  rule {
    name     = "RateLimitRule"
    priority = 2
    
    action {
      block {}
    }
    
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }
  
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "DashboardWAF"
    sampled_requests_enabled   = true
  }
  
  tags = {
    Name = "stock-dashboard-waf"
  }
}

resource "aws_wafv2_web_acl_association" "dashboard_waf_association" {
  resource_arn = aws_lb.dashboard_alb.arn
  web_acl_arn  = aws_wafv2_web_acl.dashboard_waf.arn
}

# X-Ray Tracing
resource "aws_xray_sampling_rule" "dashboard_sampling" {
  rule_name      = "stock-dashboard-sampling"
  priority       = 9000
  version        = 1
  reservoir_size = 1
  fixed_rate     = 0.1
  url_path       = "*"
  host           = "*"
  http_method    = "*"
  service_type   = "*"
  service_name   = "*"
  resource_arn   = "*"
}

# Outputs
output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.dashboard_alb.dns_name
}

output "cloudfront_distribution_domain" {
  description = "Domain name of CloudFront distribution"
  value       = aws_cloudfront_distribution.dashboard_assets_distribution.domain_name
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.dashboard_cluster.name
}

output "rds_cluster_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.dashboard_aurora.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.dashboard_redis.primary_endpoint_address
  sensitive   = true
}