(() => {
  const SUPABASE_URL = 'https://pskrlifkffcpggcarnon.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ljaQZSpqqx6yFp_GdoaKuQ_gL_bujL6';
  const form = document.getElementById('auth-form');
  const status = document.getElementById('auth-status');
  const sessionPanel = document.getElementById('account-session');
  const password = document.getElementById('auth-password');
  const controls = [...form.querySelectorAll('button'), document.getElementById('sign-out')];
  let client;
  const message = text => { status.textContent = text; };
  const busy = value => { controls.forEach(button => { button.disabled = value; }); };
  const renderSession = session => {
    form.hidden = Boolean(session);
    sessionPanel.hidden = !session;
    document.getElementById('account-email').textContent = session?.user.email || '';
    if (session) {
      password.value = '';
      message('Signed in. Notes are saved in this browser.');
    } else {
      message('Sign in or create an account. Notes are saved in this browser.');
    }
  };
  try {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error('Account setup is not complete yet.');
    if (!window.supabase) throw new Error('Unable to load sign-in. Check your connection and reload.');
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
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
        ? await client.auth.signUp(credentials)
        : await client.auth.signInWithPassword(credentials);
      if (error) throw error;
      password.value = '';
      if (signingUp && !data.session) message('Check your email to confirm your account, then return here to sign in.');
      else renderSession(data.session);
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
})();
