// ─── Classification / analysis quick actions ───

export const classificationQuickActions = {
  nextAction: () =>
    `Analyse ce prospect et son historique. Quelle est la meilleure prochaine action a faire ? Donne une recommandation claire et actionnable.`,

  summary: () =>
    `Fais un resume concis de ce prospect : qui c'est, ou on en est dans le process, et les points cles de l'historique des echanges.`,
} as const
