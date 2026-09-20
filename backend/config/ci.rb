# Run using bin/ci
#
# 一括で検査する(コミットや Pull Request の前に実行する)。
#   docker compose exec web bin/ci
# どれか1つでも失敗すると、失敗として終わる。
#
# 準備(bin/setup)は、Docker の起動時(db:prepare)に済んでいるので、ここには入れていない。

CI.run do
  step "Style: Ruby", "bin/rubocop"

  step "Security: Gem audit", "bin/bundler-audit"
  step "Security: Brakeman code analysis", "bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error"

  step "Test: RSpec", "bundle exec rspec"

  # Optional: set a green GitHub commit status to unblock PR merge.
  # Requires the `gh` CLI and `gh extension install basecamp/gh-signoff`.
  # if success?
  #   step "Signoff: All systems go. Ready for merge and deploy.", "gh signoff"
  # else
  #   failure "Signoff: CI failed. Do not merge or deploy.", "Fix the issues and try again."
  # end
end
