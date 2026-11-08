import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createDeleteAccountHandler } from './handler.ts';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createDeleteAccountHandler({
  async authenticate(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id || null;
  },
  async deleteUser(userId) {
    // note_workspaces.user_id has ON DELETE CASCADE: deleting Auth also removes cloud notes.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  },
}));
