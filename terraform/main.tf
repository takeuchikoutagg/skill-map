# skill-map の AWS リソース(EC2・RDS・セキュリティグループ)。
# サイズ・設定の値は、docs/07-デプロイガイド.md の 4.2 で決めたとおり。
# apply の前に、必ず terraform plan の内容を確認する(1.1.1「無料ゲート」)。

# ---------- 既存の、標準の VPC・サブネットを使う(新しく作らない。docs/07 の 2.4) ----------

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# 無料利用枠の対象の、最新の Amazon Linux 2023(x86_64)。
# AMI 自体に「無料利用枠」の区別はない(対象かどうかは、インスタンスタイプで決まる。docs/07 の 4.6)。
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------- セキュリティグループ(docs/07 の 4.2・2.3) ----------

resource "aws_security_group" "ec2" {
  name = "skill-map-ec2"
  # AWS のセキュリティグループの description は、ASCII 文字だけ(日本語不可。API の制限)
  description = "skill-map EC2: allow HTTP(80)/SSH(22) from my IP only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP from my IP only" # ブラウザで開く。自分の IP だけ
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.my_ip]
  }

  ingress {
    description = "SSH from my IP only" # 作業のために入る。自分の IP だけ
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip]
  }

  egress {
    description = "allow all outbound" # パッケージの取得、RDS への接続など
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "skill-map-ec2"
  }
}

resource "aws_security_group" "rds" {
  name        = "skill-map-rds"
  description = "skill-map RDS: allow MySQL(3306) from the EC2 security group only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "MySQL from the EC2 security group only"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "skill-map-rds"
  }
}

# ---------- RDS(MySQL。docs/07 の 4.2) ----------

# DB サブネットグループは、異なる AZ の、2 つ以上のサブネットが必要(RDS の仕様。
# シングル AZ でも同じ)。標準の VPC は、通常、すべての AZ にサブネットを持つ
resource "aws_db_subnet_group" "this" {
  name       = "skill-map"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "skill-map"
  }
}

resource "aws_db_instance" "this" {
  identifier = "skill-map"

  engine = "mysql"
  # 実際に選べるバージョンか(開発と同じ 8.4 系か)は、plan・コンソールで確認する(docs/07 の 4.6)
  engine_version = "8.4"
  instance_class = var.rds_instance_class

  allocated_storage = 20 # GB(最小)。
  # max_allocated_storage は、意図的に指定しない(未指定 = ストレージの自動スケーリングは無効。docs/07 の 4.2)
  storage_type = "gp2"

  db_name  = "backend_production"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 0     # 自動バックアップを、保持しない(docs/07 の 4.2・1.5)
  skip_final_snapshot     = true  # 削除のとき、最終スナップショットを作らない(docs/07 の 1.5)
  deletion_protection     = false # destroy で、削除できるようにする(docs/07 の 4.2)

  tags = {
    Name = "skill-map-rds"
  }
}

# ---------- EC2(Nginx・Next.js・Rails を動かす、サーバー 1 台。docs/07 の 4.2) ----------

resource "aws_instance" "web" {
  ami           = data.aws_ami.al2023.id
  instance_type = var.ec2_instance_type
  key_name      = var.key_pair_name

  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.ec2.id]
  associate_public_ip_address = true

  # t3 は、既定で CPU クレジットが「無制限」になることがあり、使い続けると追加料金が
  # 発生しうる(一般的な仕組み)。「標準」に固定する(docs/07 の 4.2)
  credit_specification {
    cpu_credits = "standard"
  }

  monitoring = false # 詳細モニタリングは、有料の追加機能なのでオフ(docs/07 の 4.2)

  root_block_device {
    # 30GB(EBS の無料利用枠の上限。docs/07 の 1.4)。8GB では作れなかった: このAMI(AL2023 の
    # 最新版)のスナップショットが、30GB 以上を要求するため(実際に apply して分かった。
    # InvalidBlockDeviceMapping: Volume of size 8GB is smaller than snapshot, expect size >= 30GB)
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true # EC2 を終了すると、ディスクも一緒に消える(docs/07 の 1.5)
  }

  tags = {
    Name = "skill-map-web"
  }
}
