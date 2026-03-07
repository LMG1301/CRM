# Boost CRM - Configuration n8n

## Pre-requis

1. **n8n** installe (cloud ou self-hosted)
   - Cloud : https://n8n.io (plan gratuit disponible)
   - Self-hosted : `npx n8n` ou Docker

2. **Compte Gmail** avec OAuth2 configure dans n8n

3. **Variables d'environnement n8n** a configurer :
   ```
   SUPABASE_URL=https://qbypfqpwrrtzntxgouww.supabase.co
   SUPABASE_ANON_KEY=<votre cle anon supabase>
   MY_EMAIL=<votre adresse gmail>
   ```

## Workflows disponibles

### 01 - Gmail Sync (Batch)
**Fichier** : `01-gmail-sync.json`
**Fonction** : Synchronise les emails des dernieres 24h toutes les 15 minutes
**Flow** : Schedule → Gmail API → Transform → Supabase (upsert emails)
**Setup** :
1. Importer le workflow dans n8n
2. Configurer les credentials Gmail OAuth2
3. Remplacer `GMAIL_CREDENTIAL_ID` par l'ID de vos credentials
4. Activer le workflow

### 02 - Auto Follow-up Reminders
**Fichier** : `02-auto-followup.json`
**Fonction** : Envoie un email recap chaque matin avec les actions du jour
**Flow** : Schedule (8h) → Supabase (prospects overdue) → Build recap → Gmail send
**Setup** :
1. Importer le workflow dans n8n
2. Configurer les credentials Gmail
3. Activer le workflow

### 03 - Webhook Log Activity
**Fichier** : `03-webhook-log-activity.json`
**Fonction** : Endpoint webhook pour logger des activites depuis n'importe quelle source
**Flow** : Webhook POST → Supabase (insert activity) → Response
**Usage** :
```bash
curl -X POST https://votre-n8n.com/webhook/boost-crm-activity \
  -H "Content-Type: application/json" \
  -d '{
    "prospect_id": "uuid-du-prospect",
    "type": "meeting",
    "content": "Reunion de presentation ScreenKit",
    "metadata": { "source": "manual", "duration": "45min" }
  }'
```

### 04 - New Email → Auto Activity
**Fichier** : `04-new-email-auto-activity.json`
**Fonction** : Detecte les nouveaux emails, les associe aux prospects, et cree automatiquement des activites
**Flow** : Gmail Trigger → Parse → Find Prospect → Upsert email + Create activity + Update last contact
**Setup** :
1. Importer le workflow dans n8n
2. Configurer les credentials Gmail
3. Activer le workflow

## Migration Supabase

Avant d'activer les workflows, executez la migration SQL :

1. Allez dans Supabase Dashboard → SQL Editor
2. Copiez-collez le contenu de `supabase/migration-v2-integrations.sql`
3. Executez la requete

## Architecture

```
┌─────────────────┐     ┌──────────┐     ┌──────────────┐
│   Gmail          │────→│   n8n    │────→│   Supabase   │
│   LinkedIn       │     │ (moteur) │     │  (database)  │
│   Transcriptions │     └──────────┘     └──────┬───────┘
│   Presentations  │                              │
└─────────────────┘                      ┌───────┴────────┐
                                         │  Boost CRM UI  │
                                         │  (Next.js)     │
                                         └────────────────┘
```

## Types d'activites supportes

| Type | Source | Description |
|------|--------|-------------|
| `email_sent` | Gmail/n8n | Email envoye |
| `email_received` | Gmail/n8n | Email recu |
| `call` | Manuel | Appel telephone |
| `note` | Manuel | Note libre |
| `transcription` | n8n/Manuel | Transcription d'appel |
| `linkedin_interaction` | n8n | Interaction LinkedIn |
| `presentation` | Manuel/n8n | Presentation commerciale |
| `meeting` | n8n/Manuel | Reunion |
