export type RecordStatus = 'Conforme' | 'À surveiller' | 'À vérifier' | 'Anomalie';
export type RiskLevel = 'faible' | 'moyen' | 'critique';

export type AuditResult = {
  status: RecordStatus;
  risk: RiskLevel;
  score: number;
  reasons: string[];
};

const amountHints = ['amount', 'montant', 'debit', 'credit', 'balance', 'solde', 'local_amount', 'payment_amount', 'amount_incl_tax'];
const dateHints = ['date', 'due', 'echeance'];
const missingRefHints = ['document', 'invoice', 'payment', 'reference', 'piece', 'number'];

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function analyzeRecord(row: Record<string, unknown>, thresholds = { highAmount: 5_000_000, cashLimit: 500_000, delayDays: 60 }): AuditResult {
  let score = 0;
  const reasons: string[] = [];
  const keys = Object.keys(row);

  for (const key of keys) {
    const lower = key.toLowerCase();
    const value = row[key];

    if (amountHints.some((h) => lower.includes(h))) {
      const n = Math.abs(numberValue(value));
      if (n >= thresholds.highAmount) {
        score += 30;
        reasons.push(`Montant élevé sur ${key}: ${n.toLocaleString('fr-FR')}`);
      }
    }

    if (missingRefHints.some((h) => lower.includes(h)) && (value === null || value === undefined || value === '')) {
      score += 15;
      reasons.push(`Référence manquante: ${key}`);
    }

    if (lower.includes('suspense') || lower.includes('attente') || String(value).toLowerCase().includes('suspense')) {
      score += 25;
      reasons.push(`Compte ou indicateur d’attente/suspense détecté: ${key}`);
    }

    if (String(value).toLowerCase().includes('blocked') || String(value).toLowerCase().includes('bloqué') || String(value).toLowerCase().includes('rejected')) {
      score += 25;
      reasons.push(`Statut bloquant détecté: ${key}`);
    }

    if (dateHints.some((h) => lower.includes(h)) && value) {
      const d = new Date(String(value));
      if (!Number.isNaN(d.getTime())) {
        const age = Math.floor((Date.now() - d.getTime()) / 86400000);
        if (lower.includes('due') && age > thresholds.delayDays) {
          score += 25;
          reasons.push(`Échéance dépassée de ${age} jours`);
        }
      }
    }
  }

  const serialized = JSON.stringify(row).toLowerCase();
  if (serialized.includes('cash') || serialized.includes('caisse') || serialized.includes('espèce')) {
    const maxAmount = Math.max(...keys.map((k) => Math.abs(numberValue(row[k]))));
    if (maxAmount > thresholds.cashLimit) {
      score += 20;
      reasons.push('Mouvement caisse/espèces supérieur au seuil.');
    }
  }

  if (!reasons.length) reasons.push('Aucune alerte majeure détectée selon les règles V1.');

  const status: RecordStatus = score >= 60 ? 'Anomalie' : score >= 35 ? 'À vérifier' : score >= 15 ? 'À surveiller' : 'Conforme';
  const risk: RiskLevel = score >= 60 ? 'critique' : score >= 30 ? 'moyen' : 'faible';

  return { status, risk, score, reasons };
}
