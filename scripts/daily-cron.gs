/**
 * Google Apps Script — Daily Automation Trigger for Boost CRM
 *
 * Appelle le endpoint /api/cron/daily une fois par jour pour :
 * 1. Verifier les relances a faire
 * 2. Mettre a jour le pipeline automatiquement
 *
 * PEUT ETRE AJOUTE AU MEME PROJET APPS SCRIPT que gmail-sync
 * (pas besoin d'un projet separe)
 *
 * SETUP :
 * 1. Copie cette fonction dans ton projet gmail-sync (ou drive-sync)
 * 2. Ajoute un trigger : Edition > Declencheurs > Ajouter
 *    -> Fonction: runDailyAutomation
 *    -> Source: Heure
 *    -> Quotidien
 *    -> Entre 7h et 8h (pour avoir les relances du matin)
 */

function runDailyAutomation() {
  var WEBHOOK_URL = 'https://boost-crm-six.vercel.app/api/cron/daily';
  var WEBHOOK_SECRET = 'c47e6ae1635e046886d079fab24267b97618a7830a569fcc';

  Logger.log('Lancement des automations quotidiennes...');

  var response = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': WEBHOOK_SECRET,
    },
    payload: JSON.stringify({}),
    muteHttpExceptions: true,
  });

  var status = response.getResponseCode();
  var body = response.getContentText();

  Logger.log('Status: ' + status);
  Logger.log('Response: ' + body);

  if (status === 200) {
    try {
      var result = JSON.parse(body);
      Logger.log('Relances: ' + result.relances.flagged + ' prospects a relancer');
      Logger.log('Pipeline: ' + result.pipeline.updated + ' prospects mis a jour');
    } catch(e) {
      Logger.log('Parsing error: ' + e);
    }
  }

  Logger.log('Automations quotidiennes terminees !');
}
