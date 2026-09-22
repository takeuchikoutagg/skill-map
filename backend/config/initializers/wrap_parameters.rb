# `params.expect(skill: [...])`(SkillsController)は、リクエストの中身を、`skill` キーに入れて読む。
# JSON のリクエストは、`ActionController::ParamsWrapper` が、送られてきた中身を、モデルの属性名に合わせて、
# 自動で `skill` キーに包んでくれる(Rails 標準の仕組み)。ここでは、その対象を、明示しておく
# (何を包むかを、モデルの属性名まかせにせず、はっきりさせる。届いた項目名だけを包み、余分な項目は増やさない)。
ActiveSupport.on_load(:action_controller) do
  wrap_parameters :skill, include: %i[name note status priority due_date position]
end
