Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # API(docs/02-機能要件.md の API 一覧)。URL は /api/v1/... になる
  namespace :api do
    namespace :v1 do
      resources :skills, only: [:index, :create]   # GET /api/v1/skills、POST /api/v1/skills
    end
  end

  # Defines the root path route ("/")
  # root "posts#index"
end
