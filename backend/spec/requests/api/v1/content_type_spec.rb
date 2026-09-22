require "rails_helper"

# 中身(ボディ)のあるリクエストは、JSON だけを受け付ける(application_controller.rb の require_json_content_type)。
# フォーム形式を許すと、他のサイトのフォームから、CORS の事前確認を経ずに、呼べてしまう(M3)。
RSpec.describe "Content-Type の制限(JSON 以外は 415)", type: :request do
  let!(:skill) { Skill.create!(name: "A", status: :unlearned, position: 0) }

  it "JSON で送れば、これまでどおり、受け付ける" do
    post "/api/v1/skills", params: { skill: { name: "B", status: "unlearned" } }.to_json, headers: { "CONTENT_TYPE" => "application/json" }

    expect(response).to have_http_status(:created)
  end

  it "フォーム形式(application/x-www-form-urlencoded)は、415 で拒否する。スキルは、作られない" do
    expect do
      post "/api/v1/skills", params: { skill: { name: "B", status: "unlearned" } }
    end.not_to change(Skill, :count)

    expect(response).to have_http_status(:unsupported_media_type)
    expect(response.parsed_body["errors"]["base"]).to be_present
  end

  it "multipart/form-data(ファイルの送信などで使う形式)も、415 で拒否する" do
    body = "------x\r\nContent-Disposition: form-data; name=\"skill[name]\"\r\n\r\nB\r\n------x--\r\n"

    post "/api/v1/skills", params: body, headers: { "CONTENT_TYPE" => "multipart/form-data; boundary=----x" }

    expect(response).to have_http_status(:unsupported_media_type)
  end

  it "PATCH(編集・移動)も、同じく、フォーム形式は拒否する" do
    patch "/api/v1/skills/#{skill.id}", params: { skill: { name: "変更" } }

    expect(response).to have_http_status(:unsupported_media_type)
    expect(skill.reload.name).to eq("A")
  end

  it "POST /skills/sort も、同じく、フォーム形式は拒否する" do
    post "/api/v1/skills/sort", params: { skill: { status: "unlearned" } }

    expect(response).to have_http_status(:unsupported_media_type)
  end

  it "中身のない DELETE は、Content-Type を問わない(これまでどおり、削除できる)" do
    delete "/api/v1/skills/#{skill.id}"

    expect(response).to have_http_status(:no_content)
  end

  it "中身のない GET(一覧の取得)は、Content-Type を問わない" do
    get "/api/v1/skills"

    expect(response).to have_http_status(:ok)
  end

  it "GET に、JSON でない中身が付いていても、拒否しない(GET は、常に対象外)" do
    # ふつうの GET(ブラウザ・fetch)には、中身(ボディ)が付かない。ただし `curl -X GET --data ...` のように、
    # わざと GET に中身を付けて送ることもできる。その場合でも、GET は、拒否の対象にしない。
    # (rack-test の `get` ヘルパーは、GET の中身を、URL のクエリ文字列に変えてしまい、本物の「中身つきの GET」を作れないため、
    #  Rack のアプリを、直接呼び出す)
    env = Rack::MockRequest.env_for("/api/v1/skills", method: "GET", input: "not json", "CONTENT_TYPE" => "text/plain")

    status, = Rails.application.call(env)

    expect(status).to eq(200)
  end

  it "拒否されたときのエラーの形は、ほかの失敗と同じ(errors.base)" do
    post "/api/v1/skills", params: { skill: { name: "B", status: "unlearned" } }

    expect(response.parsed_body).to eq("errors" => { "base" => [ "リクエストの形式が正しくありません。Content-Type に application/json を指定してください。" ] })
  end
end
