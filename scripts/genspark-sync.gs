/**
 * Google Apps Script — Genspark Meeting Notes Sync for Boost CRM
 *
 * A DEPLOYER DANS LE COMPTE GMAIL PERSONNEL (louis.matar.gueye@gmail.com)
 * car les emails Genspark arrivent sur ce compte.
 *
 * SETUP :
 * 1. Va sur https://script.google.com
 * 2. Cree un NOUVEAU projet (separe du gmail-sync et drive-sync)
 * 3. Colle ce code
 * 4. Lance testGensparkWebhook() pour verifier la connexion
 * 5. Lance syncGenspark() une premiere fois (autorise les permissions Gmail)
 * 6. Ajoute un trigger : Edition > Declencheurs > Ajouter
 *    -> Fonction: syncGenspark
 *    -> Source: Heure
 *    -> Toutes les 5 minutes
 */

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════

var GENSPARK_CONFIG = {
  // URL du webhook Boost CRM
  WEBHOOK_URL: 'https://boost-crm-six.vercel.app/api/webhooks/meeting-notes',

  // Secret webhook (identique a Vercel WEBHOOK_SECRET)
  WEBHOOK_SECRET: 'c47e6ae1635e046886d079fab24267b97618a7830a569fcc',

  // Adresse email Genspark
  GENSPARK_SENDER: 'team@genspark.ai',

  // Nombre max d'emails par execution
  MAX_EMAILS: 10,
};

// ═══════════════════════════════════════════
// CODE PRINCIPAL
// ═══════════════════════════════════════════

/**
 * Fonction principale — sync les meeting notes Genspark
 */
function syncGenspark() {
  var lastSync = getLastSyncTime();
  var query = 'from:' + GENSPARK_CONFIG.GENSPARK_SENDER;

  if (lastSync) {
    var dateStr = Utilities.formatDate(lastSync, 'GMT', 'yyyy/MM/dd');
    query += ' after:' + dateStr;
  } else {
    // Premiere sync : 30 derniers jours
    query += ' newer_than:30d';
  }

  Logger.log('Recherche Genspark: ' + query);

  var threads = GmailApp.search(query, 0, GENSPARK_CONFIG.MAX_EMAILS);

  if (threads.length === 0) {
    Logger.log('Aucun nouveau meeting note Genspark.');
    return;
  }

  Logger.log('Threads trouves: ' + threads.length);

  var meetingNotes = [];

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();

    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];
      var messageDate = message.getDate();

      // Skip si deja sync
      if (lastSync && messageDate <= lastSync) continue;

      // Verifier que c'est bien un email Genspark
      var from = message.getFrom().toLowerCase();
      if (from.indexOf('genspark') === -1) continue;

      var subject = message.getSubject() || '';
      var plainBody = message.getPlainBody() || '';
      var htmlBody = message.getBody() || '';

      // Parser le contenu structure
      var parsed = parseGensparkEmail(subject, plainBody);

      meetingNotes.push({
        gmail_message_id: message.getId(),
        gmail_thread_id: threads[t].getId(),
        subject: subject,
        meeting_title: parsed.title,
        meeting_date: parsed.date || messageDate.toISOString(),
        summary: parsed.summary,
        sections: parsed.sections,
        action_items: parsed.actionItems,
        participants: parsed.participants,
        companies_mentioned: parsed.companies,
        full_text: plainBody.substring(0, 15000),
        gmail_date: messageDate.toISOString(),
      });
    }
  }

  if (meetingNotes.length === 0) {
    Logger.log('Aucune nouvelle note a envoyer.');
    return;
  }

  Logger.log('Envoi de ' + meetingNotes.length + ' meeting notes au webhook...');

  var response = UrlFetchApp.fetch(GENSPARK_CONFIG.WEBHOOK_URL, {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': GENSPARK_CONFIG.WEBHOOK_SECRET,
    },
    payload: JSON.stringify(meetingNotes),
    muteHttpExceptions: true,
  });

  Logger.log('Status: ' + response.getResponseCode());
  Logger.log('Response: ' + response.getContentText().substring(0, 500));

  // Sauvegarder timestamp
  saveLastSyncTime(new Date());
  Logger.log('Sync Genspark terminee !');
}

/**
 * Parser un email Genspark pour en extraire les sections structurees
 */
function parseGensparkEmail(subject, body) {
  var result = {
    title: '',
    date: null,
    summary: '',
    sections: [],
    actionItems: [],
    participants: [],
    companies: [],
  };

  // Extraire le titre du meeting
  // Format sujet: "Meeting Notes: Titre du meeting"
  var titleMatch = subject.match(/Meeting Notes:\s*(.+)/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  } else {
    result.title = subject;
  }

  // Extraire la date
  var dateMatch = body.match(/Date\s*(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    result.date = dateMatch[1] + 'T00:00:00Z';
  }

  // Extraire le resume
  var summaryMatch = body.match(/R[eé]sum[eé] de la r[eé]union\s*\n([\s\S]*?)(?=\n[A-Z\u00C0-\u00DC][\w\s]*\n|\n\*\s)/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  // Extraire les sections (titres suivis de contenu)
  var sectionRegex = /^([A-Z\u00C0-\u00DC][\w\s'éèêëàâäùûüôöîïç]+)\n([\s\S]*?)(?=\n[A-Z\u00C0-\u00DC][\w\s'éèêëàâäùûüôöîïç]+\n|$)/gm;
  var match;
  while ((match = sectionRegex.exec(body)) !== null) {
    var sectionTitle = match[1].trim();
    var sectionContent = match[2].trim();

    // Ignorer les sections generiques (header/footer)
    if (sectionTitle === 'Genspark AI Meeting Notes' || sectionTitle === 'Generated') continue;

    result.sections.push({
      title: sectionTitle,
      content: sectionContent,
    });
  }

  // Extraire les action items (lignes commencant par *)
  var actionRegex = /[Pp]lan d'action[\s\S]*?\n([\s\S]*?)(?=\n[A-Z]|\n$|$)/;
  var actionMatch = body.match(actionRegex);
  if (actionMatch) {
    var actionLines = actionMatch[1].split('\n');
    for (var i = 0; i < actionLines.length; i++) {
      var line = actionLines[i].trim();
      if (line.startsWith('*') || line.startsWith('-')) {
        var cleanLine = line.replace(/^[\*\-]\s*/, '').trim();
        if (cleanLine.length > 5) {
          // Extraire la personne assignee
          var assigneeMatch = cleanLine.match(/[AÀ] l'attention de\s+(\w+)/i);
          result.actionItems.push({
            text: cleanLine,
            assignee: assigneeMatch ? assigneeMatch[1] : null,
          });
        }
      }
    }
  }

  // Extraire les noms de participants (Speaker X, noms propres)
  var speakerRegex = /(?:Speaker\s*\d+|[AÀ] l'attention de\s+)(\w+)/gi;
  var speakers = {};
  while ((match = speakerRegex.exec(body)) !== null) {
    speakers[match[1]] = true;
  }
  result.participants = Object.keys(speakers);

  // Extraire les noms d'entreprises/organisations mentionnees
  // On cherche des mots en majuscules ou des noms propres connus
  var orgRegex = /(?:CPAM|MDS|Sodebo|SNCF|EDF|Airbus|Total|Orange|BNP|SFR|Free|Bouygues|Engie|Carrefour|Leclerc|Auchan|Danone|Renault|Peugeot|Boost\s*Inc)/gi;
  var orgs = {};
  while ((match = orgRegex.exec(body)) !== null) {
    orgs[match[0].toUpperCase()] = true;
  }
  result.companies = Object.keys(orgs);

  return result;
}

// ═══════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════

function saveLastSyncTime(date) {
  PropertiesService.getScriptProperties().setProperty(
    'LAST_GENSPARK_SYNC',
    date.toISOString()
  );
}

function getLastSyncTime() {
  var saved = PropertiesService.getScriptProperties().getProperty('LAST_GENSPARK_SYNC');
  if (saved) return new Date(saved);
  return null;
}

function resetGensparkSync() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_GENSPARK_SYNC');
  Logger.log('Genspark sync reset ! La prochaine execution synchronisera les 30 derniers jours.');
}

/**
 * Test — envoyer une note de test au webhook
 */
function testGensparkWebhook() {
  var testNote = {
    gmail_message_id: 'genspark_test_' + new Date().getTime(),
    gmail_thread_id: 'genspark_test_thread',
    subject: 'Meeting Notes: Test de synchronisation Genspark',
    meeting_title: 'Test de synchronisation Genspark',
    meeting_date: new Date().toISOString(),
    summary: 'Ceci est un test de synchronisation des notes de reunion Genspark vers Boost CRM.',
    sections: [
      { title: 'Contexte', content: 'Test de connexion entre Genspark et le CRM.' },
      { title: 'Plan d\'action', content: '* Verifier que la synchronisation fonctionne\n* Confirmer l\'affichage dans le CRM' },
    ],
    action_items: [
      { text: 'Verifier que la synchronisation fonctionne', assignee: 'Louis' },
    ],
    participants: ['Louis'],
    companies_mentioned: ['BOOST INC'],
    full_text: 'Ceci est un test complet de synchronisation.',
    gmail_date: new Date().toISOString(),
  };

  var response = UrlFetchApp.fetch(GENSPARK_CONFIG.WEBHOOK_URL, {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': GENSPARK_CONFIG.WEBHOOK_SECRET,
    },
    payload: JSON.stringify([testNote]),
    muteHttpExceptions: true,
  });

  Logger.log('Status: ' + response.getResponseCode());
  Logger.log('Response: ' + response.getContentText());
}
