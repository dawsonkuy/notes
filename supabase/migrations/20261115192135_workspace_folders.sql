-- Applied to the live project via Supabase MCP add_workspace_folders.
alter table public.note_workspaces add column if not exists folders jsonb not null default '[]'::jsonb;
