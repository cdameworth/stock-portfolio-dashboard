# ECR repository
resource "aws_ecr_repository" "stock_dashboard" {
  name = "stock-portfolio-dashboard"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = { Name = "stock-portfolio-dashboard" }
}

data "aws_caller_identity" "current" {}

resource "null_resource" "build_and_push" {
  triggers = {
    source_sha = local.app_source_sha     # rebuild on any app change
    image_tag  = var.image_tag            # rebuild when tag changes
    dockerfile_hash = filesha256("${path.module}/application/Dockerfile")
    package_json    = filesha256("${path.module}/application/package.json")
    package_lock    = filesha256("${path.module}/application/package-lock.json")
  }

  provisioner "local-exec" {
    environment = {
      AWS_PROFILE        = "stock-portfolio-admin"
      AWS_REGION         = data.aws_region.current.name
      AWS_DEFAULT_REGION = data.aws_region.current.name
    }
    command = <<EOF
set -euo pipefail
REGION="${data.aws_region.current.name}"
REPO_URL="${aws_ecr_repository.stock_dashboard.repository_url}"

aws ecr describe-repositories --repository-name ${aws_ecr_repository.stock_dashboard.name} --region "$REGION" --profile "$AWS_PROFILE" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name ${aws_ecr_repository.stock_dashboard.name} --region "$REGION" --profile "$AWS_PROFILE"

aws ecr get-login-password --region "$REGION" --profile "$AWS_PROFILE" | docker login --username AWS --password-stdin "$REPO_URL"

# Ensure a multi-arch builder using docker-container driver
docker buildx create --name multi-builder --driver docker-container >/dev/null 2>&1 || true
docker buildx use multi-builder
docker buildx inspect --bootstrap

# Build and push a manifest list for amd64+arm64
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "$REPO_URL:latest" \
  -t "$REPO_URL:${var.image_tag}" \
  --push "${path.module}/application"

# Verify platforms
docker buildx imagetools inspect "$REPO_URL:${var.image_tag}" || true
EOF
  }
}