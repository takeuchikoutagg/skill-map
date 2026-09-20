require "rails_helper"

RSpec.describe "ヘルスチェック", type: :request do
  it "GET /up が 200 を返す" do
    get "/up"

    expect(response).to have_http_status(:ok)
  end
end
