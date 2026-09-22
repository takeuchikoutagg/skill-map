class ApplicationController < ActionController::API
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
end
