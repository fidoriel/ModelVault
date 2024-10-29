use axum::Json;
use axum::{
    extract::Path,
    extract::{DefaultBodyLimit, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_async::pooled_connection::bb8::Pool;
use diesel_async::pooled_connection::AsyncDieselConnectionManager;
use diesel_async::pooled_connection::ManagerConfig;
use diesel_async::sync_connection_wrapper::SyncConnectionWrapper;
use diesel_async::{AsyncConnection, RunQueryDsl};
use diesel_migrations::MigrationHarness;
use diesel_migrations::{embed_migrations, EmbeddedMigrations};
use serde_derive::{Deserialize, Serialize};
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::{debug, error, info};
use tracing_subscriber::EnvFilter;
use types::{DetailedModelResponse, ModelResponseList};

pub mod parse_library;
pub mod schema;
pub mod stream_dl;
pub mod types;
pub mod upload;
use crate::schema::models3d;
use crate::types::Model3D;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Config {
    libraries_path: PathBuf,
    #[serde(default = "default_log_level")]
    log_level: String,
    data_dir: PathBuf,
    #[serde(default = "default_host")]
    host: String,
    #[serde(default = "default_port")]
    port: String,
    #[serde(default = "default_asset_prefix")]
    asset_prefix: String,
    #[serde(default = "default_cache_prefix")]
    cache_prefix: String,
    #[serde(skip_deserializing)]
    database_url: PathBuf,
    #[serde(skip_deserializing)]
    upload_cache: PathBuf,
    #[serde(skip_deserializing)]
    preview_cache_dir: PathBuf,
    #[serde(skip_deserializing)]
    address: String,
}

fn default_host() -> String {
    "localhost".to_string()
}

fn default_port() -> String {
    "51100".to_string()
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_asset_prefix() -> String {
    "/3d".to_string()
}

fn default_cache_prefix() -> String {
    "/cache".to_string()
}

impl Config {
    fn initialize(&mut self) {
        self.database_url = self.data_dir.join("db.sqlite3");
        self.preview_cache_dir = self.data_dir.join("preview_cache");
        self.address = format!("{}:{}", self.host, self.port);
        self.upload_cache = self.data_dir.join("upload_cache");
    }
}

fn parse_config() -> Config {
    let mut init_config = match envy::from_env::<Config>() {
        Result::Ok(config) => config,
        Err(error) => panic!("{:#?}", error),
    };
    init_config.initialize();
    init_config
}

#[derive(Clone)]
pub struct AppState {
    config: Config,
    pool: Pool<SyncConnectionWrapper<SqliteConnection>>,
}

async fn healthz() -> impl IntoResponse {
    (StatusCode::OK, "Done".to_string())
}

async fn get_model_by_slug(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> impl IntoResponse {
    let mut connection = state.pool.get().await.unwrap();

    let result = models3d::dsl::models3d
        .filter(models3d::dsl::name.eq(slug))
        .first::<Model3D>(&mut connection)
        .await
        .unwrap();
    let response = DetailedModelResponse::from_model_3d(&result, &state.config, &mut connection)
        .await
        .unwrap();
    (StatusCode::OK, Json(response))
}

async fn handle_refresh(State(state): State<AppState>) -> impl IntoResponse {
    parse_library::refresh_library(state.pool, state.config.clone())
        .await
        .unwrap();

    (StatusCode::OK, "Done".to_string())
}

async fn list_models(State(state): State<AppState>) -> impl IntoResponse {
    let mut connection = state.pool.get().await.unwrap();

    let all_models = models3d::dsl::models3d
        .load::<Model3D>(&mut connection)
        .await
        .unwrap();
    let response = ModelResponseList::from_model_3d(all_models, &state.config, &mut connection)
        .await
        .unwrap();

    (StatusCode::OK, Json(response))
}

async fn handle_zip_download(
    State(state): State<AppState>,
    Path(folder_path): Path<String>,
) -> impl IntoResponse {
    let mut path = state.config.libraries_path.clone();
    path.push(folder_path);
    stream_dl::zip_folder_stream(path, &state.config).await
}

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("./migrations");

async fn get_connection_pool(config: &Config) -> Pool<SyncConnectionWrapper<SqliteConnection>> {
    let mut db_config = ManagerConfig::default();
    db_config.custom_setup =
        Box::new(|url| SyncConnectionWrapper::<SqliteConnection>::establish(url));
    let mgr =
        AsyncDieselConnectionManager::<SyncConnectionWrapper<SqliteConnection>>::new_with_config(
            config.database_url.to_str().unwrap(),
            db_config,
        );

    Pool::builder().max_size(10).build(mgr).await.unwrap()
}

fn migrate(config: &Config) {
    let mut connection =
        SqliteConnection::establish(config.database_url.to_str().expect("Invalid Path"))
            .unwrap_or_else(|_| panic!("Error connecting to {}", config.database_url.display()));

    info!("DB connection established successfully");
    info!("Please wait while DB is migrating");

    connection
        .run_pending_migrations(MIGRATIONS)
        .unwrap_or_else(|e| panic!("Error running migrations: {}", e));

    info!("Migrations completed successfully");
}

async fn fallback_404() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "404 Not Found")
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let config = parse_config();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new(config.log_level.clone()))
        .init();

    match serde_json::to_string(&config) {
        Ok(json) => debug!("Config: {}", json),
        Err(e) => error!("Failed to serialize config: {}", e),
    }

    migrate(&config);

    let pool = get_connection_pool(&config).await;

    let app_state = AppState {
        config: config.clone(),
        pool,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api = Router::new()
        .route("/refresh", post(handle_refresh))
        .route("/models/list", get(list_models))
        .route("/model/:slug", get(get_model_by_slug))
        .route("/download/:folder", get(handle_zip_download))
        .route("/upload", post(upload::handle_upload))
        .layer(DefaultBodyLimit::disable())
        .with_state(app_state);

    let app = Router::new()
        .route("/healthz", get(healthz))
        .nest("/api/", api)
        .nest_service(
            &config.asset_prefix.to_string(),
            ServeDir::new(config.libraries_path),
        )
        .nest_service(
            &config.cache_prefix.to_string(),
            ServeDir::new(config.preview_cache_dir),
        )
        .nest_service("/", ServeDir::new("dist")) // deliver vite bundle
        .fallback(fallback_404)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(&config.address.to_string())
        .await
        .unwrap();

    info!("Server running on {}", config.address);

    axum::serve(listener, app).await.unwrap();
}
