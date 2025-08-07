# Low-cost configuration for Stock Portfolio Dashboard

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "stock-portfolio-dashboard"
      Environment = "dev"
      Team        = "frontend-platform"
      CostCenter  = "web-applications"
      Owner       = "frontend-team@company.com"
    }
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "container_image" {
  description = "Container image for the dashboard application"
  type        = string
  default     = "stock-portfolio-dashboard:latest"
}

# Single VPC and one public subnet (no NAT, no private subnets)
resource "aws_vpc" "dashboard_vpc" {
  cidr_block           = "10.2.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "stock-dashboard-vpc-lowcost"
  }
}

resource "aws_subnet" "public_subnet" {
  vpc_id                  = aws_vpc.dashboard_vpc.id
  cidr_block              = "10.2.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "stock-dashboard-public-lowcost"
  }
}

resource "aws_internet_gateway" "dashboard_igw" {
  vpc_id = aws_vpc.dashboard_vpc.id

  tags = {
    Name = "stock-dashboard-igw-lowcost"
  }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.dashboard_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.dashboard_igw.id
  }

  tags = {
    Name = "stock-dashboard-public-rt-lowcost"
  }
}

resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public_rt.id
}

# Security Groups
resource "aws_security_group" "alb_sg" {
  name        = "stock-dashboard-alb-sg-lowcost"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.dashboard_vpc.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
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
    Name = "stock-dashboard-alb-sg-lowcost"
  }
}

resource "aws_security_group" "ecs_sg" {
  name        = "stock-dashboard-ecs-sg-lowcost"
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
    Name = "stock-dashboard-ecs-sg-lowcost"
  }
}

# S3 Bucket (single, no versioning, no CloudFront)
resource "aws_s3_bucket" "dashboard_assets" {
  bucket = "stock-dashboard-assets-lowcost-${random_id.bucket_suffix.hex}"

  tags = {
    Name = "dashboard-assets-lowcost"
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# RDS PostgreSQL (single db.t3.micro, no cluster)
resource "aws_db_subnet_group" "dashboard_db_subnet_group" {
  name       = "stock-dashboard-db-subnet-group-lowcost"
  subnet_ids = [aws_subnet.public_subnet.id]

  tags = {
    Name = "stock-dashboard-db-subnet-group-lowcost"
  }
}

resource "aws_security_group" "rds_sg" {
  name        = "stock-dashboard-rds-sg-lowcost"
  description = "Security group for RDS"
  vpc_id      = aws_vpc.dashboard_vpc.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_sg.id]
  }

  tags = {
    Name = "stock-dashboard-rds-sg-lowcost"
  }
}

resource "aws_db_instance" "dashboard_db" {
  allocated_storage    = 20
  engine               = "postgres"
  instance_class       = "db.t3.micro"
  name                 = "dashboard"
  username             = "dashboardadmin"
  password             = "changeme123"
  publicly_accessible  = true
  skip_final_snapshot  = true
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  db_subnet_group_name = aws_db_subnet_group.dashboard_db_subnet_group.name

  tags = {
    Name = "stock-dashboard-db-lowcost"
  }
}

# ElastiCache Redis (single node, smallest type)
resource "aws_elasticache_subnet_group" "dashboard_redis_subnet_group" {
  name       = "stock-dashboard-redis-subnet-group-lowcost"
  subnet_ids = [aws_subnet.public_subnet.id]

  tags = {
    Name = "stock-dashboard-redis-subnet-group-lowcost"
  }
}

resource "aws_security_group" "redis_sg" {
  name        = "stock-dashboard-redis-sg-lowcost"
  description = "Security group for Redis"
  vpc_id      = aws_vpc.dashboard_vpc.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_sg.id]
  }

  tags = {
    Name = "stock-dashboard-redis-sg-lowcost"
  }
}

resource "aws_elasticache_cluster" "dashboard_redis" {
  cluster_id           = "stock-dashboard-redis-lowcost"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.dashboard_redis_subnet_group.name
  security_group_ids   = [aws_security_group.redis_sg.id]

  tags = {
    Name = "stock-dashboard-redis-lowcost"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "dashboard_cluster" {
  name = "stock-dashboard-cluster-lowcost"
}

# ECS Task Definition (smallest Fargate)
resource "aws_iam_role" "ecs_execution_role" {
  name = "stock-dashboard-ecs-execution-role-lowcost"

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
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "dashboard_task" {
  family                   = "stock-dashboard-task-lowcost"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

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
          value = "dev"
        },
        {
          name  = "REDIS_ENDPOINT"
          value = aws_elasticache_cluster.dashboard_redis.cache_nodes[0].address
        },
        {
          name  = "DATABASE_URL"
          value = "postgresql://dashboardadmin:changeme123@${aws_db_instance.dashboard_db.address}:5432/dashboard"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/stock-dashboard-lowcost"
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
    Name = "stock-dashboard-task-lowcost"
  }
}

# ECS Service (single task, public subnet)
resource "aws_ecs_service" "dashboard_service" {
  name            = "stock-dashboard-service-lowcost"
  cluster         = aws_ecs_cluster.dashboard_cluster.id
  task_definition = aws_ecs_task_definition.dashboard_task.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.public_subnet.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = true
  }

  tags = {
    Name = "stock-dashboard-service-lowcost"
  }
}

# Application Load Balancer (optional, can be removed for direct ECS access)
resource "aws_lb" "dashboard_alb" {
  name               = "stock-dashboard-alb-lowcost"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = [aws_subnet.public_subnet.id]

  enable_deletion_protection = false

  tags = {
    Name = "stock-dashboard-alb-lowcost"
  }
}

resource "aws_lb_target_group" "dashboard_tg" {
  name        = "stock-dashboard-tg-lowcost"
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
    Name = "stock-dashboard-tg-lowcost"
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
    Name = "dashboard-listener-lowcost"
  }
}

# CloudWatch Log Group (short retention)
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/stock-dashboard-lowcost"
  retention_in_days = 3

  tags = {
    Name = "ecs-logs-lowcost"
  }
}

# DynamoDB (keep only if needed, on-demand)
resource "aws_dynamodb_table" "user_portfolios" {
  name         = "user-portfolios-lowcost"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "portfolio_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "portfolio_id"
    type = "S"
  }

  tags = {
    Name = "user-portfolios-