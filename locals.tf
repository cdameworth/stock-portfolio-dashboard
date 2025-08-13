locals {
  app_dir       = "${path.module}/application"
  app_files     = fileset(local.app_dir, "**")
  app_source_sha = sha256(join("", [for f in sort(local.app_files) : filesha256("${local.app_dir}/${f}")]))
}