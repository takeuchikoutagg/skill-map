module Api
  module V1
    class SkillsController < ApplicationController
      # 画面に出す項目(created_at などの、画面に要らないものは返さない)
      RESPONSE_FIELDS = %i[id name note status priority due_date acquired_on position].freeze

      # 編集のリクエストに、編集できる項目が1つもないときの、エラーメッセージ
      NO_EDITABLE_FIELDS_MESSAGE =
        "編集できる項目がありません。スキル名(name)、ポイント・考察(note)、優先度(priority)、期限(due_date)のいずれかを送ってください。".freeze

      # GET /api/v1/skills
      # すべてのスキルを、状態(未習得 → 習得中 → 習得済み)、並び順の順に返す。
      # 画面側で、状態ごとに列へ分ける。
      def index
        skills = Skill.order(:status, :position, :id)

        render json: skills.as_json(only: RESPONSE_FIELDS)
      end

      # POST /api/v1/skills
      # スキルを追加する。追加したスキルは、指定した状態の列の末尾に置く。
      # 習得済みの列には、直接追加できない(習得済みにするには、追加したあとに移動する)。
      def create
        skill = Skill.new(create_params)

        if skill.mastered?
          skill.errors.add(:base, "習得済みの列には、スキルを直接追加できません。未習得か習得中に追加してから、移動してください。")
          return render_errors(skill)
        end

        # 並び順の決定と保存は、まとめて行う(途中で失敗したら、どちらもなかったことにする)
        saved = Skill.transaction do
          skill.position = Skill.statuses.key?(skill.status) ? Skill.next_position(skill.status) : 0
          skill.save
        end

        if saved
          render json: skill.as_json(only: RESPONSE_FIELDS), status: :created
        else
          render_errors(skill)
        end
      end

      # PATCH /api/v1/skills/:id
      # スキルを編集する。送られた項目だけを更新する(送られなかった項目は、変えない)。
      # 習得日・状態・並び順は、ここでは変えられない(状態と並び順は、移動の API で変える)。
      def update
        skill = Skill.find(params[:id])

        if skill.update(update_params)
          render json: skill.as_json(only: RESPONSE_FIELDS)
        else
          render_errors(skill)
        end
      rescue ActionController::ParameterMissing
        # 編集できる項目が1つも含まれていない(空のリクエスト、状態や習得日だけ、など)
        render json: { errors: { base: [NO_EDITABLE_FIELDS_MESSAGE] } }, status: :bad_request
      end

      # DELETE /api/v1/skills/:id
      # スキルを削除し、同じ状態の列の並び順を詰める(0 から連番に振り直す)。
      # 削除と振り直しは、まとめて行う(途中で失敗したら、削除もなかったことにする)。
      def destroy
        skill = Skill.find(params[:id])

        Skill.transaction do
          skill.destroy!
          Skill.renumber_positions(skill.status)
        end

        head :no_content
      end

      private

      # 追加のときに受け取る項目。習得日(acquired_on)と並び順(position)は、サーバーが決めるので、受け取らない
      def create_params
        params.expect(skill: %i[name note status priority due_date])
      end

      # 編集のときに受け取る項目。状態(status)は、追加のときと違い、受け取らない
      def update_params
        params.expect(skill: %i[name note priority due_date])
      end

      # 入力が正しくないときの返事(422)。項目ごとに、日本語のメッセージを返す
      #   { "errors": { "name": ["スキル名を入力してください"] } }
      def render_errors(skill)
        errors = skill.errors.attribute_names.index_with { |attribute| skill.errors.full_messages_for(attribute) }

        render json: { errors: errors }, status: :unprocessable_content
      end
    end
  end
end
