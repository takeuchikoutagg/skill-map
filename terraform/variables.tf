# 変えられる値。見本は terraform.tfvars.example(使うときは terraform.tfvars にコピーする)。

variable "aws_region" {
  description = "AWS のリージョン(東京だけを使う。docs/06 の 3.1)"
  type        = string
  default     = "ap-northeast-1"
}

variable "my_ip" {
  description = "あなたの IP アドレス(CIDR 形式。例: 203.0.113.1/32)。EC2 の 80 番・22 番を、ここからだけ許可する(docs/07 の C7)"
  type        = string
}

variable "key_pair_name" {
  description = "EC2 に設定する、SSH のキーペアの名前。Terraform では作らない。コンソールで、先に作っておく(docs/07 の P5)"
  type        = string
}

variable "ec2_instance_type" {
  description = "EC2 のインスタンスタイプ(無料利用枠の対象。docs/07 の 1.2)"
  type        = string
  default     = "t3.micro"
}

variable "rds_instance_class" {
  description = "RDS のインスタンスクラス(無料利用枠の対象かは、plan のときに確認する。docs/07 の 1.4)"
  type        = string
  default     = "db.t3.micro"
}

variable "db_username" {
  description = "RDS のユーザー名(backend/config/database.yml の DB_USER に合わせる)"
  type        = string
  default     = "backend"
}

variable "db_password" {
  description = "RDS のパスワード(秘密の値。terraform.tfvars には書かず、apply のときに対話的に入力するか、環境変数 TF_VAR_db_password で渡す)"
  type        = string
  sensitive   = true
}
