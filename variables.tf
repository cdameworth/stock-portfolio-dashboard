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

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS in GB"
  type        = number
}

variable "db_username" {
  description = "Database admin username"
  type        = string
}

variable "db_password" {
  description = "Database admin password"
  type        = string
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = string
}

variable "ecs_memory" {
  description = "ECS task memory"
  type        = string
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
}

variable "ecs_container_port" {
  description = "Container port"
  type        = number
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
}

variable "stock_analytics_api_url" {
  description = "Stock analytics API URL"
  type        = string
  default     = "https://your-stock-api.example.com"
}

variable "image_tag" {
  description = "Image tag to build and deploy (e.g., git SHA)"
  type        = string
  default     = "latest"
}