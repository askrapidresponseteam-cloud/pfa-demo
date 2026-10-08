#!/usr/bin/env node
'use strict';

/* Checks PFA's mailbox from this computer: can the site's login read it
 * (IMAP, for replies and the Sent folder) and send from it (SMTP)?
 *
 *   npm run check:mailbox
 *
 * Asks for the mailbox password at a hidden prompt (or reads PFA_SMTP_PASS
 * if it is set), and never prints it. Tries each server the site tries, in
 * the same order (lib/imap-open.js), and prints what each one answered, so
 * "Command failed" becomes a sentence about which server said what.
 *
 * Written 8 Oct 2026, when the panel showed "Mailbox could not be read:
 * Command failed" while sending worked. */

const readline = require('readline');
const IMAP = require('../lib/imap-open');

const USER = String(process.env.PFA_IMAP_USER || process.env.PFA_SMTP_USER || process.argv[2] || 'info@peopleforanimalsindia.org').trim();
const SMTP_HOSTS = process.env.PFA_SMTP_HOST ? [process.env.PFA_SMTP_HOST] : ['smtpout.secureserver.net', 'smtp.titan.email'];

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = function (s) { if (!rl.stdoutMuted || s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function checkImap(host) {
  const { ImapFlow } = require('imapflow');
  try {
    const { client } = await IMAP.open((o) => new ImapFlow(o), { hosts: [host] });
    try {
      const boxes = await client.list();
      const sent = boxes.find((b) => b.specialUse === '\\Sent') || boxes.find((b) => /^sent/i.test(b.path));
      const lock = await client.getMailboxLock('INBOX');
      const count = (client.mailbox && client.mailbox.exists) || 0;
      lock.release();
      return { ok: true, line: `opened: INBOX holds ${count}, Sent folder is "${sent ? sent.path : 'not found (it will be made)'}"` };
    } finally {
      try { await client.logout(); } catch (_) { /* gone */ }
    }
  } catch (error) {
    const answer = (error.answers && error.answers[0]) ? error.answers[0].replace(`${host}: `, '') : IMAP.said(error);
    return { ok: false, line: `refused: ${answer}`, auth: Boolean(error.authentication) };
  }
}

async function checkSmtp(host, pass) {
  const transport = require('nodemailer').createTransport({
    host, port: Number(process.env.PFA_SMTP_PORT) || 465, secure: (Number(process.env.PFA_SMTP_PORT) || 465) === 465,
    auth: { user: USER, pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
  });
  try {
    await transport.verify();
    return { ok: true, line: 'login accepted (nothing was sent)' };
  } catch (error) {
    return { ok: false, line: `refused: ${String(error.response || error.message || error.code).replace(/\s+/g, ' ').slice(0, 160)}` };
  } finally {
    transport.close();
  }
}

(async () => {
  console.log(`\nChecking the mailbox ${USER}\n`);
  let pass = String(process.env.PFA_IMAP_PASS || process.env.PFA_SMTP_PASS || '');
  if (!pass) pass = await askHidden('Mailbox password (not shown, not saved): ');
  if (!pass) { console.log('No password given; nothing checked.'); process.exit(1); }
  process.env.PFA_IMAP_USER = USER;
  process.env.PFA_IMAP_PASS = pass;

  console.log('Reading (IMAP: replies and the Sent folder)');
  const reads = [];
  for (const host of IMAP.hosts()) {
    const r = await checkImap(host);
    reads.push(Object.assign({ host }, r));
    console.log(`  ${r.ok ? 'OK  ' : 'NO  '} ${host}  ${r.line}`);
  }
  console.log('\nSending (SMTP)');
  const sends = [];
  for (const host of SMTP_HOSTS) {
    const r = await checkSmtp(host, pass);
    sends.push(Object.assign({ host }, r));
    console.log(`  ${r.ok ? 'OK  ' : 'NO  '} ${host}  ${r.line}`);
  }

  const reader = reads.find((r) => r.ok);
  const sender = sends.find((r) => r.ok);
  console.log('');
  if (reader && sender) {
    console.log(`All good. The site reads through ${reader.host} and sends through ${sender.host} with this password.`);
    console.log('If the panel still says the mailbox could not be read, the password stored on the site is not this one:');
    console.log('  Vercel:   vercel env add PFA_SMTP_PASS production --sensitive --force --project pfa-full-website   (then deploy)');
    console.log('  Firebase: npx firebase-tools functions:secrets:set PFA_SMTP_PASS --project pfa-new-website        (then deploy)');
  } else if (!reader && sender) {
    console.log('Sending works but reading does not, with the same password. GoDaddy is refusing IMAP for this mailbox.');
    console.log('Sign in to the info@ webmail, open Settings, and turn on access for other email apps (IMAP), then run this again.');
  } else if (!reader && !sender) {
    console.log('No server accepted this password. Check it opens the info@ webmail, then run this again.');
  } else {
    console.log(`Reading works through ${reader.host}, sending did not. The panel's "Send a test email" will say why.`);
  }
  process.exit(reader ? 0 : 1);
})().catch((error) => { console.error('The check itself failed:', error && error.message); process.exit(2); });
