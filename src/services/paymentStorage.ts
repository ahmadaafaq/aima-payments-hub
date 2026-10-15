import { INITIAL_TRANSACTIONS } from '../data/aimaApplications';
import { TransactionRecord } from '../types/payment';

const STORAGE_KEY = 'aima_payment_hub_transactions_v1';

export function getStoredTransactions(): TransactionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TRANSACTIONS));
      return INITIAL_TRANSACTIONS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_TRANSACTIONS;
  } catch {
    return INITIAL_TRANSACTIONS;
  }
}

export function saveTransaction(record: TransactionRecord): TransactionRecord[] {
  const existing = getStoredTransactions();
  const index = existing.findIndex((t) => t.id === record.id);
  let updated: TransactionRecord[];
  if (index >= 0) {
    updated = [...existing];
    updated[index] = record;
  } else {
    updated = [record, ...existing];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save transaction to localStorage:', err);
  }
  return updated;
}

export function resetDemoTransactions(): TransactionRecord[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TRANSACTIONS));
  } catch (err) {
    console.error('Failed to reset demo transactions:', err);
  }
  return INITIAL_TRANSACTIONS;
}

export function getTransactionById(id: string): TransactionRecord | undefined {
  const list = getStoredTransactions();
  return list.find((t) => t.id === id);
}

export function getTransactionsByApplication(appId: string): TransactionRecord[] {
  const list = getStoredTransactions();
  return list.filter((t) => t.applicationId === appId);
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
