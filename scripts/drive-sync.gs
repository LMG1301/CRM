/**
 * Google Apps Script — Google Drive Sync for Boost CRM
 *
 * GRATUIT — synchronise les documents Google Drive avec le CRM.
 * Se deploie dans Google Apps Script (script.google.com)
 *
 * SETUP :
 * 1. Va sur https://script.google.com (connecte avec ton compte Boost)
 * 2. Cree un nouveau projet (ou ajoute ce fichier au projet Gmail Sync existant)
 * 3. Colle ce code
 * 4. Configure FOLDER_ID ci-dessous (voir instructions)
 * 5. Lance syncDrive() une premiere fois (autorise les permissions Drive)
 * 6. Ajoute un trigger : Edition > Declencheurs > Ajouter
 *    → Fonction: syncDrive
 *    → Source: Heure
 *    → Toutes les heures
 *
 * TROUVER LE FOLDER_ID :
 * 1. Ouvre le dossier dans Google Drive
 * 2. Regarde l'URL : https://drive.google.com/drive/folders/XXXXXXX
 * 3. Le XXXXXXX c'est ton FOLDER_ID
 */

// ═══════════════════════════════════════════
// CONFIGURATION — A MODIFIER
// ═══════════════════════════════════════════

const DRIVE_CONFIG = {
  // URL du webhook Boost CRM (Vercel)
  WEBHOOK_URL: 'https://boost-crm-six.vercel.app/api/webhooks/drive-sync',

  // Secret pour securiser le webhook (doit correspondre a WEBHOOK_SECRET dans Vercel)
  WEBHOOK_SECRET: 'c47e6ae1635e046886d079fab24267b97618a7830a569fcc',

  // ID du dossier Google Drive a synchroniser
  // Ouvre le dossier dans Drive, copie l'ID depuis l'URL
  FOLDER_ID: 'CHANGE_ME_TO_YOUR_FOLDER_ID',

  // Inclure les sous-dossiers ?
  INCLUDE_SUBFOLDERS: true,

  // Types de fichiers a synchroniser
  // Google Docs, Slides, Sheets sont automatiquement convertis en texte
  // Les PDFs sont aussi supportes (texte extrait si possible)
  SUPPORTED_TYPES: [
    'application/vnd.google-apps.document',     // Google Docs
    'application/vnd.google-apps.presentation',  // Google Slides
    'application/vnd.google-apps.spreadsheet',   // Google Sheets
    'application/pdf',                           // PDF
  ],

  // Exclure les Google Docs auto-convertis depuis PDF ?
  // Mettre a true si vous n'uploadez que des PDFs dans Drive
  EXCLUDE_GOOGLE_DOCS: true,

  // Taille max du contenu par document (en caracteres)
  MAX_CONTENT_LENGTH: 50000,
};

// ═══════════════════════════════════════════
// CODE — NE PAS MODIFIER
// ═══════════════════════════════════════════

/**
 * Fonction principale — appelee par le trigger toutes les heures
 */
function syncDrive() {
  Logger.log('Debut de la sync Drive...');

  var folder;
  try {
    folder = DriveApp.getFolderById(DRIVE_CONFIG.FOLDER_ID);
  } catch (e) {
    Logger.log('ERREUR: Impossible de trouver le dossier. Verifiez FOLDER_ID.');
    Logger.log('ID actuel: ' + DRIVE_CONFIG.FOLDER_ID);
    return;
  }

  Logger.log('Dossier: ' + folder.getName());

  var documents = [];
  collectDocuments(folder, documents, '');

  Logger.log('Documents trouves: ' + documents.length);

  if (documents.length === 0) {
    Logger.log('Aucun document a synchroniser.');
    return;
  }

  // Envoyer au webhook par batch de 5 (les docs sont plus gros que les emails)
  for (var i = 0; i < documents.length; i += 5) {
    var batch = documents.slice(i, i + 5);

    var response = UrlFetchApp.fetch(DRIVE_CONFIG.WEBHOOK_URL, {
      method: 'POST',
      contentType: 'application/json',
      headers: {
        'x-webhook-secret': DRIVE_CONFIG.WEBHOOK_SECRET,
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true,
    });

    Logger.log('Batch ' + (i / 5 + 1) + ' - Status: ' + response.getResponseCode());
    Logger.log('Response: ' + response.getContentText().substring(0, 200));
  }

  Logger.log('Sync Drive terminee !');
}

/**
 * Collecter les documents d'un dossier (recursif si sous-dossiers actives)
 */
function collectDocuments(folder, documents, path) {
  var folderName = folder.getName();
  var currentPath = path ? path + ' / ' + folderName : folderName;

  // Parcourir les fichiers
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var mimeType = file.getMimeType();

    // Verifier si le type est supporte
    if (DRIVE_CONFIG.SUPPORTED_TYPES.indexOf(mimeType) === -1) continue;

    // Exclure les Google Docs si configure (evite les doublons PDF → Google Doc)
    if (DRIVE_CONFIG.EXCLUDE_GOOGLE_DOCS && mimeType === 'application/vnd.google-apps.document') continue;

    try {
      var content = extractContent(file, mimeType);
      if (!content || content.trim().length === 0) continue;

      documents.push({
        drive_file_id: file.getId(),
        name: file.getName(),
        mime_type: mimeType,
        folder_path: currentPath,
        content: content.substring(0, DRIVE_CONFIG.MAX_CONTENT_LENGTH),
        url: file.getUrl(),
        last_modified: file.getLastUpdated().toISOString(),
      });

      Logger.log('  + ' + file.getName() + ' (' + content.length + ' chars)');
    } catch (e) {
      Logger.log('  ! Erreur sur ' + file.getName() + ': ' + e.message);
    }
  }

  // Sous-dossiers
  if (DRIVE_CONFIG.INCLUDE_SUBFOLDERS) {
    var subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      collectDocuments(subfolders.next(), documents, currentPath);
    }
  }
}

/**
 * Extraire le contenu textuel d'un fichier
 */
function extractContent(file, mimeType) {
  switch (mimeType) {
    case 'application/vnd.google-apps.document':
      return extractGoogleDoc(file);

    case 'application/vnd.google-apps.presentation':
      return extractGoogleSlides(file);

    case 'application/vnd.google-apps.spreadsheet':
      return extractGoogleSheet(file);

    case 'application/pdf':
      return extractPdf(file);

    default:
      return null;
  }
}

/**
 * Extraire le texte d'un Google Doc
 */
function extractGoogleDoc(file) {
  var doc = DocumentApp.openById(file.getId());
  return doc.getBody().getText();
}

/**
 * Extraire le texte d'une presentation Google Slides
 */
function extractGoogleSlides(file) {
  var presentation = SlidesApp.openById(file.getId());
  var slides = presentation.getSlides();
  var texts = [];

  for (var i = 0; i < slides.length; i++) {
    var slideTexts = [];
    slideTexts.push('--- Slide ' + (i + 1) + ' ---');

    var shapes = slides[i].getShapes();
    for (var j = 0; j < shapes.length; j++) {
      var text = shapes[j].getText().asString().trim();
      if (text) slideTexts.push(text);
    }

    // Tables
    var tables = slides[i].getTables();
    for (var k = 0; k < tables.length; k++) {
      var table = tables[k];
      for (var row = 0; row < table.getNumRows(); row++) {
        var rowTexts = [];
        for (var col = 0; col < table.getRow(row).getNumCells(); col++) {
          var cellText = table.getCell(row, col).getText().asString().trim();
          if (cellText) rowTexts.push(cellText);
        }
        if (rowTexts.length > 0) slideTexts.push(rowTexts.join(' | '));
      }
    }

    if (slideTexts.length > 1) texts.push(slideTexts.join('\n'));
  }

  return texts.join('\n\n');
}

/**
 * Extraire le texte d'un Google Sheet
 */
function extractGoogleSheet(file) {
  var spreadsheet = SpreadsheetApp.openById(file.getId());
  var sheets = spreadsheet.getSheets();
  var texts = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var range = sheet.getDataRange();
    var values = range.getValues();

    texts.push('--- Feuille: ' + sheet.getName() + ' ---');

    for (var row = 0; row < values.length; row++) {
      var rowText = values[row].filter(function (cell) {
        return cell !== '' && cell !== null && cell !== undefined;
      }).join(' | ');
      if (rowText) texts.push(rowText);
    }
  }

  return texts.join('\n');
}

/**
 * Extraire le texte d'un PDF (conversion via Google Docs)
 */
function extractPdf(file) {
  // Google peut convertir certains PDFs en texte via Drive API
  try {
    var blob = file.getBlob();
    var resource = {
      title: file.getName() + '_temp',
      mimeType: 'application/vnd.google-apps.document',
    };

    // Utiliser Drive API avancee pour convertir PDF → Google Doc
    var tempFile = Drive.Files.copy(resource, file.getId(), {
      convert: true,
    });

    if (tempFile) {
      var doc = DocumentApp.openById(tempFile.id);
      var text = doc.getBody().getText();
      // Supprimer le fichier temporaire
      DriveApp.getFileById(tempFile.id).setTrashed(true);
      return text;
    }
  } catch (e) {
    Logger.log('  PDF non convertible: ' + e.message);
  }

  return '[PDF - contenu non extractible automatiquement]';
}

/**
 * Test — envoyer un document de test au webhook
 */
function testDriveWebhook() {
  var testDoc = {
    drive_file_id: 'test_' + new Date().getTime(),
    name: 'Document Test - Presentation ScreenKit',
    mime_type: 'application/vnd.google-apps.document',
    folder_path: 'CRM - Documents',
    content: 'ScreenKit est un ecran interactif pour machines de distribution automatique.\n\nCaracteristiques :\n- Ecran tactile 21 pouces\n- Compatible toutes machines\n- Interface personnalisable\n- Analytics en temps reel\n\nPrix : Sur devis, a partir de 1500€ HT.\n\nAvantages :\n- Augmente les ventes de 30%\n- Modernise l\'image de la machine\n- Permet la publicite dynamique',
    url: 'https://docs.google.com/document/d/test',
    last_modified: new Date().toISOString(),
  };

  var response = UrlFetchApp.fetch(DRIVE_CONFIG.WEBHOOK_URL, {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'x-webhook-secret': DRIVE_CONFIG.WEBHOOK_SECRET,
    },
    payload: JSON.stringify([testDoc]),
    muteHttpExceptions: true,
  });

  Logger.log('Status: ' + response.getResponseCode());
  Logger.log('Response: ' + response.getContentText());
}
