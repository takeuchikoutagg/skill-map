class ApplicationController < ActionController::API
  # 送られてきたデータの形が正しくないとき(必要な項目がない、JSON として読めない)は、400 を返す
  rescue_from ActionController::ParameterMissing,
              ActionDispatch::Http::Parameters::ParseError do
    render json: { errors: { base: [ "リクエストの形が正しくありません。スキルの内容を JSON で送ってください。" ] } },
           status: :bad_request
  end

  # 指定された ID のスキルがないときは、404 を返す
  rescue_from ActiveRecord::RecordNotFound do
    render json: { errors: { base: [ "指定されたスキルが見つかりません。" ] } }, status: :not_found
  end
end
