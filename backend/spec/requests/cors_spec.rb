require "rails_helper"

RSpec.describe "CORS", type: :request do
  it "許可したオリジン(既定は http://localhost:3000)には、許可のヘッダーを返す" do
    get "/up", headers: { "Origin" => "http://localhost:3000" }

    expect(response.headers["Access-Control-Allow-Origin"]).to eq("http://localhost:3000")
  end

  it "許可していないオリジンには、許可のヘッダーを返さない" do
    get "/up", headers: { "Origin" => "http://evil.example.com" }

    expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
  end
end
