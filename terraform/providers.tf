# Terraform 本体と、AWS プロバイダーの設定。
# state ファイルは、既定(backend を指定しない = ローカルの terraform.tfstate)のまま使う。
# リモートバックエンド(S3 など)は、使わない(docs/07-デプロイガイド.md の 1.1.1)。

terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
