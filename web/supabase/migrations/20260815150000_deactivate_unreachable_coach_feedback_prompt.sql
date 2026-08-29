begin;

-- Launch-Readiness-Audit, Befund J: coach_feedback war aktiv und befüllt, aber der einzige
-- Aufrufer (generateCoachReply in src/services/ai/orchestrator.ts) wurde von nirgendwo im
-- Projekt importiert. Der Code ist entfernt; der Prompt wird deaktiviert statt gelöscht, damit
-- die Historie im Backup/Restore-Pfad (Befund E) erhalten bleibt.
update public.prompt_definitions
set is_active = false,
    updated_at = timezone('utc', now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deactivated_reason', 'befund_j_unreachable_dead_code_caller_removed',
      'deactivated_at', timezone('utc', now())
    )
where prompt_key = 'coach_feedback' and is_active = true;

commit;
