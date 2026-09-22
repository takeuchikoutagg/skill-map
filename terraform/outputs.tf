# apply のあとに、知りたい値(どちらも、秘密ではない。docs/07 の 2.4)。

output "ec2_public_dns" {
  description = "EC2 のパブリック DNS(ブラウザで開くアドレス。P7 で使う)"
  value       = aws_instance.web.public_dns
}

output "rds_endpoint" {
  description = "RDS のエンドポイント(ホスト名だけ。Rails の DB_HOST に使う)"
  value       = aws_db_instance.this.address
}
