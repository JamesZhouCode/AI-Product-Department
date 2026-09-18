import { normalize } from '../../shared/text';

export const BANK_RELATION_OPTIONS = [
  { value: 'none', label: '未标记' },
  { value: 'contacted', label: '营销中' },
  { value: 'customer', label: '我行客户' },
  { value: 'credit', label: '我行授信客户' },
];

export const BANK_RELATION_LABELS = Object.fromEntries(
  BANK_RELATION_OPTIONS.map((option) => [option.value, option.label]),
);

export function bankRelationFor(company, overrides = {}) {
  const key = normalize(company?.name);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  const bank = company?.bank || {};
  if (['none', 'contacted', 'customer', 'credit'].includes(bank.relationshipStatus))
    return bank.relationshipStatus;
  if (bank.isCreditCustomer) return 'credit';
  if (bank.isOurCustomer) return 'customer';
  return 'none';
}
