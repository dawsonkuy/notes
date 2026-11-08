(() => {
  const SUPABASE_URL = 'https://pskrlifkffcpggcarnon.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ljaQZSpqqx6yFp_GdoaKuQ_gL_bujL6';
  const form = document.getElementById('auth-form');
  const status = document.getElementById('auth-status');
  const sessionPanel = document.getElementById('account-session');
  const password = document.getElementById('auth-password');
  const controls = [...form.querySelectorAll('button'), document.getElementById('sign-out'), document.getElementById('delete-account')];
  const dialog = document.getElementById('login-dialog');
  const loginButton = document.getElementById('open-login');
  loginButton.addEventListener('click', () => {
    dialog.showModal();
    if (!form.hidden) document.getElementById('auth-email').focus();
  });
  document.getElementById('close-login').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  let client;
  const message = text => { status.textContent = text; };
  const busy = value => { controls.forEach(button => { button.disabled = value; }); };
  const renderSession = session => {
    loginButton.textContent = session ? 'Account' : 'Login';
    form.hidden = Boolean(session);
    sessionPanel.hidden = !session;
    document.getElementById('account-email').textContent = session?.user.email || '';
    if (session) {
      password.value = '';
      message('Signed in. Notes autosave to your account.');
    } else {
      message('Sign in or create an account. Notes are saved in this browser.');
    }
  };
  try {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error('Account setup is not complete yet.');
    if (!window.supabase) throw new Error('Unable to load sign-in. Check your connection and reload.');
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.notesClient = client;
    client.auth.onAuthStateChange((_event, session) => renderSession(session));
    client.auth.getSession().then(({ data, error }) => {
      if (error) { renderSession(null); message(error.message); }
      else renderSession(data.session);
    }).catch(() => { renderSession(null); message('Unable to restore your session. Please sign in again.'); });
  } catch (error) {
    message(error.message);
    return;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const signingUp = event.submitter?.id === 'sign-up';
    if (signingUp && password.value.length < 8) {
      message('Choose a password with at least 8 characters.');
      password.focus();
      return;
    }
    busy(true);
    message(signingUp ? 'Creating account…' : 'Signing in…');
    try {
      const credentials = { email: document.getElementById('auth-email').value.trim(), password: password.value };
      const { data, error } = signingUp
        ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: 'https://aesthetic-starlight-a2aad5.netlify.app/' } })
        : await client.auth.signInWithPassword(credentials);
      if (error) throw error;
      password.value = '';
      if (signingUp && !data.session) message('Check your email to confirm your account, then return here to sign in.');
      else { renderSession(data.session); dialog.close(); }
    } catch (error) {
      message(error.message || 'Unable to sign in. Please try again.');
    } finally { busy(false); }
  });
  document.getElementById('sign-out').addEventListener('click', async () => {
    busy(true);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      renderSession(null);
    } catch (error) { message(error.message || 'Unable to sign out. Please try again.'); }
    finally { busy(false); }
  });
  document.getElementById('delete-account').addEventListener('click', async () => {
    if (!confirm('Permanently delete your Bestpad account and all cloud notes, including Trash? This cannot be undone. Guest notes and appearance settings in this browser are kept.')) return;
    busy(true); message('Deleting account…');
    let deleted = false;
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error('Sign in before deleting your account.');
      const userId = sessionData.session.user.id;
      const { data, error } = await client.functions.invoke('delete-account', { body: { confirmation: 'DELETE' } });
      if (error || data?.deleted !== true) throw new Error('Could not delete your account. Check your connection and try again.');
      deleted = true;
      await window.forgetDeletedAccount(userId);
      await client.auth.signOut({ scope: 'local' });
      renderSession(null); message('Your account and cloud notes have been permanently deleted.');
    } catch (error) {
      if (deleted) { await client.auth.signOut({ scope: 'local' }).catch(() => undefined); renderSession(null); message('Account deleted. A local recovery copy could not be removed from this browser.'); }
      else message(error.message || 'Account deletion failed. Please try again.');
    } finally { busy(false); }
  });
})();
