module Api
  module V1
    class SkillsController < ApplicationController
      # 画面に出す項目(created_at などの、画面に要らないものは返さない)
      RESPONSE_FIELDS = %i[id name note status priority due_date acquired_on position].freeze

      # GET /api/v1/skills
      # すべてのスキルを、状態(未習得 → 習得中 → 習得済み)、並び順の順に返す。
      # 画面側で、状態ごとに列へ分ける。
      def index
        skills = Skill.order(:status, :position, :id)

        render json: skills.as_json(only: RESPONSE_FIELDS)
      end
    end
  end
end
