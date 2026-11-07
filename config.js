// Everything personal about this site lives here. Edit this file to reuse the
// site for someone else. Secrets never go here: they live in Vercel env vars.

const recipientName = 'hazel';

export default {
  recipientName,
  occasion: `${recipientName}'s 21`,
  siteName: 'avokuddle studio',
  stripFilename: `${recipientName}s-21-strip`,

  titles: {
    booth: 'avokuddle studio',
    letters: `${recipientName}'s letters`,
    description: `${recipientName}'s 21`,
  },

  labels: {
    friendsButton: "friend's exclusive",
    friendsVerified: 'friend ♡',
    codePrompt: 'the friends code',
    codePlaceholder: 'secret code',
    codeSubmit: 'open',
    codeChecking: 'checking…',
    codeWrong: "hmm, that's not it",
    codeLimited: 'too many tries, wait a few minutes ♡',
    codeOffline: "couldn't check right now, try again",

    writeLetter: `write ${recipientName} a letter ♡`,
    letterPlaceholder: `dear ${recipientName},`,
    fromPlaceholder: 'your name',
    songPlaceholder: 'a spotify song (optional)',
    songInvalid: 'that needs to be a spotify link',
    send: 'seal & send',
    sending: 'sealing…',
    sent: 'sealed and sent ♡',
    sentNote: `it's waiting in ${recipientName}'s mailbox`,
    sendFailed: "it didn't send, try again",
    needMessage: 'write a few words first',
    needName: 'add your name',
    close: 'close',

    mailboxTitle: `${recipientName}'s letters`,
    mailboxEmpty: 'no letters yet, they are on their way ♡',
    from: 'from',
    privateTitle: 'this mailbox is private',
    privateText: 'only the birthday star has the key ♡',
  },

  email: {
    subject: 'a new letter from {name} ♡',
    heading: 'you have a new letter',
    line: '{name} wrote you something ♡',
    button: 'open your letters',
  },

  colors: {
    bg: '#140509',
    panel: '#1f080e',
    ivory: '#f3ead8',
    wine: '#7d2132',
  },
};
