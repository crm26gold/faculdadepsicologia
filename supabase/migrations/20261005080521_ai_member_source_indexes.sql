-- Cover both foreign keys so credential revocation does not scan every approved source.
create index ai_member_base_sources_connection_id_idx on private.ai_member_base_sources(connection_id);
create index ai_member_base_sources_provider_idx on private.ai_member_base_sources(provider);
