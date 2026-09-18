import { useEffect, useState } from 'react';
import { readStorageObject } from '../../shared/storage';

const STORAGE_KEYS = {
  bankRelations: 'industry-map-bank-relations-v2',
  marketingRecords: 'industry-map-marketing-records-v2',
  companyTags: 'industry-map-company-tags-v2',
};

const LEGACY_STORAGE_KEYS = {
  bankRelations: 'ic-bank-relations-v1',
  marketingRecords: 'ic-marketing-records-v1',
  companyTags: 'ic-company-tags-v1',
};

function readMigratedObject(key, legacyKey) {
  const current = readStorageObject(key);
  if (Object.keys(current).length) return current;
  return readStorageObject(legacyKey);
}

function usePersistedObject(key, legacyKey) {
  const [value, setValue] = useState(() => readMigratedObject(key, legacyKey));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local persistence is best effort when storage is unavailable or full.
    }
  }, [key, value]);

  return [value, setValue];
}

export function usePersistedCompanyEdits() {
  const [bankRelationOverrides, setBankRelationOverrides] = usePersistedObject(
    STORAGE_KEYS.bankRelations,
    LEGACY_STORAGE_KEYS.bankRelations,
  );
  const [marketingRecords, setMarketingRecords] = usePersistedObject(
    STORAGE_KEYS.marketingRecords,
    LEGACY_STORAGE_KEYS.marketingRecords,
  );
  const [companyTagOverrides, setCompanyTagOverrides] = usePersistedObject(
    STORAGE_KEYS.companyTags,
    LEGACY_STORAGE_KEYS.companyTags,
  );

  return {
    bankRelationOverrides,
    companyTagOverrides,
    marketingRecords,
    setBankRelationOverrides,
    setCompanyTagOverrides,
    setMarketingRecords,
  };
}
