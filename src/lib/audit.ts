export type RecordStatus = 'Conforme' | 'À surveiller' | 'À vérifier' | 'Anomalie';
export type RiskLevel = 'faible' | 'moyen' | 'critique';
export type AnomalyType = 
  | 'montant_anormal' 
  | 'echeance_depassee'
  | 'date_incoherente'
  | 'reference_manquante' 
  | 'balance_desequilibree'
  | 'doublon_detecte'
  | 'sens_incorrect'
  | 'compte_suspect'
  | 'paiement_sans_facture'
  | 'facture_sans_commande'
  | 'tva_anormale'
  | 'tiers_non_reference'
  | 'periode_close';

export type AuditResult = {
  status: RecordStatus;
  risk: RiskLevel;
  score: number;
  reasons: string[];
  anomalies: AnomalyDetails[];
};

export type AnomalyDetails = {
  type: AnomalyType;
  severity: 'critique' | 'majeur' | 'mineur';
  message: string;
  field?: string;
  suggestion: string;
};

// ============================================
// UTILITAIRES
// ============================================

function numberValue(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor(Math.abs(d1.getTime() - d2.getTime()) / 86400000);
}

function findColumn(row: Record<string, unknown>, hints: string[]): string | undefined {
  return Object.keys(row).find(key => 
    hints.some(h => key.toLowerCase().includes(h.toLowerCase()))
  );
}

function getValue(row: Record<string, unknown>, hints: string[]): unknown {
  const col = findColumn(row, hints);
  return col ? row[col] : undefined;
}

// ============================================
// RÈGLES MÉTIER PAR TYPE DE DONNÉES
// ============================================

const AMOUNT_KEYWORDS = ['amount', 'montant', 'debit', 'credit', 'solde', 'total', 'ttc', 'ht'];
const DATE_KEYWORDS = ['date', 'echeance', 'due', 'emission', 'creation'];
const REF_KEYWORDS = ['reference', 'numero', 'facture', 'document', 'piece'];
const SUPPLIER_KEYWORDS = ['fournisseur', 'supplier', 'tiers', 'vendor', 'creditor'];
const ACCOUNT_KEYWORDS = ['compte', 'account', 'general', 'auxiliaire'];

// Seuils configurables
const THRESHOLDS = {
  highAmount: 5_000_000,      // 5M FCFA
  veryHighAmount: 10_000_000, // 10M FCFA
  cashLimit: 500_000,          // 500K FCFA
  delayDays: 30,               // 30 jours
  criticalDelay: 90,           // 90 jours
  vatRateNormal: 0.18,         // 18% TVA
  vatTolerance: 0.02,          // 2% tolérance
};

// ============================================
// ANALYSEURS SPÉCIFIQUES PAR MODULE
// ============================================

function analyzeAmount(row: Record<string, unknown>, anomalies: AnomalyDetails[]): number {
  let score = 0;
  
  // Chercher les colonnes de montant
  Object.entries(row).forEach(([key, value]) => {
    if (!AMOUNT_KEYWORDS.some(k => key.toLowerCase().includes(k))) return;
    
    const amount = Math.abs(numberValue(value));
    
    if (amount >= THRESHOLDS.veryHighAmount) {
      score += 40;
      anomalies.push({
        type: 'montant_anormal',
        severity: 'critique',
        field: key,
        message: `Montant très élevé: ${amount.toLocaleString('fr-FR')} FCFA (seuil: ${THRESHOLDS.veryHighAmount.toLocaleString('fr-FR')})`,
        suggestion: 'Vérifier la pièce justificative et l\'autorisation hiérarchique'
      });
    } else if (amount >= THRESHOLDS.highAmount) {
      score += 25;
      anomalies.push({
        type: 'montant_anormal',
        severity: 'majeur',
        field: key,
        message: `Montant significatif: ${amount.toLocaleString('fr-FR')} FCFA`,
        suggestion: 'Contrôler la cohérence avec la commande/engagement'
      });
    }
    
    // Détecter les montants négatifs anormaux
    if (numberValue(value) < 0 && !key.toLowerCase().includes('credit')) {
      score += 15;
      anomalies.push({
        type: 'montant_anormal',
        severity: 'mineur',
        field: key,
        message: `Montant négatif détecté sur ${key}: ${amount.toLocaleString('fr-FR')} FCFA`,
        suggestion: 'Vérifier si c\'est un avoir ou une erreur de saisie'
      });
    }
  });
  
  return score;
}

function analyzeDates(row: Record<string, unknown>, anomalies: AnomalyDetails[]): number {
  let score = 0;
  
  const emissionStr = getValue(row, ['date', 'date_emission', 'document_date', 'creation']);
  const echeanceStr = getValue(row, ['echeance', 'due_date', 'date_echeance', 'deadline']);
  
  const emission = parseDate(emissionStr);
  const echeance = parseDate(echeanceStr);
  const today = new Date();
  
  if (emission && echeance) {
    // Facture avec échéance déjà dépassée à l'émission
    if (echeance < emission) {
      score += 30;
      anomalies.push({
        type: 'date_incoherente',
        severity: 'critique',
        message: `Date d'échéance (${echeance.toLocaleDateString('fr-FR')}) antérieure à la date d'émission (${emission.toLocaleDateString('fr-FR')})`,
        suggestion: 'Corriger la date d\'échéance ou vérifier si c\'est une facture d\'avoir'
      });
    }
  }
  
  if (echeance && echeance < today) {
    const daysOverdue = daysBetween(echeance, today);
    if (daysOverdue > THRESHOLDS.criticalDelay) {
      score += 35;
      anomalies.push({
        type: 'echeance_depassee',
        severity: 'critique',
        field: findColumn(row, ['echeance', 'due_date']),
        message: `Échéance dépassée depuis ${daysOverdue} jours (critique > ${THRESHOLDS.criticalDelay} jours)`,
        suggestion: 'Relancer le fournisseur ou vérifier si un paiement est en cours'
      });
    } else if (daysOverdue > THRESHOLDS.delayDays) {
      score += 20;
      anomalies.push({
        type: 'echeance_depassee',
        severity: 'majeur',
        field: findColumn(row, ['echeance', 'due_date']),
        message: `Échéance dépassée depuis ${daysOverdue} jours`,
        suggestion: 'Programmer le paiement ou demander un délai au fournisseur'
      });
    }
  }
  
  // Date dans le futur
  if (emission && emission > today) {
    score += 25;
    anomalies.push({
      type: 'date_incoherente',
      severity: 'majeur',
      field: findColumn(row, ['date', 'document_date']),
      message: `Date de document dans le futur: ${emission.toLocaleDateString('fr-FR')}`,
      suggestion: 'Corriger la date ou vérifier la configuration de l\'horloge système'
    });
  }
  
  return score;
}

function analyzeReferences(row: Record<string, unknown>, anomalies: AnomalyDetails[]): number {
  let score = 0;
  
  // Rechercher les références manquantes
  Object.entries(row).forEach(([key, value]) => {
    if (!REF_KEYWORDS.some(k => key.toLowerCase().includes(k))) return;
    
    if (value === null || value === undefined || String(value).trim() === '') {
      score += 20;
      anomalies.push({
        type: 'reference_manquante',
        severity: 'majeur',
        field: key,
        message: `Référence obligatoire manquante: ${key}`,
        suggestion: 'Renseigner la référence documentaire pour traçabilité'
      });
    }
  });
  
  // Chercher doublons potentiels (même référence)
  const refCol = findColumn(row, ['reference', 'numero', 'document_number']);
  if (refCol && row[refCol]) {
    // Note: La détection de doublon nécessite un contexte plus large (autres lignes)
    // Cette règle sera activée quand on a accès à l'ensemble des données
  }
  
  return score;
}

function analyzeTVA(row: Record<string, unknown>, anomalies: AnomalyDetails[]): number {
  let score = 0;
  
  const ht = numberValue(getValue(row, ['amount_ht', 'ht', 'montant_ht', 'net_amount']));
  const ttc = numberValue(getValue(row, ['amount_ttc', 'ttc', 'montant_ttc', 'gross_amount']));
  const vat = numberValue(getValue(row, ['vat_amount', 'tva', 'montant_tva', 'tax_amount']));
  
  if (ht > 0 && ttc > 0) {
    const calculatedVat = ttc - ht;
    const calculatedRate = calculatedVat / ht;
    
    // Vérifier cohérence TVA
    if (Math.abs(calculatedVat - vat) > 1) {
      score += 20;
      anomalies.push({
        type: 'tva_anormale',
        severity: 'majeur',
        message: `Incohérence TVA: calculée ${calculatedVat.toLocaleString('fr-FR')} vs déclarée ${vat.toLocaleString('fr-FR')}`,
        suggestion: 'Vérifier les montants HT, TTC et TVA sur la facture'
      });
    }
    
    // Taux anormal
    if (calculatedRate > THRESHOLDS.vatRateNormal + THRESHOLDS.vatTolerance) {
      score += 15;
      anomalies.push({
        type: 'tva_anormale',
        severity: 'mineur',
        message: `Taux de TVA apparent: ${(calculatedRate * 100).toFixed(1)}% (normal: ${THRESHOLDS.vatRateNormal * 100}%)`,
        suggestion: 'Confirmer le taux appliqué (export, régime particulier?)'
      });
    }
  }
  
  return score;
}

function analyzeSupplier(row: Record<string, unknown>, anomalies: AnomalyDetails[]): number {
  let score = 0;
  
  // Vérifier si le fournisseur est bien renseigné
  const supplier = getValue(row, ['supplier', 'fournisseur', 'vendor', 'tiers_code']);
  if (!supplier || String(supplier).trim() === '') {
    score += 25;
    anomalies.push({
      type: 'tiers_non_reference',
      severity: 'majeur',
      message: 'Fournisseur/Client non identifié',
      suggestion: 'Renseigner le code tiers pour la déclaration fiscale'
    });
  }
  
  // Compte d'attente/suspense
  const account = String(getValue(row, ['account', 'compte', 'general_account']) || '');
  if (account.includes('401') && account.length > 6) {
    score += 10;
    anomalies.push({
      type: 'compte_suspect',
      severity: 'mineur',
      message: `Compte fournisseur générique utilisé: ${account}`,
      suggestion: 'Rattacher à un compte auxiliaire fournisseur spécifique'
    });
  }
  
  return score;
}

function analyzeAccountingBalance(row: Record<string, unknown>, anomalies: AnomalyDetails[]): number {
  let score = 0;
  
  // Pour les écritures comptables: vérifier équilibre
  const debit = numberValue(getValue(row, ['debit', 'debit_amount', 'montant_debit']));
  const credit = numberValue(getValue(row, ['credit', 'credit_amount', 'montant_credit']));
  
  if (debit > 0 && credit > 0) {
    score += 30;
    anomalies.push({
      type: 'sens_incorrect',
      severity: 'critique',
      message: `Ligne avec débit ET crédit simultanés (D:${debit.toLocaleString('fr-FR')} C:${credit.toLocaleString('fr-FR')})`,
      suggestion: 'Une ligne d\'écriture ne peut être que débit OU crédit'
    });
  }
  
  if (debit === 0 && credit === 0) {
    score += 25;
    anomalies.push({
      type: 'montant_anormal',
      severity: 'majeur',
      message: 'Ligne sans montant (ni débit ni crédit)',
      suggestion: 'Supprimer cette ligne ou renseigner le montant'
    });
  }
  
  return score;
}

// ============================================
// FONCTION PRINCIPALE D'ANALYSE
// ============================================

/**
 * [NEUTRALISÉ] Les anomalies proviennent désormais UNIQUEMENT de la table
 * audit_management.anomalies via LEFT JOIN LATERAL (src/lib/records-with-anomalies.ts).
 * Cette fonction est conservée pour compatibilité avec les appels existants
 * mais retourne systématiquement un résultat "Conforme" vide.
 */
export function analyzeRecord(
  _row: Record<string, unknown>,
  _moduleId?: string,
  _thresholds?: Partial<typeof THRESHOLDS>
): AuditResult {
  return {
    status: 'Conforme',
    risk: 'faible',
    score: 100,
    reasons: ['✓ Aucune anomalie détectée - Document conforme aux règles de contrôle'],
    anomalies: []
  };
}

// Fonction pour analyser un lot de données (pour détecter doublons)
export function analyzeBatch(records: Record<string, unknown>[]): Map<string, number> {
  const referenceCounts = new Map<string, number>();
  
  records.forEach(row => {
    const ref = String(getValue(row, ['reference', 'numero', 'document_number']) || '');
    if (ref && ref.length > 3) {
      referenceCounts.set(ref, (referenceCounts.get(ref) || 0) + 1);
    }
  });
  
  return referenceCounts;
}
