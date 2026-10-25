'use strict';

const DISPOSABLE_DOMAINS = new Set([
  '0-mail.com',
  '10mail.org',
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  '20minutemail.com',
  '24mail.chacuo.net',
  '24mail.top',
  '33mail.com',
  '1secmail.com',
  '1secmail.net',
  '1secmail.org',
  'anonbox.net',
  'binkmail.com',
  'bobmail.info',
  'burnermail.io',
  'byom.de',
  'correotemporario.com',
  'discard.email',
  'discardmail.com',
  'dispostable.com',
  'dropmail.me',
  'emailias.com',
  'emailondeck.com',
  'emailtemporanea.com',
  'emailtemporario.com.br',
  'fakeinbox.com',
  'filzmail.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'harakirimail.com',
  'incognitomail.com',
  'jetable.org',
  'linshiyou.com',
  'linshiyouxiang.net',
  'mail-temp.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailinator2.com',
  'mailmoat.com',
  'mailnesia.com',
  'mailnull.com',
  'mailscrap.com',
  'mailshell.com',
  'mintemail.com',
  'mohmal.com',
  'mvrht.com',
  'mytrashmail.com',
  'nada.email',
  'no-spam.ws',
  'nospamfor.us',
  'nowmymail.com',
  'sharklasers.com',
  'snapmail.cc',
  'sogetthis.com',
  'spam.la',
  'spam.su',
  'spam4.me',
  'spamfree24.org',
  'spamgourmet.com',
  'spamherelots.com',
  'spamify.com',
  'spamthis.co.uk',
  'suremail.info',
  'tempail.com',
  'tempinbox.co.uk',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.plus',
  'tempmailaddress.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempr.email',
  'thisisnotmyrealemail.com',
  'throwawaymail.com',
  'tmail.ws',
  'tmpmail.net',
  'tmpmail.org',
  'trash-mail.com',
  'trashmail.com',
  'trashmail.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net'
]);

function isDisposableEmail(email) {
  if (typeof email !== 'string') return false;

  const at = email.lastIndexOf('@');
  if (at < 1) return false;

  const domain = email.slice(at + 1).toLowerCase().replace(/\.$/, '');

  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return true;
  }

  return false;
}

module.exports = { DISPOSABLE_DOMAINS, isDisposableEmail };
