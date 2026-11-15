-- Applied to the live project via Supabase MCP guard_protected_note_payloads.
alter table public.note_workspaces add constraint protected_notes_have_no_plaintext
check (not jsonb_path_exists(tabs, '$[*] ? (exists(@.sealed) && (@.text != "" || @.filename != "Locked note" || @.customName != "Locked note" || exists(@.content)))'));
