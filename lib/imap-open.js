'use strict';

/* Opening PFA's mailbox over IMAP: one way, for everything that reads it
 * (lib/inbound-mail.js, the replies) or writes to it (lib/sent-copy.js, the
 * Sent folder).
 *
 * Which server. GoDaddy's own settings for this mailbox (Professional Email
 * powered by Titan, help article 32204) are imap.secureserver.net on 993 and
 * smtpout.secureserver.net on 465. Sending already tried GoDaddy's server
 * first and worked; reading tried imap.titan.email first, which refused the
 * login, and stopped there. On 8 Oct 2026 the panel showed "Mailbox could
 * not be read: Command failed" and nothing more. So now:
 *
 *   - GoDaddy's server first, Titan's second, unless PFA_IMAP_HOST names one;
 *   - a server that refuses the login is not the end: the next is tried,
 *     because a mailbox lives on one of them and the other turns it away;
 *   - what each server actually answered is kept and reported, so the panel
 *     says "imap.secureserver.net: [AUTHENTICATIONFAILED] ..." rather than
 *     "Command failed".
 *
 * Only opening is retried on another server. Anything that goes wrong once
 * the mailbox is open is that mailbox's answer, and is reported as it is.
 */

const DEFAULT_HOSTS = ['imap.secureserver.net', 'imap.titan.email'];

function hosts() {
  const named = String(process.env.PFA_IMAP_HOST || '').trim();
  return named ? [named] : DEFAULT_HOSTS.slice();
}

function login() {
  return {
    user: String(process.env.PFA_IMAP_USER || process.env.PFA_SMTP_USER || '').trim(),
    /* a line break at the end is never part of a password: a secret stored
       from a file or `echo` carries one, and GoDaddy then answers 535 */
    pass: String(process.env.PFA_IMAP_PASS || process.env.PFA_SMTP_PASS || '').replace(/[\r\n]+$/, '')
  };
}

function configured() {
  const { user, pass } = login();
  return Boolean(user && pass);
}

/* The server's own words, short: its response code and text, or the
   library's message when the server said nothing (a timeout, a refusal). */
function said(error) {
  if (!error) return 'no answer';
  const code = error.serverResponseCode ? `[${error.serverResponseCode}] ` : '';
  const text = String(error.responseText || error.message || error.code || 'no answer').replace(/\s+/g, ' ').trim();
  return (code + text).slice(0, 160);
}

/* Connects to the first server that takes the login. Resolves to
   { client, host }; the caller logs out. Rejects with every server's answer,
   and `authentication: true` when a server refused the login itself. */
async function open(makeClient, options) {
  const o = options || {};
  const { user, pass } = login();
  const port = Number(process.env.PFA_IMAP_PORT) || 993;
  const answers = [];
  let authentication = false;
  for (const host of (o.hosts || hosts())) {
    const client = makeClient({
      host, port, secure: port === 993, auth: { user, pass }, logger: false,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000
    });
    try {
      await client.connect();
      return { client, host };
    } catch (error) {
      if (error && (error.authenticationFailed || error.serverResponseCode === 'AUTHENTICATIONFAILED' || /auth/i.test(String(error.responseText || '')))) authentication = true;
      answers.push(`${host}: ${said(error)}`);
      try { await client.logout(); } catch (_) { /* never opened */ }
    }
  }
  const lead = authentication
    ? `GoDaddy did not accept the login for ${user || 'the mailbox'}. Check the password (PFA_SMTP_PASS) is the one that opens this mailbox's webmail.`
    : 'No mail server answered.';
  const error = new Error(`${lead} ${answers.join('; ')}`.slice(0, 400));
  error.code = authentication ? 'IMAP_AUTH' : 'IMAP_UNREACHABLE';
  error.authentication = authentication;
  error.answers = answers;
  throw error;
}

module.exports = { DEFAULT_HOSTS, hosts, login, configured, said, open };
