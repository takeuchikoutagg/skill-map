class ApplicationController < ActionController::API
  # 中身(ボディ)のあるリクエストは、JSON だけを受け付ける(415)。
  # フォーム形式(application/x-www-form-urlencoded、multipart/form-data)を許すと、他のサイトに置かれたフォームから、
  # このアプリの API を、CORS の事前確認(プリフライト)を経ずに、呼べてしまう(ブラウザは、フォームの送信を、CORS の対象にしない)。
  # 中身がないリクエスト(削除など)は、形式を問わない。
  before_action :require_json_content_type

  # 送られてきたデータの形が正しくないとき(必要な項目がない、JSON として読めない)は、400 を返す
  rescue_from ActionController::ParameterMissing,
              ActionDispatch::Http::Parameters::ParseError do
    render json: { errors: { base: [ "リクエストの形が正しくありません。スキルの内容を JSON で送ってください。" ] } },
           status: :bad_request
  end

  # 同時の操作で、ロックを待ちきれなかった・デッドロックになったときは、503 を返す(少し待てば、やり直せる)。
  # (BoardLock が、デッドロックは、何度かやり直す。それでもだめだった場合)
  rescue_from ActiveRecord::Deadlocked, ActiveRecord::LockWaitTimeout do
    response.set_header("Retry-After", "1")
    render json: { errors: { base: [ "サーバーが混み合っています。少し待ってから、もう一度お試しください。" ] } },
           status: :service_unavailable
  end

  # 指定された ID のスキルがないときは、404 を返す
  rescue_from ActiveRecord::RecordNotFound do
    render json: { errors: { base: [ "指定されたスキルが見つかりません。" ] } }, status: :not_found
  end

  private

  def require_json_content_type
    return if request.get? || request.content_length.to_i.zero?
    return if request.media_type == "application/json"

    render json: { errors: { base: [ "リクエストの形式が正しくありません。Content-Type に application/json を指定してください。" ] } },
           status: :unsupported_media_type
  end
end
