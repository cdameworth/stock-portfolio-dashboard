provider "aws" {
  region  = var.aws_region
  profile = "stock-portfolio-admin"

  default_tags {
    tags = {
      Application = "stock-portfolio-dashboard"
      Environment = "dev"
      Team        = "frontend-platform"
      CostCenter  = "web-applications"
      Owner       = "stock-portfolio-admin@overwatch-observability.com"
    }
  }
}

# Docker provider (uses local Docker daemon)
provider "docker" {
  registry_auth {
    address  = aws_ecr_repository.stock_dashboard.repository_url
    username = data.aws_ecr_authorization_token.ecr.user_name
    password = data.aws_ecr_authorization_token.ecr.password
  }
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
  #required_version = ">= 1.6.0"
}