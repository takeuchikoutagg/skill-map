module Api
  module V1
    class SkillsController < ApplicationController
      # 画面に出す項目(created_at などの、画面に要らないものは返さない)
      RESPONSE_FIELDS = %i[id name note status priority due_date acquired_on position].freeze

      # 編集のリクエストに、編集できる項目が1つもないときの、エラーメッセージ
      NO_EDITABLE_FIELDS_MESSAGE =
        "編集できる項目がありません。スキル名(name)、ポイント・考察(note)、優先度(priority)、期限(due_date)のいずれかを送ってください。".freeze

      # 移動のリクエストに、移動先(状態と位置)が1つもないときの、エラーメッセージ
      NO_DESTINATION_MESSAGE = "移動先が指定されていません。移動先の状態(status)と位置(position)を送ってください。".freeze

      # 並べ替えのリクエストに、並べ替える状態が含まれていないときの、エラーメッセージ
      NO_SORT_STATUS_MESSAGE = "並べ替える状態が指定されていません。状態(status)に unlearned か learning を送ってください。".freeze

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
        render json: { errors: { base: [ NO_EDITABLE_FIELDS_MESSAGE ] } }, status: :bad_request
      end

      # POST /api/v1/skills/sort
      # 未習得か習得中の列を、優先度の高い順(高 → 中 → 低)に並べ替えて、保存する。
      # 同じ優先度は、元の順番を保つ。習得済みの列は、並べ替えできない(422)。
      # 並べ替えたあとの、その列のスキルを返す。
      def sort
        sorter = SkillSorter.new(sort_params[:status])

        if sorter.call
          render json: sorter.skills.as_json(only: RESPONSE_FIELDS)
        else
          render_errors(sorter)
        end
      rescue ActionController::ParameterMissing
        render json: { errors: { base: [ NO_SORT_STATUS_MESSAGE ] } }, status: :bad_request
      end

      # PATCH /api/v1/skills/:id/move
      # スキルを、指定した状態(列)の、指定した位置に移動する(列間の移動と、列内の並び替え)。
      # 並び順の振り直しと、習得日の記録・消去は、SkillMover が行う。
      def move
        skill = Skill.find(params[:id])
        destination = move_params

        if SkillMover.new(skill, status: destination[:status], position: destination[:position]).call
          render json: skill.as_json(only: RESPONSE_FIELDS)
        else
          render_errors(skill)
        end
      rescue ActionController::ParameterMissing
        render json: { errors: { base: [ NO_DESTINATION_MESSAGE ] } }, status: :bad_request
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

      # 並べ替えのときに受け取る項目。並べ替える状態(status)だけ
      def sort_params
        params.expect(skill: %i[status])
      end

      # 移動のときに受け取る項目。移動先の状態(status)と、その列の中での位置(position)だけ
      def move_params
        params.expect(skill: %i[status position])
      end

      # 入力が正しくないときの返事(422)。項目ごとに、日本語のメッセージを返す
      #   { "errors": { "name": ["スキル名を入力してください"] } }
      # errors を持っているものなら、何でも渡せる(Skill、SkillSorter など)
      def render_errors(record)
        errors = record.errors.attribute_names.index_with { |attribute| record.errors.full_messages_for(attribute) }

        render json: { errors: errors }, status: :unprocessable_content
      end
    end
  end
end
