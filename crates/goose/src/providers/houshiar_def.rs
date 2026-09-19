use anyhow::Result;
use futures::future::BoxFuture;

use crate::{
    config::Config, providers::base::ProviderDef, session_context::session_id_request_builder,
};
use goose_providers::{
    anthropic::{AnthropicProvider, AnthropicProviderBuilder},
    api_client::{ApiClient, AuthMethod},
    base::{ConfigKey, ModelInfo, ProviderDescriptor, ProviderMetadata},
    formats::anthropic::AnthropicFormatOptions,
};

pub const HOUSHIAR_PROVIDER_NAME: &str = "houshiar";
pub const HOUSHIAR_DEFAULT_MODEL: &str = "claude-sonnet-5";
pub const HOUSHIAR_BASE_URL: &str = "https://wqai.morvism.ir";
pub const HOUSHIAR_API_VERSION: &str = "2023-06-01";
pub const HOUSHIAR_CLIENT_BRAND: &str = "houshiar-code";

pub struct HoushiarProviderDef;

impl ProviderDescriptor for HoushiarProviderDef {
    fn metadata() -> ProviderMetadata {
        let models: Vec<ModelInfo> =
            vec![ModelInfo::new(HOUSHIAR_DEFAULT_MODEL).with_context_limit(200_000)];

        ProviderMetadata::with_models(
            HOUSHIAR_PROVIDER_NAME,
            "Houshiar",
            "Houshiar Code AI Provider",
            HOUSHIAR_DEFAULT_MODEL,
            models,
            HOUSHIAR_BASE_URL,
            vec![ConfigKey::new("HOUSHIAR_API_KEY", true, true, None, true)],
        )
        .with_setup(
            crate::providers::catalog::ProviderSetupMetadata::api_key(
                crate::providers::catalog::ProviderSetupGroup::Default,
            )
            .with_docs_url(HOUSHIAR_BASE_URL),
        )
    }
}

impl ProviderDef for HoushiarProviderDef {
    type Provider = AnthropicProvider;

    fn from_env(
        _extensions: Vec<crate::config::ExtensionConfig>,
        tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>> {
        Box::pin(from_env(tls_config))
    }
}

async fn from_env(
    tls_config: Option<crate::providers::api_client::TlsConfig>,
) -> Result<AnthropicProvider> {
    let config = Config::global();
    let api_key: String = config
        .get_secret("HOUSHIAR_API_KEY")
        .or_else(|_| config.get_secret("CUSTOM_HOUSHIAR_API_KEY"))?;
    let host = HOUSHIAR_BASE_URL.to_string();
    let timeout_secs = crate::providers::base::DEFAULT_PROVIDER_TIMEOUT_SECS;

    let format_options = AnthropicFormatOptions::native();

    let auth = AuthMethod::ApiKey {
        header_name: "x-api-key".to_string(),
        key: api_key,
    };

    let api_client = ApiClient::with_timeout_and_tls(
        host,
        auth,
        std::time::Duration::from_secs(timeout_secs),
        tls_config,
    )?
    .with_request_builder(session_id_request_builder())
    .with_header("anthropic-version", HOUSHIAR_API_VERSION)?
    .with_header("x-client-brand", HOUSHIAR_CLIENT_BRAND)?;

    Ok(AnthropicProviderBuilder::new(api_client)
        .name(HOUSHIAR_PROVIDER_NAME)
        .custom_models(Some(vec![ModelInfo::new(HOUSHIAR_DEFAULT_MODEL)]))
        .dynamic_models(Some(true))
        .skip_canonical_filtering(true)
        .format_options(format_options)
        .build())
}
