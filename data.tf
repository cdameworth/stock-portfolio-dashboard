# Get ECR auth
data "aws_ecr_authorization_token" "ecr" {}

# Null-resource build (fixed region usage)
data "aws_region" "current" {}

# Read the pushed image digest so the task definition changes each push
data "aws_ecr_image" "stock_image" {
  repository_name = aws_ecr_repository.stock_dashboard.name
  image_tag       = var.image_tag
  depends_on      = [null_resource.build_and_push]
}