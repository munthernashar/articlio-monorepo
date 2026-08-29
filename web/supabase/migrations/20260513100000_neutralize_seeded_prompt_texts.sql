begin;

-- Betriebsmodell: produktive Prompttexte werden ausschließlich über Admin/DB gepflegt,
-- nicht über statische Repo-Seeds oder historische Seed-Migrationen.
update public.prompt_definitions
set
  system_prompt = '',
  developer_prompt = '',
  user_prompt_template = '',
  is_active = false,
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'seed_content_neutralized', true,
      'seed_content_neutralized_at', timezone('utc', now()),
      'seed_content_policy', 'runtime_prompts_managed_via_admin_db_only'
    ),
  updated_at = timezone('utc', now())
where
  metadata->>'source' = 'supabase_prompt_library'
  or metadata ? 'pipeline_step';

commit;
