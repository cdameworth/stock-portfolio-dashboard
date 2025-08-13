# Low-cost configuration for Stock Portfolio Dashboard


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

resource "aws_subnet" "public_subnet_b" {
  vpc_id                  = aws_vpc.dashboard_vpc.id
  cidr_block              = "10.2.2.0/28"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true

  tags = {
    Name = "stock-dashboard-public-b-lowcost"
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

resource "aws_route_table_association" "public_rta_b" {
  subnet_id      = aws_subnet.public_subnet_b.id
  route_table_id = aws_route_table.public_rt.id
}

# Security Groups
resource "aws_security_group" "ecs_sg" {
  name        = "stock-dashboard-ecs-sg-lowcost"
  description = "Security group for ECS tasks"
  vpc_id      = aws_vpc.dashboard_vpc.id

  # Open app port to the internet (no ALB)
  ingress {
    description = "Public HTTP access to app"
    from_port   = var.ecs_container_port
    to_port     = var.ecs_container_port
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
  subnet_ids = [aws_subnet.public_subnet.id, aws_subnet.public_subnet_b.id]

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
  instance_class      = var.db_instance_class
  allocated_storage   = var.db_allocated_storage
  engine               = "postgres"
  username             = var.db_username
  password             = var.db_password
  publicly_accessible  = true
  skip_final_snapshot  = true
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  db_subnet_group_name = aws_db_subnet_group.dashboard_db_subnet_group.name

  tags = {
    Name = "stock-dashboard-db-lowcost"
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
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([
    {
      name  = "stock-dashboard"
      image = "${aws_ecr_repository.stock_dashboard.repository_url}@${data.aws_ecr_image.stock_image.image_digest}"

      portMappings = [
        {
          containerPort = var.ecs_container_port
          hostPort      = var.ecs_container_port
          protocol      = "tcp"
        }
      ]

      runtime_platform = {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

       environment = [
        { name = "NODE_ENV", value = "dev" },
        { name = "STOCK_ANALYTICS_API_URL", value = var.stock_analytics_api_url },
        { name = "DATABASE_URL", value = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.dashboard_db.address}:5432/${var.db_name}" },
        { name = "DB_HOST", value = aws_db_instance.dashboard_db.address },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_NAME", value = var.db_name },
        { name = "DB_USER", value = var.db_username },
        { name = "DB_PASSWORD", value = var.db_password }
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
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.ecs_container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 120
      }
      essential = true
    }
  ])

  tags = {
    Name = "stock-dashboard-task-lowcost"
  }
  depends_on = [null_resource.build_and_push]
}

# ECS Service (single task, public subnet)
resource "aws_ecs_service" "dashboard_service" {
  name            = "stock-dashboard-service-lowcost"
  cluster         = aws_ecs_cluster.dashboard_cluster.id
  task_definition = aws_ecs_task_definition.dashboard_task.arn
  desired_count   = var.ecs_desired_count
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

# CloudWatch Log Group (short retention)
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/stock-dashboard-lowcost"
  retention_in_days = var.log_retention_days

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
    Name = "user-portfolios-lowcost"
  }
}