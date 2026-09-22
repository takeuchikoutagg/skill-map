# terraform/

skill-map の AWS(EC2・RDS・セキュリティグループ)を作る、Terraform のコードです。

- 手順・安全のルール(特に「無料ゲート」)は、[docs/07-デプロイガイド.md](../docs/07-デプロイガイド.md) を参照してください。**`terraform apply`・`terraform destroy` の前には、必ず `terraform plan` の内容を確認します。**
- state ファイル(`terraform.tfstate`)は、**ローカルにだけ**置きます(`.gitignore`。Git には入りません)。**消さない・別の場所に移さない**でください。

## 使い方

```bash
# 1. 変数の見本を、実際のファイルにコピーする(初めてのときだけ)
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を開いて、my_ip・key_pair_name を埋める

# 2. 初期化(初めてのときだけ)
terraform init

# 3. 構文チェック(AWS の認証情報は、不要)
terraform validate
terraform fmt -check

# 4. 何が作られるかを確認(何も作らない。AWS の認証情報が要る)
terraform plan

# 5. 実際に作る(db_password は、対話的に入力するか、環境変数で渡す)
TF_VAR_db_password="..." terraform apply

# 6. 後片付け: 何が消えるかを確認してから、実際に消す
terraform plan -destroy
terraform destroy
```

## よく使うコマンド

| したいこと | コマンド |
|---|---|
| 初期化(初めてのときだけ) | `terraform init` |
| 構文チェック | `terraform validate` |
| 書式チェック | `terraform fmt -check`(自動で直すなら `terraform fmt`) |
| 何が作られる・変わる・消えるかを確認(何もしない) | `terraform plan` |
| 実際に作る・変える | `terraform apply` |
| 何が消えるかを確認(何もしない) | `terraform plan -destroy` |
| 実際に消す | `terraform destroy` |

## ファイル

| ファイル | 内容 |
|---|---|
| `providers.tf` | Terraform 本体・AWS プロバイダーの設定(リージョンなど) |
| `variables.tf` | 変えられる値(`terraform.tfvars` で、実際の値を渡す) |
| `main.tf` | 作るもの: セキュリティグループ 2 つ、RDS、EC2 |
| `outputs.tf` | 作ったあとに分かる値: EC2 のパブリック DNS、RDS のエンドポイント |
| `terraform.tfvars.example` | 変数の見本(秘密の値は入れない) |

## AWS の認証情報

Terraform が AWS を操作するための、専用の IAM ユーザー(最小限の権限)のアクセスキーを、環境変数で渡します(docs/07 の C10)。

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
```

**ルートユーザーの認証情報は、使いません。** アクセスキーは、コードにも、`terraform.tfvars` にも、書きません。
