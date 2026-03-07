/**
 * Google Apps Script — Gmail Sync for Boost CRM
 *
 * GRATUIT — remplace n8n pour la synchronisation des emails.
 * Se deploie dans Google Apps Script (script.google.com)
 *
 * SETUP :
 * 1. Va sur https://script.google.com
 * 2. Cree un nouveau projet
 * 3. Colle ce code
 * 4. Configure les variables ci-dessous
 * 5. Lance syncEmails() une premiere fois (autorise les permissions Gmail)
 * 6. Ajoute un trigger : Edition > Declencheurs > Ajouter
 *    → Fonction: syncEmails
 *    → Source: Heure
 *    → Toutes les 5 minutes
 *
 * C'est tout ! Les emails seront syncronises automatiquement.
 */

// ═══════════════════════════════════════════
// CONFIGURATION — A MODIFIER
// ═══════════════════════════════════════════

const CONFIG = {
  // URL de ton webhook Boost CRM (Vercel)
  WEBHOOK_URL: 'https://boost-crm-six.vercel.app/api/webhooks/gmail-sync',

  // Secret pour securiser le webhook (doit correspondre a WEBHOOK_SECRET dans Vercel)
  WEBHOOK_SECRET: 'c47e6ae1635e046886d079fab24267b97618a7830a569fcc',

  // Ton email (pour determiner sent vs received)
  MY_EMAIL: 'louis.matar@boostinc.com',

  // Nombre max d'emails a traiter par execution
  MAX_EMAILS: 20,

  // Nombre d'heures a regarder en arriere (pour la premiere sync)
  LOOKBACK_HOURS: 24,
};

// ═══════════════════════════════════════════
// CODE — NE PAS MODIFIER
// ═══════════════════════════════════════════

/**
 * Fonction principale — appelee par le trigger toutes les 5 minutes
 */
function syncEmails() {
  const lastSync = getLastSyncTime();
  const query = buildQuery(lastSync);

  Logger.log('Recherche emails: ' + query);

  const threads = GmailApp.search(query, 0, CONFIG.MAX_EMAILS);

  if (threads.length === 0) {
    Logger.log('Aucun nouvel email a synchroniser.');
    return;
  }

  Logger.log('Threads trouves: ' + threads.length);

  const emails = [];

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      const messageDate = message.getDate();

      // Skip si deja sync
      if (lastSync && messageDate <= lastSync) continue;

      const email = {
        gmail_message_id: message.getId(),
        gmail_thread_id: thread.getId(),
        subject: message.getSubject() || '',
        from_email: extractEmail(message.getFrom()),
        from_name: extractName(message.getFrom()),
        to_email: extractEmail(message.getTo()),
        body_preview: message.getPlainBody().substring(0, 500),
        body_text: message.getPlainBody().substring(0, 5000),
        labels: thread.getLabels().map(function(l) { return l.getName(); }),
        is_read: !message.isUnread(),
        gmail_date: messageDate.toISOString(),
      };

      emails.push(email);
    }
  }

  if (emails.length === 0) {
    Logger.log('Aucun nouveau message a envoyer.');
    return;
  }

  Logger.log('Envoi de ' + emails.length + ' emails au webhook...');

  // Envoyer au webhook par batch de 10
  for (var i = 0; i < emails.length; i += 10) {
    var batch = emails.slice(i, i + 10);

    var response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
      method: 'POST',
      contentType: 'application/json',
      headers: {
        'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true,
    });

    Logger.log('Batch ' + (i/10 + 1) + ' - Status: ' + response.getResponseCode());
    Logger.log('Response: ' + response.getContentText().substring(0, 200));
  }

  // Sauvegarder le timestamp de sync
  saveLastSyncTime(new Date());

  Logger.log('Sync terminee !');
}

/**
 * Construire la requete Gmail
 */
function buildQuery(lastSync) {
  if (lastSync) {
    // Format: YYYY/MM/DD
    var dateStr = Utilities.formatDate(lastSync, 'GMT', 'yyyy/MM/dd');
    return 'after:' + dateStr + ' -category:promotions -category:social -category:updates';
  }

  // Premiere sync: derniers X heures
  var lookback = new Date();
  lookback.setHours(lookback.getHours() - CONFIG.LOOKBACK_HOURS);
  var dateStr = Utilities.formatDate(lookback, 'GMT', 'yyyy/MM/dd');
  return 'after:' + dateStr + ' -category:promotions -category:social -category:updates';
}

/**
 * Extraire l'email d'un header "From"
 * Ex: "Jean Dupont <jean@example.com>" → "jean@example.com"
 */
function extractEmail(header) {
  if (!header) return '';
  var match = header.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // Si pas de <>, c'est juste l'email
  return header.trim().toLowerCase();
}

/**
 * Extraire le nom d'un header "From"
 * Ex: "Jean Dupont <jean@example.com>" → "Jean Dupont"
 */
function extractName(header) {
  if (!header) return '';
  var match = header.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return '';
}

/**
 * Sauvegarder la derniere date de sync
 */
function saveLastSyncTime(date) {
  PropertiesService.getScriptProperties().setProperty(
    'LAST_SYNC',
    date.toISOString()
  );
}

/**
 * Recuperer la derniere date de sync
 */
function getLastSyncTime() {
  var saved = PropertiesService.getScriptProperties().getProperty('LAST_SYNC');
  if (saved) return new Date(saved);
  return null;
}

/**
 * Reset la date de sync (pour forcer une re-sync)
 */
function resetSync() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_SYNC');
  Logger.log('Sync reset ! La prochaine execution synchronisera les derniers ' + CONFIG.LOOKBACK_HOURS + 'h.');
}

/**
 * RE-SYNC COMPLET — Synchronise tous les emails depuis aout 2025.
 * Filtre: pas de promos, social, updates, noreply, notifications.
 *
 * ATTENTION : Peut prendre du temps (limit Apps Script = 6 min).
 * Lance cette fonction manuellement depuis l'editeur Apps Script.
 * Tu peux la lancer plusieurs fois — les doublons seront ignores.
 */
function fullResync() {
  var START_DATE = '2025/08/01';
  var query = 'after:' + START_DATE + ' -category:promotions -category:social -category:updates -from:noreply -from:no-reply -from:notifications -from:marketing';

  Logger.log('=== FULL RESYNC depuis ' + START_DATE + ' ===');
  Logger.log('Recherche: ' + query);

  // Process in pages of 50 threads
  var start = 0;
  var pageSize = 50;
  var totalEmails = 0;
  var totalBatches = 0;

  while (true) {
    var threads = GmailApp.search(query, start, pageSize);
    if (threads.length === 0) break;

    Logger.log('Page ' + (start / pageSize + 1) + ': ' + threads.length + ' threads');

    var emails = [];

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();

      for (var m = 0; m < messages.length; m++) {
        var message = messages[m];
        var msgDate = message.getDate();

        // Skip messages before lookback
        if (msgDate < lookback) continue;

        var email = {
          gmail_message_id: message.getId(),
          gmail_thread_id: threads[t].getId(),
          subject: message.getSubject() || '',
          from_email: extractEmail(message.getFrom()),
          from_name: extractName(message.getFrom()),
          to_email: extractEmail(message.getTo()),
          body_preview: message.getPlainBody().substring(0, 500),
          body_text: message.getPlainBody().substring(0, 5000),
          labels: threads[t].getLabels().map(function(l) { return l.getName(); }),
          is_read: !message.isUnread(),
          gmail_date: msgDate.toISOString(),
        };

        emails.push(email);
      }
    }

    // Send in batches of 10
    for (var i = 0; i < emails.length; i += 10) {
      var batch = emails.slice(i, i + 10);

      try {
        var response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
          method: 'POST',
          contentType: 'application/json',
          headers: {
            'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
          },
          payload: JSON.stringify(batch),
          muteHttpExceptions: true,
        });

        var status = response.getResponseCode();
        if (status === 200) {
          try {
            var result = JSON.parse(response.getContentText());
            Logger.log('  Batch: ' + result.processed + ' traites, ' + result.prospects_created + ' nouveaux prospects, ' + result.activities_created + ' activites');
          } catch(e) {
            Logger.log('  Batch envoye (status ' + status + ')');
          }
        } else {
          Logger.log('  ERREUR batch: status ' + status);
        }

        totalBatches++;
      } catch(e) {
        Logger.log('  ERREUR envoi: ' + e);
      }

      // Petit delai pour ne pas surcharger
      Utilities.sleep(500);
    }

    totalEmails += emails.length;
    start += pageSize;

    // Safety: Apps Script 6min limit
    if (start >= 500) {
      Logger.log('Limite de 500 threads atteinte. Relance fullResync() pour continuer.');
      break;
    }
  }

  // Update sync time
  saveLastSyncTime(new Date());

  Logger.log('=== RESYNC TERMINE ===');
  Logger.log('Total: ' + totalEmails + ' emails envoyes en ' + totalBatches + ' batches');
}

/**
 * Test — envoyer un email de test au webhook
 */
function testWebhook() {
  var testEmail = {
    gmail_message_id: 'test_' + new Date().getTime(),
    gmail_thread_id: 'test_thread',
    subject: 'Test sync Boost CRM',
    from_email: 'test@example.com',
    from_name: 'Test Prospect',
    to_email: CONFIG.MY_EMAIL,
    body_preview: 'Ceci est un test de synchronisation.',
    body_text: 'Ceci est un test de synchronisation.',
    labels: [],
    is_read: true,
    gmail_date: new Date().toISOString(),
  };

  var response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': CONFIG.WEBHOOK_SECRET,
    },
    payload: JSON.stringify([testEmail]),
    muteHttpExceptions: true,
  });

  Logger.log('Status: ' + response.getResponseCode());
  Logger.log('Response: ' + response.getContentText());
}
